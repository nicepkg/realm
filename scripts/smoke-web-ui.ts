import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAgentBrowserSmoke,
  drain,
  ensureCommand,
  findAvailablePort,
  readFlag,
} from "./smoke-browser-utils.ts";

/**
 * End-to-end browser smoke for the rebuilt Web UI. It drives the real product
 * against the bundled `cultivation-sim` example (which ships a ready world), so
 * the happy path exercises *enter an existing world* rather than the brittle
 * create-world patch-apply flow. It covers the owner's hard requirements for the
 * rebuild: world manager renders, zh-CN is the unconditional default, you can
 * enter a world, send via the always-present Send button and see the message,
 * a role turn reaches a terminal state, the account switcher exists, a
 * collapsible section toggles, the top bar has no fake device chrome, and the
 * layout is responsive without horizontal overflow.
 *
 * Radix dropdowns/popovers need a full pointer-event sequence to open under
 * automation; `clickInPage` (in smoke-browser-utils) dispatches that sequence,
 * so dialogs/dropdowns are driven through it rather than a bare `.click()`.
 */
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

  // 1. World manager renders on the unconditional zh-CN default. The smoke
  //    forces the default deterministically by clearing any saved locale and
  //    reloading; the i18n layer must then first-paint Chinese (zh-CN) even on
  //    an en-locale automation browser. This guards "明明是中文产品，界面却满屏英文".
  await waitForSelector("[data-testid='world-manager']");
  await browserEval("localStorage.removeItem('realm-locale'); true;");
  await browser("reload");
  await waitForSelector("[data-testid='world-manager']");
  await screenshot("world-manager.png");
  await assertPage(
    "World Manager defaults to the zh-CN locale on first paint",
    "document.documentElement.lang === 'zh-CN'",
  );
  await assertPage(
    "World Manager renders the create-world entry and the bundled world row",
    "document.querySelector(\"[data-testid='create-world-primary']\") !== null && document.querySelector(\"[data-testid='world-row-cultivation']\") !== null",
  );

  // 2. The world search filters the manager list down to an empty state.
  await browser("fill", "[data-testid='world-search']", "zz-no-such-world");
  await waitForSelector("[data-testid='world-search-empty']");
  await assertPage(
    "World Manager search filters the world list to an empty state",
    "document.querySelector(\"[data-testid='world-search-empty']\") !== null && document.querySelector(\"[data-testid='world-row-cultivation']\") === null",
  );
  // Reload to clear the search box deterministically (the controlled input is
  // not reliably reset to empty through the automation fill API), returning the
  // manager to its full list on the persisted zh-CN default.
  await browser("reload");
  await waitForSelector("[data-testid='world-row-cultivation']");

  // 3. Entering the world swaps the manager for the responsive messenger shell
  //    with its rail, conversation list, and chat pane. The all-hands room is
  //    auto-selected so the chat header carries the room + operator context.
  await clickInPage("[data-testid='world-row-cultivation']");
  await waitForSelector("[data-testid='realm-shell']");
  await waitForSelector("[data-testid='chat-header']");
  await screenshot("workspace.png");
  await assertPage(
    "Entering the world opens the three-column messenger shell (rail + list + chat)",
    "document.querySelector(\"[data-testid='app-rail']\") !== null && document.querySelector(\"[data-testid='conversation-list']\") !== null && document.querySelector(\"[data-testid='chat-panel']\") !== null",
  );
  await assertPage(
    "Chat header exposes the room title plus project / world / running-state context (identity lives on the composer Send label, not duplicated here)",
    "(() => { const title = document.querySelector(\"[data-testid='chat-title']\")?.textContent ?? ''; const project = document.querySelector(\"[data-testid='context-project']\")?.textContent?.trim() ?? ''; const world = document.querySelector(\"[data-testid='context-world']\")?.textContent?.trim() ?? ''; const running = document.querySelector(\"[data-testid='context-running-state']\")?.textContent ?? ''; return title.includes('全员议事') && project.length > 0 && world.includes('云岭修仙界') && running.trim().length > 0; })()",
  );

  // 4. NO fake device chrome: the rebuilt shell is a real responsive app, not a
  //    phone mock. There must be no simulated status bar / clock / battery.
  await assertPage(
    "Workspace shows no fake device chrome (no status bar, clock, or battery)",
    "(() => { if (document.querySelector(\"[data-testid='wechat-status-bar']\")) return false; const header = document.querySelector(\"[data-testid='chat-header']\")?.textContent ?? ''; if (/\\b\\d{1,2}:\\d{2}\\b/.test(header)) return false; const shellText = (document.querySelector(\"[data-testid='realm-shell']\")?.firstElementChild?.textContent ?? '').slice(0, 24); return !/\\b\\d{1,2}:\\d{2}\\b/.test(shellText); })()",
  );

  // 5. The account switcher (Boss persona + every world role) opens from the
  //    rail trigger as a real popover with the owner account marked current.
  await clickInPage("[data-testid='account-switcher-trigger']");
  await waitForSelector("[data-testid='account-switcher']");
  await assertPage(
    "Account switcher lists the Boss persona and the world roles with Boss current",
    "(() => { const owner = document.querySelector(\"[data-testid='account-option-owner']\"); const roles = document.querySelectorAll(\"[data-testid^='account-option-']\").length; return owner?.getAttribute('aria-current') === 'true' && document.querySelector(\"[data-testid='account-option-leijun']\") !== null && roles >= 4; })()",
  );
  await screenshot("account-switcher.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  // 6. A conversation-list section collapses and expands (real pin/collapse
  //    semantics, not decorative). The groups section is present for this world.
  await waitForSelector("[data-testid='section-toggle-groups']");
  await assertPage(
    "Groups section starts expanded with its body rendered",
    "document.querySelector(\"[data-testid='section-toggle-groups']\")?.getAttribute('aria-expanded') === 'true' && document.querySelector(\"[data-testid='section-body-groups']\") !== null",
  );
  await clickInPage("[data-testid='section-toggle-groups']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='section-body-groups']\") === null",
  );
  await assertPage(
    "Toggling the groups section collapses it and hides its body",
    "document.querySelector(\"[data-testid='section-toggle-groups']\")?.getAttribute('aria-expanded') === 'false' && document.querySelector(\"[data-testid='section-body-groups']\") === null",
  );
  await clickInPage("[data-testid='section-toggle-groups']");
  await waitForSelector("[data-testid='section-body-groups']");

  // 7. The composer's Send button is ALWAYS present (the direct fix for "发消息
  //    全无响应"): disabled+muted on an empty draft, enabled when there is text.
  //    Sending via the SEND BUTTON posts the message and clears the draft.
  await assertPage(
    "Composer keeps the localized WeChat input grammar (emoji + 消息 input + Send)",
    "(() => { const composer = document.querySelector(\"[data-testid='composer']\"); const emoji = document.querySelector(\"[data-testid='composer-emoji']\"); const input = document.querySelector(\"[data-testid='message-input']\"); const send = document.querySelector(\"[data-testid='composer-send']\"); if (!composer || !emoji || !input || !send) return false; return input.getAttribute('placeholder') === '消息'; })()",
  );
  await assertPage(
    "Send button is present but disabled on an empty draft",
    "document.querySelector(\"[data-testid='composer-send']\")?.disabled === true",
  );
  const message = `web smoke ${Date.now()}`;
  await browser("fill", "[data-testid='message-input']", message);
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='composer-send']\")?.disabled === false",
  );
  await assertPage(
    "Typing a draft enables the Send button",
    "document.querySelector(\"[data-testid='composer-send']\")?.disabled === false",
  );
  await clickInPage("[data-testid='composer-send']");
  await waitForPageExpression(`document.body.innerText.includes(${JSON.stringify(message)})`);
  await assertPage(
    "Clicking the Send button posts a visible message",
    `(() => { const visible = document.body.innerText.includes(${JSON.stringify(message)}); const owned = Array.from(document.querySelectorAll("article[data-author='user'] [data-testid='message-bubble']")).some((bubble) => bubble.textContent?.includes(${JSON.stringify(message)})); return visible && owned; })()`,
  );
  await assertPage(
    "Sending clears the draft and re-disables the Send button",
    "(() => { const input = document.querySelector(\"[data-testid='message-input']\"); const send = document.querySelector(\"[data-testid='composer-send']\"); return input?.value === '' && send?.disabled === true; })()",
  );
  await assertPage(
    "Every rendered chat message carries an author avatar",
    'Array.from(document.querySelectorAll("article[data-message-id]")).every((article) => article.querySelector("[data-testid=\'identity-avatar\']") !== null)',
  );
  await screenshot("message-sent.png");

  // 8. Running a role turn is NOT a casual chat action, so the idle composer
  //    deliberately does not leak an admin run button onto every message
  //    (DISC-R6-3). Its standing idle entry point is the command palette, which
  //    enforces the exact same gate and always routes through the preview
  //    confirmation before any turn starts (Don Norman: error prevention). The
  //    fake runtime resolves a turn deterministically end-to-end, so once
  //    confirmed it must reach a terminal state — the in-flight composer Cancel,
  //    a completed/ready run, or a recoverable retry — never a perpetual spinner.
  await clickInPage("[data-testid='topbar-more']");
  await waitForSelector("[data-testid='topbar-command-palette']");
  await clickInPage("[data-testid='topbar-command-palette']");
  await waitForSelector("[data-testid='command-run-role']");
  await assertPage(
    "Command palette exposes the gated Run-Role action (idle run entry point, not the composer)",
    "document.querySelector(\"[data-testid='command-run-role']\") !== null",
  );
  await assertPage(
    "The Run-Role action is enabled (the selected role is a member of the all-hands room)",
    "(() => { const item = document.querySelector(\"[data-testid='command-run-role']\"); return item !== null && item.getAttribute('aria-disabled') !== 'true' && item.getAttribute('data-disabled') !== 'true'; })()",
  );
  // cmdk drives selection through its keyboard store, not raw pointer clicks:
  // filter the list down to the run action, then commit with Enter the same way
  // an operator would. This exercises the real Enter-driven path the preview
  // gate is built to protect.
  await browser("fill", "[data-testid='command-palette-input']", "run selected role turn");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='command-run-role'][data-selected='true']\") !== null",
  );
  await browser("press", "Enter");
  // The palette closes itself, then surfaces the shared run-turn preview so a
  // turn never starts on an accidental Enter (single focused confirmation).
  await waitForSelector("[data-testid='run-turn-preview-confirm']");
  await assertPage(
    "Running a role turn first opens the preview confirmation (no direct-execute path)",
    "document.querySelector(\"[data-testid='run-turn-preview']\") !== null",
  );
  await clickInPage("[data-testid='run-turn-preview-confirm']");
  const roleTurnTerminalExpression =
    "(document.querySelector(\"[data-testid='role-turn-cancel']\") !== null || document.querySelector(\"[data-testid='role-turn-run']\") !== null || document.querySelector(\"[data-testid='role-turn-retry']\") !== null)";
  await waitForPageExpression(roleTurnTerminalExpression);
  await assertPage(
    "Running a role turn reaches a live, completed, or recoverable state (never a perpetual spinner)",
    roleTurnTerminalExpression,
  );
  await browserEval(
    "(() => { const cancel = document.querySelector(\"[data-testid='role-turn-cancel']\"); if (cancel && !cancel.disabled) cancel.click(); return true; })()",
  );
  await browser("wait", "300");
  await screenshot("role-turn.png");

  // 8b. Contacts follow the WeChat mental model: TAPPING a role opens that
  //     role's chat (resolve-or-create DM), and inspection lives on a secondary
  //     trailing info affordance (DISC-R7-3). From the inspector, "Run turn" is
  //     not a dead-end — it stages the role, closes the sheet, and opens the same
  //     gated run-turn preview every other surface uses (DISC-R7-2 / MC-R7-3).
  await clickInPage("[data-testid='rail-contacts']");
  await waitForSelector("[data-testid='role-row-leijun']");
  await assertPage(
    "Contacts list renders role rows with a secondary inspect affordance (not the primary tap)",
    "document.querySelector(\"[data-testid='role-row-leijun']\") !== null && document.querySelector(\"[data-testid='role-row-leijun-inspect']\") !== null",
  );
  // PRIMARY tap opens the role's chat and lands the messenger in it.
  await clickInPage("[data-testid='role-row-leijun']");
  await waitForSelector("[data-testid='chat-panel']");
  await waitForPageExpression(
    "(document.querySelector(\"[data-testid='chat-title']\")?.textContent ?? '').includes('雷军')",
  );
  await assertPage(
    "Tapping a contact opens that role's chat (WeChat mental model), not the inspector",
    "(() => { const title = document.querySelector(\"[data-testid='chat-title']\")?.textContent ?? ''; const inspectorOpen = document.querySelector(\"[data-testid='role-inspector-sheet']\") !== null; return title.includes('雷军') && !inspectorOpen; })()",
  );
  // SECONDARY affordance opens the inspector instead of the chat.
  await clickInPage("[data-testid='rail-contacts']");
  await waitForSelector("[data-testid='role-row-leijun-inspect']");
  await clickInPage("[data-testid='role-row-leijun-inspect']");
  await waitForSelector("[data-testid='role-inspector-sheet']");
  await waitForSelector("[data-testid='role-inspector-profile-tab']");
  await clickInPage("[data-testid='role-inspector-profile-tab']");
  await waitForSelector("[data-testid='role-inspector-run-turn']");
  await assertPage(
    "Inspector Run Turn is enabled for a role that is a member of the current room",
    "(() => { const button = document.querySelector(\"[data-testid='role-inspector-run-turn']\"); return button !== null && button.disabled !== true && document.querySelector(\"[data-testid='role-inspector-run-turn-block']\") === null; })()",
  );
  // Inspector "Run turn" stages the role, closes the sheet, and opens the SAME
  // gated preview confirmation — never a silent dead-end.
  await clickInPage("[data-testid='role-inspector-run-turn']");
  await waitForSelector("[data-testid='run-turn-preview-confirm']");
  await assertPage(
    "Inspector Run Turn opens the shared run-turn preview (no silent dead-end)",
    "document.querySelector(\"[data-testid='run-turn-preview']\") !== null",
  );
  await browser("press", "Escape");
  await browser("wait", "200");
  await screenshot("contacts-role-flow.png");
  // Return to Chats so the remaining steps run against the messenger as before.
  await clickInPage("[data-testid='rail-chats']");
  await waitForSelector("[data-testid='chat-header']");

  // 9. The chat-header "more" menu gates the operator surfaces (World Inspector,
  //    God Controller, Settings) — God stays behind the menu, never a chat row.
  //    Opening Settings and saving must report a confirmed Saved state.
  await clickInPage("[data-testid='topbar-more']");
  await waitForSelector("[data-testid='topbar-settings']");
  await assertPage(
    "Chat header more-menu exposes World Inspector, God Controller, and Settings",
    "document.querySelector(\"[data-testid='topbar-world-inspector']\") !== null && document.querySelector(\"[data-testid='topbar-god']\") !== null && document.querySelector(\"[data-testid='topbar-settings']\") !== null",
  );
  await clickInPage("[data-testid='topbar-settings']");
  await waitForSelector("[data-testid='settings-default-model']");
  await assertPage(
    "Settings sheet renders provider defaults and a saveable model field",
    "document.querySelector(\"[data-testid='settings-default-provider']\") !== null && document.querySelector(\"[data-testid='settings-provider-list']\") !== null && document.querySelector(\"[data-testid='settings-save']\") !== null",
  );
  await browser("fill", "[data-testid='settings-default-model']", "smoke-model");
  await clickInPage("[data-testid='settings-save']");
  await waitForPageExpression(
    "document.querySelector(\"[data-testid='settings-save-status']\")?.textContent?.length > 0",
  );
  await screenshot("settings.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  // 10. The command palette opens from the keyboard and surfaces the operator
  //     commands (World Inspector entry proves the workspace-mode command set).
  await browser("press", "Control+k");
  await waitForPageExpression("document.querySelector('[cmdk-root]') !== null");
  await assertPage(
    "Command palette opens from the keyboard with operator commands",
    "(() => { const root = document.querySelector('[cmdk-root]'); if (!root) return false; return /World Inspector|世界/.test(root.textContent ?? ''); })()",
  );
  await screenshot("command-palette.png");
  await browser("press", "Escape");
  await browser("wait", "200");

  // 11. Responsive layout: at a phone viewport the desktop rail collapses to the
  //     bottom tab bar and the layout has no horizontal overflow.
  await browser("set", "viewport", "390", "844");
  await browser("wait", "300");
  await assertPage(
    "Mobile workspace collapses the rail to bottom tabs with no horizontal overflow",
    "(() => { const noOverflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth; const tabs = document.querySelector(\"[data-testid='app-bottom-tabs']\"); const rail = document.querySelector(\"[data-testid='app-rail']\"); const railHidden = !rail || getComputedStyle(rail).display === 'none'; return noOverflow && tabs !== null && railHidden; })()",
  );
  await assertPage(
    "Mobile workspace keeps the localized zh-CN message placeholder",
    "document.querySelector(\"[data-testid='message-input']\")?.getAttribute('placeholder') === '消息'",
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
