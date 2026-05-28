import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAgentBrowserSmoke,
  drain,
  ensureCommand,
  findAvailablePort,
  readFlag,
} from "./smoke-browser-utils.ts";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");
const cdpPort = readFlag("--cdp-port") ?? process.env.REALM_CDP_PORT;
const session = `realm-web-smoke-${Date.now()}`;
const outputDir = path.join(os.tmpdir(), session);
const {
  assertPage,
  browser,
  browserEval,
  clickInPage,
  closeComposerTray,
  ensureComposerTrayOpen,
  pageText,
  screenshot,
  tryBrowser,
  waitForHttp,
  waitForPageExpression,
  waitForSelector,
} = createAgentBrowserSmoke(session, outputDir);

await ensureCommand("agent-browser");
await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);
await mkdir(outputDir, { recursive: true });

const projectDir = await mkdtemp(path.join(os.tmpdir(), "realm-web-project-"));
await cp(examplePath, projectDir, { recursive: true });
const realmHome = path.join(projectDir, ".realm-home");

const port = await findAvailablePort(3897);
const url = `http://127.0.0.1:${port}`;
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
  await browser("fill", "[data-testid='world-search']", "zz-no-world");
  await waitForSelector("[data-testid='world-search-empty']");
  await assertPage(
    "World Manager search filters the world list in the browser",
    "document.querySelector(\"[data-testid='world-search-empty']\")?.textContent?.includes('No matching worlds') === true",
  );
  await browser("fill", "[data-testid='world-search']", "");

  await clickInPage("[data-testid='create-world-primary']");
  await waitForSelector("[data-testid='create-world-name']");
  await clickInPage("[data-testid='create-world-preset-workflow']");
  await assertPage(
    "Create World templates hydrate the world name and default room",
    "(() => { const name = document.querySelector(\"[data-testid='create-world-name']\"); const room = document.querySelector(\"[data-testid='create-world-room']\"); return name?.value === 'Software Team' && room?.value === 'Standup'; })()",
  );
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
    "WeChat header exposes the room while preserving project, world, identity, and running state for assistive tech",
    "(() => { const title = document.querySelector(\"[data-testid='chat-title']\")?.textContent ?? ''; const project = document.querySelector(\"[data-testid='context-project']\")?.textContent?.trim() ?? ''; const world = document.querySelector(\"[data-testid='context-world']\")?.textContent?.trim() ?? ''; const identity = document.querySelector(\"[data-testid='context-identity']\")?.textContent?.trim() ?? ''; const running = document.querySelector(\"[data-testid='context-running-state']\")?.textContent ?? ''; return title.includes('Standup') && project.length > 0 && world.length > 0 && identity.includes('Boss') && running.includes('Ready'); })()",
  );
  await assertPage(
    "Empty WeChat transcript stays blank instead of showing dashboard copy",
    "!document.body.innerText.includes('No messages yet') && !document.body.innerText.includes('Send a message to start')",
  );
  await assertPage(
    "Group conversations render real member avatars inside a WeChat-style collage",
    "(() => { const grid = document.querySelector(\"[data-testid='group-avatar-grid']\"); const count = grid?.querySelectorAll(\"[data-testid='group-avatar-cell']\").length ?? 0; return count >= 4 && count <= 9; })()",
  );
  await assertPage(
    "Conversation list rows keep WeChat avatar/title/preview/time structure",
    "(() => { const rows = Array.from(document.querySelectorAll(\"[data-chat-row='conversation'][data-wechat-row='conversation']\")); return rows.length > 0 && rows.every((row) => row.querySelector(\"[data-wechat-avatar='person'], [data-wechat-avatar='group']\") !== null && Boolean(row.textContent?.trim())); })()",
  );
  await assertPage(
    "Conversation list keeps WeChat row density and large square avatars",
    "(() => { const row = document.querySelector(\"[data-chat-row='conversation'][data-wechat-row='conversation']\"); const avatar = row?.querySelector(\"[data-wechat-avatar='person'], [data-wechat-avatar='group']\"); if (!row || !avatar) return false; const rowRect = row.getBoundingClientRect(); const avatarRect = avatar.getBoundingClientRect(); return rowRect.height >= 80 && rowRect.height <= 84 && avatarRect.width >= 54 && avatarRect.height >= 54; })()",
  );
  await assertPage(
    "Group avatars are laid out as a WeChat member collage without fake filler people",
    "(() => { const grid = document.querySelector(\"[data-testid='group-avatar-grid']\"); if (!grid) return false; const cells = grid.querySelectorAll(\"[data-testid='group-avatar-cell']\").length; const rows = grid.querySelectorAll(\"[data-testid='group-avatar-row']\").length; return grid.getAttribute('data-wechat-grid') === 'member-collage' && grid.getAttribute('data-wechat-grid-shape') === 'nine-grid' && rows >= 2 && rows <= 3 && cells >= 4 && cells <= 9; })()",
  );
  await assertPage(
    "WeChat avatars render clean monogram initials (or configured images), never emoji/gradient confetti",
    "(() => { const grid = document.querySelector(\"[data-testid='group-avatar-grid']\"); if (!grid) return false; const cells = Array.from(grid.querySelectorAll(\"[data-testid='group-avatar-cell']\")); if (cells.length < 4) return false; return cells.every((cell) => { const kind = cell.getAttribute('data-avatar-kind'); if (kind === 'image') return true; return kind === 'monogram' && Boolean(cell.textContent?.trim()); }); })()",
  );
  await assertPage(
    "WeChat top bar keeps room chrome and assistive project/world/identity/running metadata",
    "(() => { return document.querySelector(\"[data-testid='topbar-more']\") !== null && document.querySelector(\"[data-testid='context-project']\")?.textContent?.trim().length > 0 && document.querySelector(\"[data-testid='context-world']\")?.textContent?.trim().length > 0 && document.querySelector(\"[data-testid='context-identity']\")?.textContent?.includes('Boss') === true && document.querySelector(\"[data-testid='context-running-state']\")?.textContent?.includes('Ready') === true; })()",
  );
  await clickInPage("[data-testid='topbar-more']");
  await assertPage(
    "WeChat More menu exposes Settings, God Controller, inspector, and command actions",
    "document.querySelector(\"[data-testid='topbar-settings']\") !== null && document.querySelector(\"[data-testid='topbar-god']\") !== null && document.querySelector(\"[data-testid='topbar-world-inspector']\") !== null && document.querySelector(\"[data-testid='topbar-command']\") !== null",
  );
  await clickInPage("[data-testid='topbar-settings']");
  await waitForSelector("[data-testid='settings-default-model']");
  await assertPage(
    "WeChat top bar opens functional Settings with provider defaults and config paths",
    "document.querySelector(\"[data-testid='settings-default-provider']\") !== null && document.querySelector(\"[data-testid='settings-provider-list']\") !== null && document.querySelectorAll(\"[data-testid='settings-path-row']\").length === 3",
  );
  await browser("fill", "[data-testid='settings-default-model']", "smoke-model");
  await clickInPage("[data-testid='settings-save']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='settings-save-status']\")?.textContent?.includes('Saved') === true",
  );
  await screenshot("settings-sheet.png");
  await browser("press", "Escape");
  await browser("wait", "200");
  await clickInPage("[data-testid='topbar-more']");
  await clickInPage("[data-testid='topbar-world-inspector']");
  await waitForSelector("[data-testid='world-inspector-sheet']");
  await assertPage(
    "WeChat top bar opens World Inspector",
    "document.querySelector(\"[data-testid='world-state-json']\") !== null",
  );
  await browser("press", "Escape");
  await browser("wait", "200");
  await clickInPage("[data-testid='topbar-more']");
  await clickInPage("[data-testid='topbar-god']");
  await assertPage(
    "WeChat top bar opens God Controller",
    "document.body.innerText.includes('God Controller')",
  );
  await browser("press", "Escape");
  await browser("wait", "200");
  await clickInPage("[data-testid='topbar-more']");
  await clickInPage("[data-testid='topbar-command']");
  await assertPage(
    "WeChat top bar opens command palette",
    "document.body.innerText.includes('Realm Command Palette')",
  );
  await browser("press", "Escape");
  await browser("wait", "200");
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
  await clickInPage("[data-testid='world-inspector-access-tab']");
  await waitForSelector("[data-testid='world-access-audit']");
  await assertPage(
    "World Inspector exposes denied access recovery guidance surface",
    "document.querySelector(\"[data-testid='world-access-audit']\") !== null",
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
  await clickInPage("[data-testid='config-patch-tab-files']");
  await browser(
    "fill",
    "[data-testid='config-patch-edit-content']",
    "version: 1\nid: qa\ndisplayName: QA Smoke\nmodel: default\nprofile:\n  summary: Regression reviewer.\n",
  );
  await clickInPage("[data-testid='config-patch-revise']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='config-patch-edit-content']\")?.value?.includes('QA Smoke') === true",
  );
  await assertPage(
    "Config assistant supports editing a patch and revalidating a new preview",
    "document.querySelector(\"[data-testid='config-patch-edit-content']\")?.value?.includes('QA Smoke') === true",
  );
  await clickInPage("[data-testid='config-patch-tab-raw']");
  await assertPage(
    "Config patch preview exposes raw diff",
    "document.querySelector(\"[data-testid='config-patch-raw-diff']\")?.textContent?.includes('QA Smoke') === true",
  );
  await screenshot("assistant-config-preview.png");
  const qaRolePath = path.join(projectDir, ".agents", "roles", "qa", "role.yaml");
  await mkdir(path.dirname(qaRolePath), { recursive: true });
  await writeFile(
    qaRolePath,
    "version: 1\nid: qa\ndisplayName: Existing QA\nmodel: default\n",
    "utf8",
  );
  await clickInPage("[data-testid='config-patch-apply']");
  await waitForSelector("[data-testid='patch-conflict-resolution']");
  await assertPage(
    "Config patch conflict shows the stale file and proposed diff before any write",
    "(() => { const panel = document.querySelector(\"[data-testid='patch-conflict-resolution']\"); const diff = document.querySelector(\"[data-testid='patch-conflict-diff']\"); return panel?.textContent?.includes('.agents/roles/qa/role.yaml') === true && diff?.textContent?.includes('diff --realm .agents/roles/qa/role.yaml') === true && diff?.textContent?.includes('QA Smoke') === true; })()",
  );
  await screenshot("assistant-config-conflict.png");
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
    "(() => { const composer = document.querySelector(\"[data-testid='composer']\"); const voice = document.querySelector(\"[data-testid='composer-voice']\"); const input = document.querySelector(\"[data-testid='message-input']\"); const emoji = document.querySelector(\"[data-testid='composer-emoji']\"); const more = document.querySelector(\"[data-testid='composer-more']\"); if (!composer || !voice || !input || !emoji || !more) return false; const composerStyle = getComputedStyle(composer); const inputStyle = getComputedStyle(input); return composer.getAttribute('data-wechat-composer') === 'voice-input-emoji-plus-send' && composer.getBoundingClientRect().height >= 88 && composerStyle.backgroundColor === 'rgb(247, 247, 247)' && inputStyle.backgroundColor === 'rgb(255, 255, 255)' && inputStyle.borderRadius === '4px'; })()",
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
  await waitForPageExpression(`document.body.innerText.includes(${JSON.stringify(roleMessage)})`);
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
    "Fallback person avatars stay visually distinct from the outgoing bubble",
    "(() => { const ownerAvatar = document.querySelector(\"article[data-author='user'] [data-wechat-avatar='person']\"); if (!ownerAvatar) return false; const bg = getComputedStyle(ownerAvatar).backgroundColor; return bg !== 'rgb(149, 236, 105)' && bg !== 'rgb(7, 193, 96)'; })()",
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
