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
  if (cdpPort) {
    await browser("connect", cdpPort);
  }
  await browser("set", "viewport", "1440", "900");
  await browser("open", url);
  await waitForSelector("[data-testid='world-manager']");
  await browserEval("localStorage.setItem('realm-locale', 'en'); true;");
  await browser("reload");
  await waitForSelector("[data-testid='world-manager']");
  await screenshot("world-manager.png");
  await assertPage(
    "World Manager renders create-world first screen",
    "document.querySelector(\"[data-testid='world-manager']\")?.textContent?.includes('Create World') === true",
  );

  await clickInPage("[data-testid='create-world-primary']");
  await waitForSelector("[data-testid='create-world-name']");
  await browser("fill", "[data-testid='create-world-name']", "Smoke Realm");
  await clickInPage("[data-testid='create-world-preview']");
  await waitForSelector("[data-testid='patch-preview']");
  await clickInPage("[data-testid='config-patch-apply']");
  await waitForSelector("[data-testid='wechat-status-bar']");
  await screenshot("workspace-after-create.png");
  await assertPage(
    "Created world opens the messenger workspace",
    "document.documentElement.textContent.includes('Smoke Realm')",
  );
  await assertPage(
    "First viewport exposes project, world, room, identity, and running state",
    "(() => { const title = document.querySelector(\"[data-testid='chat-title']\")?.textContent ?? ''; const project = document.querySelector(\"[data-testid='context-project']\")?.textContent?.trim() ?? ''; const world = document.querySelector(\"[data-testid='context-world']\")?.textContent?.trim() ?? ''; const identity = document.querySelector(\"[data-testid='context-identity']\")?.textContent?.trim() ?? ''; const running = document.querySelector(\"[data-testid='context-running-state']\")?.textContent ?? ''; return title.includes('All Hands') && project.length > 0 && world.length > 0 && identity.includes('Boss') && running.includes('Ready'); })()",
  );
  await assertPage(
    "Empty WeChat transcript stays blank instead of showing dashboard copy",
    "!document.body.innerText.includes('No messages yet') && !document.body.innerText.includes('Send a message to start')",
  );
  await assertPage(
    "Group conversations render real member avatars inside a WeChat-style grid",
    "(() => { const grid = document.querySelector(\"[data-testid='group-avatar-grid']\"); const count = grid?.querySelectorAll(\"[data-testid='group-avatar-cell']\").length ?? 0; return count > 0 && count <= 9; })()",
  );
  await assertPage(
    "Conversation list rows keep WeChat avatar/title/preview/time structure",
    "(() => { const rows = Array.from(document.querySelectorAll(\"[data-chat-row='conversation'][data-wechat-row='conversation']\")); return rows.length > 0 && rows.every((row) => row.querySelector(\"[data-wechat-avatar='person'], [data-wechat-avatar='group']\") !== null && Boolean(row.textContent?.trim())); })()",
  );
  await assertPage(
    "Group avatars are laid out as a real WeChat member collage",
    "(() => { const grid = document.querySelector(\"[data-testid='group-avatar-grid']\"); if (!grid) return false; const cells = grid.querySelectorAll(\"[data-testid='group-avatar-cell']\").length; const rows = grid.querySelectorAll(\"[data-testid='group-avatar-row']\").length; return grid.getAttribute('data-wechat-grid') === 'member-collage' && rows > 0 && rows <= 3 && cells > 0 && cells <= 9; })()",
  );
  await assertPage(
    "Default messenger keeps Realm admin chrome off the WeChat chat surface",
    "document.querySelector(\"[data-testid='role-turn-strip']\") === null && document.querySelector(\"[data-testid='impersonation-banner']\") === null",
  );
  await ensureComposerTrayOpen();
  await assertPage(
    "WeChat plus tray exposes role run, Settings, God Controller, and World Inspector controls",
    "document.querySelector(\"[data-testid='role-turn-run']\") !== null && document.querySelector(\"[data-testid='operator-settings']\") !== null && document.querySelector(\"[data-testid='operator-god']\") !== null && document.querySelector(\"[data-testid='operator-world-inspector']\") !== null",
  );
  await closeComposerTray();

  await clickInPage("[data-testid='sidebar-tab-roles']");
  await waitForSelector("[data-testid='role-row-leijun']");
  await clickInPage("[data-testid='role-row-leijun']");
  await waitForSelector("[data-testid='role-inspector-sheet']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='role-memory-content']\")?.textContent?.includes('Loading') === false",
  );
  await clickInPage("[data-testid='role-inspector-capabilities-tab']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='role-capability-summary']\") !== null",
  );
  await assertPage(
    "Role inspector exposes memory and capability policy from the messenger contacts flow",
    "document.querySelector(\"[data-testid='role-inspector-sheet']\")?.textContent?.includes('Capabilities') === true && document.querySelector(\"[data-testid='role-capability-summary']\") !== null",
  );
  await screenshot("role-inspector.png");
  await browser("press", "Escape");
  await clickInPage("[data-testid='sidebar-tab-chats']");

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='operator-settings']");
  await waitForSelector("body");
  await assertPage("Plus tray opens Settings", "document.body.innerText.includes('Settings')");
  await browser("press", "Escape");
  await browser("wait", "200");

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='operator-god']");
  await waitForSelector("body");
  await assertPage(
    "Plus tray opens God Controller",
    "document.body.innerText.includes('God Controller')",
  );
  await browser("fill", "[data-testid='god-action-reason']", "Smoke adjudication");
  const godTargetRoleId = await pageText("[data-testid='god-action-target-role-id']");
  await browser("fill", "[data-testid='god-action-confirmation']", godTargetRoleId);
  await clickInPage("[data-testid='god-action-apply']");
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

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='operator-world-inspector']");
  await waitForSelector("[data-testid='world-inspector-sheet']");
  await assertPage(
    "World Inspector exposes current state as a secondary sheet",
    "document.querySelector(\"[data-testid='world-state-json']\")?.textContent?.trim().startsWith('{') === true",
  );
  await clickInPage("[data-testid='world-inspector-events-tab']");
  await waitForSelector("[data-testid='world-event-timeline']");
  await assertPage(
    "World Inspector exposes recent events as a secondary sheet",
    "document.querySelector(\"[data-testid='world-event-timeline']\") !== null",
  );
  await screenshot("world-inspector.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='role-turn-run']");
  await waitForPageExpression(
    "(() => { const status = document.querySelector(\"[data-testid='role-turn-status']\")?.textContent ?? ''; return status.includes('Role is running') || status.includes('Role run needs attention'); })()",
  );
  await assertPage(
    "Plus tray run role exposes live running or retry state",
    "document.querySelector(\"[data-testid='role-turn-cancel']\") !== null || document.querySelector(\"[data-testid='role-turn-retry']\") !== null",
  );
  await browserEval(
    "(() => { const cancel = document.querySelector(\"[data-testid='role-turn-cancel']\"); if (cancel && !cancel.disabled) cancel.click(); return true; })()",
  );
  await browser("wait", "300");

  await browser("press", "Control+k");
  await waitForSelector("body");
  await clickInPage("[data-testid='command-ask-assistant']");
  await waitForSelector("[data-testid='assistant-config-goal']");
  await browser("fill", "[data-testid='assistant-config-goal']", "Add a QA role");
  await clickInPage("[data-testid='assistant-config-preview']");
  await waitForSelector("[data-testid='patch-preview']");
  await assertPage(
    "Config assistant previews a reviewed patch",
    "document.querySelector(\"[data-testid='patch-preview']\")?.textContent?.includes('QA') === true",
  );
  await assertPage(
    "Config patch preview shows semantic review and apply-time conflict status",
    "document.querySelector(\"[data-testid='config-patch-semantic']\")?.textContent?.includes('Checked again when applying') === true",
  );
  await clickInPage("[data-testid='config-patch-tab-raw']");
  await assertPage(
    "Config patch preview exposes raw diff",
    "document.querySelector(\"[data-testid='config-patch-raw-diff']\")?.textContent?.includes('diff --realm') === true",
  );
  await screenshot("assistant-config-preview.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  await clickInPage("[data-testid='sidebar-create-room']");
  await waitForSelector("[data-testid='create-room-name']");
  await browser("fill", "[data-testid='create-room-name']", "Smoke Room");
  await clickInPage("[data-testid='create-room-member-leijun']");
  await clickInPage("[data-testid='create-room-submit']");
  await waitForPageExpression("document.body.innerText.includes('Smoke Room')");
  await screenshot("room-created.png");

  const message = `web smoke ${Date.now()}`;
  await browser("fill", "[data-testid='message-input']", message);
  await assertPage(
    "Composer replaces the WeChat plus button with Send while typing",
    "(() => { const more = document.querySelector(\"[data-testid='composer-more']\"); const send = document.querySelector(\"[data-testid='composer-send']\"); if (!more || !send) return false; return getComputedStyle(more).display === 'none' && getComputedStyle(send).display !== 'none'; })()",
  );
  await browser("press", "Enter");
  await browser("wait", "500");
  await assertPage(
    "Composer sends a visible message",
    `document.body.innerText.includes(${JSON.stringify(message)})`,
  );
  await assertPage(
    "Composer restores the WeChat plus button after sending",
    "(() => { const more = document.querySelector(\"[data-testid='composer-more']\"); if (!more) return false; return getComputedStyle(more).display !== 'none'; })()",
  );
  await assertPage(
    "Composer keeps the WeChat bottom input grammar",
    "(() => { const composer = document.querySelector(\"[data-testid='composer']\"); const input = document.querySelector(\"[data-testid='message-input']\"); if (!composer || !input) return false; const composerStyle = getComputedStyle(composer); const inputStyle = getComputedStyle(input); return composerStyle.backgroundColor === 'rgb(247, 247, 247)' && inputStyle.backgroundColor === 'rgb(255, 255, 255)' && inputStyle.borderRadius === '4px'; })()",
  );

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='identity-role-leijun']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='identity-confirmation']\") !== null",
  );
  await clickInPage("[data-testid='confirm-identity-takeover']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='composer-action-tray']\") === null",
  );
  await ensureComposerTrayOpen();
  await assertPage(
    "Role takeover confirmation switches speaking identity",
    "document.querySelector(\"[data-testid='identity-role-leijun']\")?.getAttribute('aria-current') === 'true'",
  );
  await closeComposerTray();
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
    "Chat bubble actions keep visibility metadata off the default WeChat surface",
    "(() => { const tools = document.querySelector(\"article[data-message-id] [data-testid='message-bubble-tools']\"); const chips = document.querySelector(\"article[data-message-id] [data-testid='message-visibility'] [data-testid='visibility-chips']\"); if (!tools || !chips) return false; const style = getComputedStyle(tools); return style.display !== 'none' && style.opacity === '0' && chips.textContent?.includes('Visible to:') === true; })()",
  );
  await screenshot("role-takeover.png");

  await clickInPage("[data-testid='sidebar-tab-worlds']");
  await waitForSelector("[data-world-row='world']");
  await browserEval(
    "(() => { const target = Array.from(document.querySelectorAll(\"[data-world-row='world']\")).find((row) => row.getAttribute('data-selected') !== 'true'); if (!target) throw new Error('Need a second world for identity reset smoke'); target.click(); return true; })()",
  );
  await ensureComposerTrayOpen();
  await assertPage(
    "Switching worlds resets the speaking identity back to Boss",
    "document.querySelector(\"[data-testid='identity-owner']\")?.getAttribute('aria-current') === 'true'",
  );
  await screenshot("world-switch-identity-reset.png");
  await clickInPage("[data-testid='sidebar-tab-chats']");

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='operator-settings']");
  await waitForSelector("body");
  await assertPage("Composer tray opens Settings", "document.body.innerText.includes('Settings')");
  await browser("press", "Escape");
  await browser("wait", "200");

  await ensureComposerTrayOpen();
  await clickInPage("[data-testid='operator-god']");
  await waitForSelector("body");
  await assertPage(
    "Composer tray opens God Controller",
    "document.body.innerText.includes('God Controller')",
  );
  await browser("press", "Escape");
  await browser("wait", "200");

  await browser("press", "Control+k");
  await waitForSelector("body");
  await assertPage(
    "Command palette opens from keyboard",
    "document.body.innerText.includes('Realm Command Palette') && document.body.innerText.includes('World Inspector')",
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
  await browserEval("localStorage.setItem('realm-locale', 'zh-CN'); true;");
  await browser("reload");
  await waitForPageExpression("document.querySelector(\"[data-testid='world-manager']\") !== null");
  await browserEval(
    "(() => { const row = document.querySelector(\"[data-testid^='world-row-']\"); if (!row) throw new Error('Missing world row after zh-CN reload'); row.click(); return true; })()",
  );
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='wechat-status-bar']\") !== null",
  );
  await assertPage(
    "Chinese mobile workspace has no horizontal overflow",
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
  );
  await assertPage(
    "Chinese mobile workspace renders localized WeChat chrome",
    "document.querySelector(\"[data-testid='message-input']\")?.getAttribute('placeholder') === '消息'",
  );
  await screenshot("mobile-workspace-zh-CN.png");

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
      if (element instanceof HTMLElement) element.focus();
      const pointerOptions = { bubbles: true, button: 0, cancelable: true, pointerType: "mouse" };
      const mouseOptions = { bubbles: true, button: 0, cancelable: true };
      element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
      element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
      element.dispatchEvent(new MouseEvent("mouseup", mouseOptions));
      element.dispatchEvent(new PointerEvent("pointerup", pointerOptions));
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
  await clickInPage("[data-testid='composer-more']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='composer-action-tray']\") !== null",
  );
}

async function closeComposerTray(): Promise<void> {
  const result = await browserEval(
    "document.querySelector(\"[data-testid='composer-action-tray']\") !== null",
  );
  if (!result.includes("true")) {
    return;
  }
  await clickInPage("[data-testid='composer-more']");
  await browser("wait", "200");
}

async function assertPage(label: string, expression: string): Promise<void> {
  const result = await browserEval(expression);
  if (!result.includes("true")) {
    throw new Error(`${label} failed. Result: ${result}`);
  }
}

async function waitForSelector(selector: string): Promise<void> {
  await waitForPageExpression(`document.querySelector(${JSON.stringify(selector)}) !== null`);
}

async function waitForPageExpression(expression: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const result = await browserEval(expression);
      if (result.includes("true")) {
        return;
      }
    } catch {
      // Browser automation can be briefly unavailable during reload.
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
  await run([checker, command]);
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
  if (stream) await new Response(stream).text().catch(() => undefined);
}

function readFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}
