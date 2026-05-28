import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");
const cdpPort = readFlag("--cdp-port") ?? process.env.REALM_CDP_PORT;
const session = `realm-web-smoke-${Date.now()}`;
const outputDir = path.join(os.tmpdir(), session);

if (!cdpPort) {
  console.error("Set REALM_CDP_PORT or pass --cdp-port from the dedicated /chrome-cdp instance.");
  process.exit(1);
}

await ensureCommand("agent-browser");
await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);
await mkdir(outputDir, { recursive: true });

const projectDir = await mkdtemp(path.join(os.tmpdir(), "realm-web-project-"));
await cp(examplePath, projectDir, { recursive: true });

const port = await findAvailablePort(3897);
const url = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  ["bun", "run", cliPath, "open", "--runtime", "fake", "--no-open", "--port", String(port)],
  {
    cwd: projectDir,
    stderr: "pipe",
    stdout: "pipe",
  },
);

try {
  await waitForHttp(`${url}/api/health`);
  await browser("connect", cdpPort);
  await browser("set", "viewport", "1440", "900");
  await browser("open", url);
  await browser("wait", "[data-testid='world-manager']");
  await browserEval("localStorage.setItem('realm-locale', 'en'); true;");
  await browser("reload");
  await browser("wait", "[data-testid='world-manager']");
  await screenshot("world-manager.png");
  await assertPage(
    "World Manager renders create-world first screen",
    "document.querySelector(\"[data-testid='world-manager']\")?.textContent?.includes('Create World') === true",
  );

  await browser("click", "[data-testid='create-world-primary']");
  await browser("wait", "[data-testid='create-world-name']");
  await browser("fill", "[data-testid='create-world-name']", "Smoke Realm");
  await browser("click", "[data-testid='create-world-preview']");
  await browser("wait", "[data-testid='patch-preview']");
  await browser("click", "[data-testid='config-patch-apply']");
  await browser("wait", "[data-testid='wechat-status-bar']");
  await screenshot("workspace-after-create.png");
  await assertPage(
    "Created world opens the messenger workspace",
    "document.documentElement.textContent.includes('Smoke Realm')",
  );
  await assertPage(
    "Group conversations render a WeChat-style 3x3 avatar grid",
    "document.querySelector(\"[data-testid='group-avatar-grid']\")?.querySelectorAll(\"[data-testid='group-avatar-cell']\").length === 9",
  );
  await assertPage(
    "Workspace top bar exposes role run, Settings, and God Controller controls",
    "document.querySelector(\"[data-testid='role-turn-run']\") !== null && document.querySelector(\"[data-testid='topbar-settings']\") !== null && document.querySelector(\"[data-testid='topbar-god']\") !== null",
  );

  await browser("click", "[data-testid='topbar-settings']");
  await browser("wait", "body");
  await assertPage("Top bar opens Settings", "document.body.innerText.includes('Settings')");
  await browser("press", "Escape");
  await browser("wait", "200");

  await browser("click", "[data-testid='topbar-god']");
  await browser("wait", "body");
  await assertPage(
    "Top bar opens God Controller",
    "document.body.innerText.includes('God Controller')",
  );
  await browser("fill", "[data-testid='god-action-reason']", "Smoke adjudication");
  const godTargetRoleId = await pageText("[data-testid='god-action-target-role-id']");
  await browser("fill", "[data-testid='god-action-confirmation']", godTargetRoleId);
  await browser("click", "[data-testid='god-action-apply']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='god-action-result']\") !== null",
  );
  await assertPage(
    "God Controller applies an audited state action",
    "document.querySelector(\"[data-testid='god-action-result']\")?.textContent?.includes('state v') === true",
  );
  await screenshot("god-action-result.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  await browser("click", "[data-testid='role-turn-run']");
  await waitForPageExpression(
    "(() => { const status = document.querySelector(\"[data-testid='role-turn-status']\")?.textContent ?? ''; return status.includes('Role is running') || status.includes('Role run needs attention'); })()",
  );
  await assertPage(
    "Top bar run role exposes live running or retry state",
    "document.querySelector(\"[data-testid='role-turn-cancel']\") !== null || document.querySelector(\"[data-testid='role-turn-retry']\") !== null",
  );
  await browserEval(
    "(() => { const cancel = document.querySelector(\"[data-testid='role-turn-cancel']\"); if (cancel && !cancel.disabled) cancel.click(); return true; })()",
  );
  await browser("wait", "300");

  await browser("press", "Control+k");
  await browser("wait", "body");
  await browser("click", "[data-testid='command-ask-assistant']");
  await browser("wait", "[data-testid='assistant-config-goal']");
  await browser("fill", "[data-testid='assistant-config-goal']", "Add a QA role");
  await browser("click", "[data-testid='assistant-config-preview']");
  await browser("wait", "[data-testid='patch-preview']");
  await assertPage(
    "Config assistant previews a reviewed patch",
    "document.querySelector(\"[data-testid='patch-preview']\")?.textContent?.includes('QA') === true",
  );
  await screenshot("assistant-config-preview.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  await browser("click", "[data-testid='sidebar-create-room']");
  await browser("wait", "[data-testid='create-room-name']");
  await browser("fill", "[data-testid='create-room-name']", "Smoke Room");
  await browser("click", "[data-testid='create-room-member-leijun']");
  await browser("click", "[data-testid='create-room-submit']");
  await waitForPageExpression("document.body.innerText.includes('Smoke Room')");
  await screenshot("room-created.png");

  const message = `web smoke ${Date.now()}`;
  await browser("fill", "[data-testid='message-input']", message);
  await browser("press", "Enter");
  await browser("wait", "500");
  await assertPage(
    "Composer sends a visible message",
    `document.body.innerText.includes(${JSON.stringify(message)})`,
  );

  await ensureComposerTrayOpen();
  await browser("click", "[data-testid='identity-role-leijun']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='identity-confirmation']\") !== null",
  );
  await clickInPage("[data-testid='confirm-identity-takeover']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='impersonation-banner']\") !== null",
  );
  await assertPage(
    "Role takeover confirmation switches speaking identity",
    "document.querySelector(\"[data-testid='impersonation-banner']\")?.textContent?.includes('Lei Jun') === true",
  );
  const roleMessage = `role smoke ${Date.now()}`;
  await browser("fill", "[data-testid='message-input']", roleMessage);
  await browser("press", "Enter");
  await browser("wait", "500");
  await assertPage(
    "Role takeover sends a visible audited message",
    `document.body.innerText.includes(${JSON.stringify(roleMessage)})`,
  );
  await assertPage(
    "Every visible chat message has an avatar",
    'Array.from(document.querySelectorAll("article[data-message-id]")).every((article) => article.querySelector("[data-testid=\'identity-avatar\']") !== null)',
  );
  await assertPage(
    "Incoming and outgoing bubbles use WeChat white and green colors",
    "(() => { const incoming = document.querySelector(\"article[data-author='assistant'] [data-testid='message-bubble']\"); const outgoing = document.querySelector(\"article[data-author='user'] [data-testid='message-bubble']\"); if (!incoming || !outgoing) return false; const inBg = getComputedStyle(incoming).backgroundColor; const outBg = getComputedStyle(outgoing).backgroundColor; return inBg === 'rgb(255, 255, 255)' && outBg === 'rgb(149, 236, 105)'; })()",
  );
  await assertPage(
    "Chat bubbles expose visible room visibility metadata",
    "(() => { const chips = document.querySelector(\"article[data-message-id] [data-testid='message-visibility'] [data-testid='visibility-chips']\"); if (!chips) return false; const style = getComputedStyle(chips); return style.display !== 'none' && style.visibility !== 'hidden' && chips.textContent?.includes('Visible to:') === true; })()",
  );
  await screenshot("role-takeover.png");

  await ensureComposerTrayOpen();
  await browser("click", "[data-testid='operator-settings']");
  await browser("wait", "body");
  await assertPage("Top bar opens Settings", "document.body.innerText.includes('Settings')");
  await browser("press", "Escape");
  await browser("wait", "200");

  await ensureComposerTrayOpen();
  await browser("click", "[data-testid='operator-god']");
  await browser("wait", "body");
  await assertPage(
    "Composer tray opens God Controller",
    "document.body.innerText.includes('God Controller')",
  );
  await browser("press", "Escape");
  await browser("wait", "200");

  await browser("press", "Control+k");
  await browser("wait", "body");
  await assertPage(
    "Command palette opens from keyboard",
    "document.body.innerText.includes('Realm Command Palette')",
  );
  await screenshot("command-palette.png");
  await browser("press", "Escape");
  await browser("set", "viewport", "390", "844");
  await browser("wait", "300");
  await assertPage(
    "Mobile workspace has no horizontal overflow",
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
  );
  await screenshot("mobile-workspace.png");

  await browser("close");
  console.log(`Web UI smoke passed. Screenshots: ${outputDir}`);
} finally {
  await tryBrowser("close");
  server.kill();
  await drain(server.stdout);
  await drain(server.stderr);
  await rm(projectDir, { force: true, recursive: true });
}

async function browser(...args: string[]): Promise<string> {
  return run(["agent-browser", ...args, "--session", session]);
}

async function tryBrowser(...args: string[]): Promise<string | undefined> {
  try {
    return await browser(...args);
  } catch {
    return undefined;
  }
}

async function screenshot(fileName: string): Promise<void> {
  await browser("screenshot", path.join(outputDir, fileName));
}

async function browserEval(source: string): Promise<string> {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return browser("eval", "-b", encoded);
}

async function clickInPage(selector: string): Promise<void> {
  const source = `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Missing selector: ${selector}");
      element.click();
      return true;
    })();
  `;
  await browserEval(source);
}

async function pageText(selector: string): Promise<string> {
  const result = await browserEval(
    `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`,
  );
  return result.trim().replace(/^"|"$/g, "");
}

async function ensureComposerTrayOpen(): Promise<void> {
  const result = await browserEval(
    "document.querySelector(\"[data-testid='composer-action-tray']\") !== null",
  );
  if (result.includes("true")) {
    return;
  }
  await browser("click", "[data-testid='composer-more']");
  await browser("wait", "[data-testid='composer-action-tray']");
}

async function assertPage(label: string, expression: string): Promise<void> {
  const result = await browserEval(expression);
  if (!result.includes("true")) {
    throw new Error(`${label} failed. Result: ${result}`);
  }
}

async function waitForPageExpression(expression: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const result = await browserEval(expression);
    if (result.includes("true")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for page expression: ${expression}`);
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

async function run(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, { stderr: "pipe", stdout: "pipe" });
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

async function ensureCommand(command: string): Promise<void> {
  const checker = os.platform() === "win32" ? "where" : "which";
  const args = [checker, command];
  await run(args);
}

async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port near ${start}`);
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

function readFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}
