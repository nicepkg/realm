import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type FlowDef, resolveCapturePlan } from "./capture-docs-shots-flows.ts";
import {
  createAgentBrowserSmoke,
  drain,
  ensureCommand,
  findAvailablePort,
  readFlag,
} from "./smoke-browser-utils.ts";

/**
 * capture-docs-shots — produce the REAL screenshots the docs flow-showcase
 * renders. It boots the fake-runtime web app against a chosen example project
 * (reusing the smoke-web-ui boot pattern + smoke-browser-utils), then drives the
 * 6 core natural-language flows through the ONE chat window via CDP on a desktop
 * AND a mobile viewport, and writes real PNGs into apps/docs/public/shots/.
 *
 * It is honest by construction: every shot is whatever the live app rendered
 * after typing the exact zh-CN utterance the docs quote. The example is copied
 * to a temp dir with requireTrust disabled so config writes apply without the
 * separate trust dance — the dance is exercised by smoke-web-ui, not here; this
 * script is about showing the NL flows, not the trust gate.
 *
 * The capture target is PARAMETERIZED (see capture-docs-shots-flows.ts): it
 * defaults to examples/cultivation-sim with the docs-bound shot names, but can be
 * pointed at examples/boardroom-saga (a 商战 world) or any project to prove the
 * SAME flows generalize beyond 修真 — keeping the FlowShowcase evidence honest
 * and reproducible.
 *
 * Usage:
 *   bun run scripts/capture-docs-shots.ts                 # cultivation-sim (docs default)
 *   bun run scripts/capture-docs-shots.ts --preset boardroom
 *   bun run scripts/capture-docs-shots.ts --example examples/foo --world foo --prefix foo-
 *   bun run scripts/capture-docs-shots.ts --cdp-port 9222
 *   REALM_CDP_PORT=9222 REALM_CAPTURE_PRESET=boardroom bun run scripts/capture-docs-shots.ts
 */

const DESKTOP = { height: 900, width: 1440 } as const;
const MOBILE = { height: 844, width: 390 } as const;

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const shotsDir = path.join(repoRoot, "apps", "docs", "public", "shots");
const cdpPort = readFlag("--cdp-port") ?? process.env.REALM_CDP_PORT;

const { preset, prefix } = resolveCapturePlan(repoRoot);
const flows = preset.flows;
const worldId = preset.worldId;
const examplePath = preset.exampleDir;
const baseUrlFor = (port: number) => `http://127.0.0.1:${port}`;

const session = `realm-docs-capture-${Date.now()}`;
const driver = createAgentBrowserSmoke(session, shotsDir);
const { browser, browserEval, clickInPage, waitForHttp, waitForPageExpression, waitForSelector } =
  driver;

await ensureCommand("agent-browser");
await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);
await mkdir(shotsDir, { recursive: true });

// Copy the example into a temp project and disable requireTrust so the config
// writes apply without the trust elevation flow (which smoke-web-ui covers).
const projectDir = await mkdtempProject();
await disableRequireTrust(projectDir);
const realmHome = path.join(projectDir, ".realm-home");

const port = await findAvailablePort(4290);
const url = baseUrlFor(port);
const server = Bun.spawn(
  ["bun", "run", cliPath, "open", "--runtime", "fake", "--no-open", "--port", String(port)],
  {
    cwd: projectDir,
    env: { ...process.env, REALM_HOME: realmHome },
    stderr: "pipe",
    stdout: "pipe",
  },
);

try {
  await waitForHttp(`${url}/api/health`);
  if (cdpPort) {
    await browser("connect", cdpPort);
  }

  console.log(`Capturing preset "${preset.id}" against ${examplePath} (world: ${worldId}).`);
  // Desktop pass: drive every flow once, screenshotting the desktop shot for each.
  await runViewport("desktop", DESKTOP, url);
  // Mobile pass: a fresh session (reload) so each flow re-renders on a phone
  // viewport, screenshotting the mobile shot for each.
  await runViewport("mobile", MOBILE, url);

  await browser("close");
  console.log(`Docs shots captured into ${shotsDir} (prefix: "${prefix || "<none>"}").`);
} finally {
  await driver.tryBrowser("close");
  server.kill();
  await drain(server.stdout);
  await drain(server.stderr);
  await rm(projectDir, { force: true, recursive: true }).catch(() => undefined);
}

/**
 * Drive every flow once on a single viewport. Each flow runs against a fresh chat
 * (reload) so its card is captured in isolation, then the viewport-specific PNG
 * is written. The empty chat home is captured first as the hero context shot.
 */
async function runViewport(
  kind: "desktop" | "mobile",
  viewport: { width: number; height: number },
  baseUrl: string,
): Promise<void> {
  await browser("set", "viewport", String(viewport.width), String(viewport.height));
  for (const flow of flows) {
    await openFreshChat(baseUrl);
    await driveFlow(flow);
    await screenshotShot(`${prefix}${flow.shot}-${kind}.png`);
    if (flow.previewOnly && flow.confirm) {
      // The preview was captured; still confirm so the project is left in the
      // post-write state the later flows build on (idempotent on a fresh world).
      await confirmStagedWrite();
    }
  }
}

/** Reload to a clean chat home on the zh-CN default before each flow. */
async function openFreshChat(baseUrl: string): Promise<void> {
  await browser("open", baseUrl);
  await waitForSelector("[data-testid='god-chat-shell']");
  // Force the unconditional zh-CN default deterministically (the docs quote the
  // Chinese utterances) AND pin the active world to the preset's target world —
  // otherwise the create-world flow's confirm permanently switches the workspace
  // into the freshly created EMPTY world, and every later flow (set-rule /
  // add-role / run-turn / god-action / inspect) would run against that empty
  // world instead of the populated target, falling through to inspect and making
  // the evidence dishonest. Seeding "realm:last-world" before reload guarantees
  // each flow re-renders against the real populated world.
  await browserEval(
    `localStorage.removeItem('realm-locale'); localStorage.setItem('realm:last-world', ${JSON.stringify(worldId)}); true;`,
  );
  await browser("reload");
  await waitForSelector("[data-testid='god-chat-shell']");
  await waitForSelector("[data-testid='god-chat-input']");
}

/**
 * Type the flow's utterance into the one chat window, submit, wait for the
 * backend to render its card, and confirm the risky write when the flow stages
 * one (filling the typed-confirmation phrase first). Leaves the rendered result
 * on screen for the screenshot.
 */
async function driveFlow(flow: FlowDef): Promise<void> {
  await browser("fill", "[data-testid='god-chat-input']", flow.utterance);
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='god-chat-send']\")?.disabled === false",
  );
  await clickInPage("[data-testid='god-chat-send']");

  // The operator bubble + the system response (a preview card, a result card, a
  // role-speech bubble, or an inline answer) must land before we screenshot.
  await waitForPageExpression(
    "document.querySelectorAll(\"[data-testid='god-chat-shell'] [data-message-id], [data-testid='god-chat-shell'] article\").length > 0 || document.querySelector(\"[data-testid^='god-chat-card-']\") !== null || document.querySelector(\"[data-testid='god-chat-role-speech']\") !== null",
  );

  if (flow.confirm && !flow.previewOnly) {
    await confirmStagedWrite();
  }
  // Settle: let the result card / streamed reply finish painting before the shot.
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='god-chat-input']\")?.disabled !== true",
  );
  await browser("wait", "400");
}

/**
 * Confirm whatever preview card is live. A config preview requires the typed
 * confirmation phrase (filled via the card's one-tap fill control); other writes
 * (god / run-turn) confirm directly. If no confirm control is present (the
 * backend resolved as a read, or the deterministic router answered inline) this
 * is a no-op so the flow still captures its rendered answer.
 */
async function confirmStagedWrite(): Promise<void> {
  const confirmSelector = await firstPresent([
    "[data-testid='god-chat-card-config-confirm']",
    "[data-testid='god-chat-card-god-confirm']",
    "[data-testid='god-chat-card-run-turn-confirm']",
    "[data-testid='god-chat-card-state-patch-confirm']",
  ]);
  if (!confirmSelector) {
    return;
  }
  // Fill the typed-confirmation phrase when the card demands one (config writes).
  const fillSelector = confirmSelector.replace("-confirm", "-phrase-fill");
  if (await isPresent(fillSelector)) {
    await clickInPage(fillSelector);
  }
  await waitForPageExpression(
    `document.querySelector(${JSON.stringify(confirmSelector)})?.disabled === false`,
  );
  await clickInPage(confirmSelector);
  // The confirm clears the pending proposal and pushes a result card; wait for the
  // preview confirm control to disappear so the shot shows the settled result.
  await waitForPageExpression(
    `document.querySelector(${JSON.stringify(confirmSelector)}) === null`,
  );
}

async function firstPresent(selectors: string[]): Promise<string | undefined> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (await isPresent(selector)) {
        return selector;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return undefined;
}

async function isPresent(selector: string): Promise<boolean> {
  try {
    const result = await browserEval(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    );
    return result.includes("true");
  } catch {
    return false;
  }
}

async function screenshotShot(fileName: string): Promise<void> {
  await browser("screenshot", path.join(shotsDir, fileName));
}

async function mkdtempProject(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "realm-docs-capture-"));
  await cp(examplePath, dir, { recursive: true });
  return dir;
}

/**
 * Flip requireTrust to false in the copied project's config so the NL config
 * writes apply without the trust elevation flow. Tolerant of the field being
 * absent (a template change) — it only rewrites when the flag is present.
 */
async function disableRequireTrust(dir: string): Promise<void> {
  const configPath = path.join(dir, ".agents", "config.yaml");
  try {
    const raw = await readFile(configPath, "utf8");
    if (!raw.includes("requireTrust")) {
      return;
    }
    const next = raw.replace(/requireTrust:\s*true/g, "requireTrust: false");
    await writeFile(configPath, next, "utf8");
  } catch {
    // No config to patch — the server will still boot; config writes may then be
    // trust-gated, which the flow handles gracefully (no-op confirm).
  }
}
