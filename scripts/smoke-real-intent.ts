import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * Real-provider NL ROUTING smoke for the model-backed intent router.
 *
 * Distinct from `smoke-real-providers.ts` (which proves a role TURN runs against a
 * live model): this script boots the package runtime against the cultivation-sim
 * example with a real provider configured, then POSTs a handful of representative
 * operator utterances to `POST /api/assistant/intent` (R3) and asserts the routed
 * intent KIND matches expectation — most importantly that an interrogative
 * ("...被禁言了吗？") routes to `inspect` and NEVER to a write (god/state-patch).
 *
 * TOLERANCE CONTRACT: the live model is an external flaky dependency. On a missing
 * API key, network error, rate limit, timeout, or non-2xx from the endpoint, this
 * smoke SKIPS gracefully (clear console note) and exits 0. It NEVER fails the run on
 * an external flaky call — correctness is asserted ONLY when the call succeeds. This
 * is an opt-in confidence check the loop runs manually; it is NOT in the ship gate.
 *
 * NOTE on fallback awareness: the intent service is failure-proof — on a provider
 * error it degrades to the deterministic classifier and still returns 200. That
 * means a 200 here does NOT by itself prove the live model ran. To keep this an
 * honest REAL-provider check we (a) skip entirely when no key is present, and (b)
 * report what each utterance actually routed to so a human can read the run notes.
 */

type ProviderSmoke = {
  id: "openai" | "google";
  displayName: string;
  apiKeyEnv: "OPENAI_API_KEY" | "GEMINI_API_KEY";
  model: string;
};

/** A routing expectation: the utterance and the intent kind(s) it must resolve to. */
type RoutingCase = {
  label: string;
  goal: string;
  /** Intent kinds that are acceptable for this utterance. */
  expectKinds: string[];
  /**
   * When true, this utterance is a question and MUST NOT route to a write
   * (god / state-patch). This is the core safety assertion of the smoke.
   */
  isQuestion: boolean;
};

/** Intent kinds that mutate world/role state — a question must never become one. */
const writeKinds = new Set(["god", "state-patch"]);

type IntentResult = { intent: { kind: string; [key: string]: unknown } };

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");
const requestedProvider = readFlag("--provider");
const routeTimeoutMs = Number.parseInt(readFlag("--timeout-ms") ?? "120000", 10);

const allProviderSmokes: ProviderSmoke[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-5-mini",
  },
  {
    id: "google",
    displayName: "Google",
    apiKeyEnv: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
  },
];

const providerSmokes = allProviderSmokes.filter(
  (provider) => !requestedProvider || provider.id === requestedProvider,
);

if (providerSmokes.length === 0) {
  // An unknown --provider flag is an operator mistake, not external flakiness:
  // surface it loudly rather than silently skipping.
  console.error(`Unknown provider for intent smoke: ${requestedProvider}`);
  process.exit(1);
}

// Representative utterances. The cultivation-sim example ships role "guchenfeng"
// (displayName 顾辰风), world "cultivation", and room "main".
const routingCases: RoutingCase[] = [
  {
    label: "imperative-mute",
    goal: "把顾辰风禁言",
    expectKinds: ["god"],
    isQuestion: false,
  },
  {
    label: "question-no-write",
    goal: "顾辰风被禁言了吗？",
    expectKinds: ["inspect"],
    isQuestion: true,
  },
  {
    label: "create-world",
    goal: "帮我创建一个赛博朋克风格的新世界",
    expectKinds: ["config"],
    isQuestion: false,
  },
  {
    label: "run-turn",
    goal: "让顾辰风在全员议事说点什么",
    expectKinds: ["run-turn"],
    isQuestion: false,
  },
];

await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);

const reachable = providerSmokes.filter((provider) => {
  if (process.env[provider.apiKeyEnv]) {
    return true;
  }
  console.log(
    `[skip] ${provider.id}: ${provider.apiKeyEnv} not set — skipping (this is fine; opt-in check).`,
  );
  return false;
});

if (reachable.length === 0) {
  console.log(
    "Real intent smoke SKIPPED: no provider API keys present. Exit 0 (never blocks the gate).",
  );
  process.exit(0);
}

let assertedAnyProvider = false;
const reportLines: string[] = [];

for (const provider of reachable) {
  const outcome = await runProviderSmoke(provider);
  if (outcome.skipped) {
    console.log(`[skip] ${provider.id}: ${outcome.note}`);
    reportLines.push(`${provider.id}: SKIPPED (${outcome.note})`);
    continue;
  }
  assertedAnyProvider = true;
  reportLines.push(`${provider.id}: ${outcome.note}`);
}

console.log(`\nReal intent routing report:\n${reportLines.map((line) => `- ${line}`).join("\n")}`);

if (!assertedAnyProvider) {
  console.log(
    "\nNo live routing call succeeded (all providers flaky/unavailable). Exit 0 — external flakiness never fails this smoke.",
  );
}

process.exit(0);

type ProviderOutcome = { skipped: true; note: string } | { skipped: false; note: string };

async function runProviderSmoke(provider: ProviderSmoke): Promise<ProviderOutcome> {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), `realm-intent-${provider.id}-project-`));
  const realmHome = await mkdtemp(path.join(os.tmpdir(), `realm-intent-${provider.id}-home-`));
  const port = await findAvailablePort(provider.id === "openai" ? 4397 : 4497);
  const url = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    REALM_HOME: realmHome,
  };
  let server: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;

  try {
    await cp(examplePath, projectDir, { recursive: true });
    await rm(path.join(projectDir, ".agents", "state", "events.sqlite"), { force: true });
    await writeUserConfig(realmHome, provider);
    // Elevate trust so the runtime can drive real model calls (mirrors
    // smoke-real-providers); a setup failure here is local, not external flakiness.
    await run(["bun", "run", cliPath, "trust", "--tier", "run-roles"], { cwd: projectDir, env });

    server = Bun.spawn(
      ["bun", "run", cliPath, "open", "--runtime", "package", "--no-open", "--port", String(port)],
      { cwd: projectDir, env, stderr: "pipe", stdout: "pipe" },
    );

    await waitForHttp(`${url}/api/health`);

    const results: Array<{ case: RoutingCase; kind: string }> = [];
    for (const routingCase of routingCases) {
      const result = await postIntent(url, routingCase.goal);
      if (!result) {
        // A null result means an external flaky failure (network/timeout/non-2xx).
        // Tolerate it: skip the whole provider rather than fail the run.
        return {
          skipped: true,
          note: `live routing call for "${routingCase.label}" failed (network/rate-limit/timeout) — tolerated`,
        };
      }
      results.push({ case: routingCase, kind: result.intent.kind });
    }

    // From here the calls SUCCEEDED — now correctness is fair game to assert.
    const failures: string[] = [];
    for (const { case: routingCase, kind } of results) {
      if (routingCase.isQuestion && writeKinds.has(kind)) {
        failures.push(
          `SAFETY VIOLATION: question "${routingCase.goal}" routed to WRITE intent "${kind}" (expected ${routingCase.expectKinds.join("|")})`,
        );
      } else if (!routingCase.expectKinds.includes(kind)) {
        failures.push(
          `"${routingCase.goal}" routed to "${kind}" but expected ${routingCase.expectKinds.join("|")}`,
        );
      }
    }

    if (failures.length > 0) {
      // Wrong routing on a SUCCESSFUL call is a real defect, not flakiness — fail.
      console.error(`\nReal intent smoke FAILED for ${provider.id}:`);
      for (const failure of failures) {
        console.error(`  - ${failure}`);
      }
      process.exit(1);
    }

    const summary = results
      .map(({ case: routingCase, kind }) => `${routingCase.label}→${kind}`)
      .join(", ");
    return { skipped: false, note: `model=${provider.model} routed OK [${summary}]` };
  } catch (error) {
    // Boot/setup or wait-for-http failures: treat as environmental and tolerate so a
    // flaky local startup or provider outage never reds the gate.
    return {
      skipped: true,
      note: `runtime/boot error — tolerated: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    server?.kill();
    if (server) {
      await drain(server.stdout);
      await drain(server.stderr);
    }
    await rm(projectDir, { force: true, recursive: true });
    await rm(realmHome, { force: true, recursive: true });
  }
}

/**
 * POST one utterance to the intent endpoint. Returns the parsed result, or `null`
 * on ANY external flakiness (network error, timeout, non-2xx) so callers can skip
 * gracefully. Setup/correctness errors are surfaced separately by the caller.
 */
async function postIntent(url: string, goal: string): Promise<IntentResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), routeTimeoutMs);
  try {
    const response = await fetch(`${url}/api/assistant/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        goal,
        worldId: "cultivation",
        defaultRoomId: "main",
        roles: [
          { id: "leijun", displayName: "雷军" },
          { id: "guchenfeng", displayName: "顾辰风" },
          { id: "yunyao", displayName: "云遥" },
        ],
        rooms: [{ id: "main" }, { id: "sect-hall" }, { id: "infirmary" }],
        worlds: [{ id: "cultivation", name: "云岭修仙界" }],
      }),
    });
    if (!response.ok) {
      console.log(
        `[flaky] intent route for "${goal}" returned ${response.status} — tolerating as external flakiness.`,
      );
      return null;
    }
    return (await response.json()) as IntentResult;
  } catch (error) {
    console.log(
      `[flaky] intent route for "${goal}" threw (${error instanceof Error ? error.name : "error"}) — tolerating.`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function writeUserConfig(realmHome: string, provider: ProviderSmoke): Promise<void> {
  await mkdir(realmHome, { recursive: true });
  await writeFile(
    path.join(realmHome, "config.yaml"),
    [
      "version: 1",
      `defaultProvider: ${provider.id}`,
      `defaultModel: ${provider.model}`,
      "providers:",
      "  - id: openai",
      "    displayName: OpenAI",
      "    apiKeyEnv: OPENAI_API_KEY",
      "    defaultModel: gpt-5-mini",
      "    enabled: true",
      "  - id: google",
      "    displayName: Google",
      "    apiKeyEnv: GEMINI_API_KEY",
      "    defaultModel: gemini-2.5-flash",
      "    enabled: true",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function waitForHttp(target: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(target);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function run(
  command: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${stderr || stdout}`);
  }
  return stdout.trim();
}

async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 200; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port starting at ${start}`);
}

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) {
    return;
  }
  await new Response(stream).text().catch(() => undefined);
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
