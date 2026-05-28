import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDraft, saveFailedDraft } from "../apps/tui/src/draft-store.ts";
import { RealmTuiApp } from "../apps/tui/src/index.ts";
import { resolveTuiKeybinding } from "../apps/tui/src/keybindings.ts";
import { RealmHttpClient } from "../packages/client-sdk/src/index.ts";
import {
  assertIncludes,
  assertTrue,
  drain,
  findAvailablePort,
  parseJsonPayload,
  run,
  stripAnsi,
  waitForHttp,
} from "./smoke-tui-helpers.ts";
import { runPtyLaunchSmoke } from "./smoke-tui-pty.ts";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");

// Expect bodies for the PTY smoke. The TUI repaints with full-screen clears
// (CSI 2J/3J), so only the FINAL frame survives in the captured stream — each
// body therefore ends on the single frame whose contents we assert.

await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);

const projectDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-project-"));
const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-tui-home-"));
const draftsDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-drafts-"));
const webDistDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-web-"));
await cp(examplePath, projectDir, { recursive: true });
await mkdir(realmHome, { recursive: true });
await writeFile(path.join(webDistDir, "index.html"), "<!doctype html><title>Realm TUI</title>");

const port = await findAvailablePort(3997);
const url = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  ["bun", "run", cliPath, "open", "--runtime", "fake", "--no-open", "--port", String(port)],
  {
    cwd: projectDir,
    env: { ...process.env, REALM_HOME: realmHome, REALM_WEB_DIST_DIR: webDistDir },
    stderr: "pipe",
    stdout: "pipe",
  },
);
let serverExitCode: number | undefined;
void server.exited.then((code) => {
  serverExitCode = code;
});

try {
  await waitForHttp(`${url}/api/health`, () => serverExitCode);
  await runOneShotRender();
  await runOneShotSend();
  await runStatefulInteractionSmoke();
  await runNewCommandsSmoke();
  await runScrollbackSmoke();
  await runPtyLaunchSmoke({ cliPath, projectDir, realmHome, url });
  console.log("TUI smoke passed.");
} finally {
  server.kill();
  await drain(server.stdout);
  await drain(server.stderr);
  await rm(projectDir, { force: true, recursive: true });
  await rm(realmHome, { force: true, recursive: true });
  await rm(draftsDir, { force: true, recursive: true });
  await rm(webDistDir, { force: true, recursive: true });
}

async function runOneShotRender(): Promise<void> {
  const output = await runCli(["tui", "--base-url", url, "--once", "--locale", "en"]);
  assertIncludes(output, "Realm TUI", "TUI one-shot render");
  assertIncludes(output, "Provider:", "TUI one-shot provider status");
  assertIncludes(output, "Running:", "TUI one-shot running status");
  assertIncludes(output, "Conversations", "TUI one-shot conversation list");
  assertIncludes(output, "Policy", "TUI one-shot policy summary");
  assertIncludes(output, "Capabilities:", "TUI one-shot capability summary");
  assertTrue(!output.includes("undefined"), "TUI one-shot render has no undefined placeholders");
  assertTrue(
    output.split("\n").every((line) => stripAnsi(line).length <= 88),
    "TUI one-shot render fits the default terminal width",
  );
}

async function runOneShotSend(): Promise<void> {
  const message = `tui one-shot smoke ${Date.now()}`;
  const output = await runCli([
    "tui",
    "--base-url",
    url,
    "--send",
    message,
    "--once",
    "--locale",
    "en",
  ]);
  assertIncludes(output, message, "TUI one-shot send output");
  await assertMessagePersisted(message, "owner");
}

async function runStatefulInteractionSmoke(): Promise<void> {
  const app = new RealmTuiApp({
    baseUrl: url,
    draftsDir,
    locale: "en",
  });
  let helpOpened = false;
  let settingsOpened = false;
  const showHelp = () => {
    helpOpened = true;
  };
  const showSettings = async () => {
    settingsOpened = true;
  };

  const normalMessage = `tui controller smoke ${Date.now()}`;
  const normalNotice = await app.handleInteractiveInput(
    `:send ${normalMessage}`,
    showHelp,
    showSettings,
  );
  assertIncludes(normalNotice ?? "", "Message sent", "TUI controller owner send");
  await assertMessagePersisted(normalMessage, "owner");

  const helpNotice = await app.handleInteractiveInput("/help", showHelp, showSettings);
  assertIncludes(helpNotice ?? "", "Help", "TUI help shortcut notice");
  assertTrue(helpOpened, "TUI help callback opened");

  // Bare "?" opens help only when the composer is empty; with text it forwards
  // to the editor so a literal "?" can be typed (global hijack is gated).
  assertTrue(
    resolveTuiKeybinding("?", { editorHasText: false }) === "help",
    "TUI bare ? opens help on empty composer",
  );
  assertTrue(
    resolveTuiKeybinding("?", { editorHasText: true }) === undefined,
    "TUI bare ? forwards to editor when composer has text",
  );

  // Picker selection: applyPaletteItem is exactly what the Ctrl+K SelectList
  // onSelect calls. Selecting the whereami item returns the current context.
  const pickerNotice = await app.applyPaletteItem("whereami");
  assertIncludes(pickerNotice ?? "", "Cultivation", "TUI command palette selection applies");

  const settingsNotice = await app.handleInteractiveInput("/settings", showHelp, showSettings);
  assertIncludes(settingsNotice ?? "", "Settings", "TUI settings shortcut notice");
  assertTrue(settingsOpened, "TUI settings callback opened");

  const identityNotice = await app.handleInteractiveInput(":id leijun", showHelp, showSettings);
  assertIncludes(identityNotice ?? "", "Switch composer identity", "TUI role switch gate");
  const switchedNotice = await app.handleInteractiveInput("y", showHelp, showSettings);
  assertIncludes(switchedNotice ?? "", "Speaking as Lei Jun", "TUI role switch confirmation");

  const roleMessage = `tui role takeover smoke ${Date.now()}`;
  const rolePrompt = await app.handleInteractiveInput(
    `:send ${roleMessage}`,
    showHelp,
    showSettings,
  );
  assertIncludes(rolePrompt ?? "", "Send as Lei Jun", "TUI role send gate");
  const roleSent = await app.handleInteractiveInput("y", showHelp, showSettings);
  assertIncludes(roleSent ?? "", "Message sent as Lei Jun", "TUI role send confirmation");
  await assertMessagePersisted(roleMessage, "leijun");

  const stateNotice = await app.handleInteractiveInput(":state", showHelp, showSettings);
  assertIncludes(stateNotice ?? "", "World state", "TUI state inspection");
  const rendered = await app.render();
  assertIncludes(rendered, "World state v", "TUI render includes state inspection context");

  await runDraftRecoverySmoke(app, showHelp, showSettings);
}

async function runDraftRecoverySmoke(
  app: RealmTuiApp,
  showHelp: () => void,
  showSettings: () => Promise<void>,
): Promise<void> {
  const original = `failed draft original ${Date.now()}`;
  const edited = `failed draft edited ${Date.now()}`;
  const saved = await saveFailedDraft(
    {
      content: original,
      error: "smoke simulated provider failure",
      identity: "owner",
      roomId: "main",
      roomName: "All Hands",
      worldId: "cultivation",
      worldName: "Cultivation Sim",
    },
    draftsDir,
  );

  const details = await app.handleInteractiveInput(
    `:draft ${saved.record.id}`,
    showHelp,
    showSettings,
  );
  assertIncludes(details ?? "", original, "TUI draft details show failed content");
  assertIncludes(details ?? "", ":edit-draft", "TUI draft details show edit action");

  const editedNotice = await app.handleInteractiveInput(
    `:edit-draft ${saved.record.id} ${edited}`,
    showHelp,
    showSettings,
  );
  assertIncludes(editedNotice ?? "", "updated", "TUI draft edit notice");

  const copyable = await app.handleInteractiveInput(
    `:copy-draft ${saved.record.id}`,
    showHelp,
    showSettings,
  );
  assertIncludes(copyable ?? "", edited, "TUI draft copy details include edited content");
  const copyablePayload = parseJsonPayload(copyable ?? "", "TUI draft copy details");
  assertTrue(
    copyablePayload.filePath === saved.filePath,
    `TUI draft copy details include file path ${saved.filePath}`,
  );

  const retryNotice = await app.handleInteractiveInput(
    `:retry-draft ${saved.record.id}`,
    showHelp,
    showSettings,
  );
  assertIncludes(retryNotice ?? "", "sent", "TUI draft retry notice");
  await assertMessagePersisted(edited, "owner");
  assertTrue(!(await loadDraft(saved.record.id, draftsDir)), "TUI draft retry removes draft");
}

async function runNewCommandsSmoke(): Promise<void> {
  // Persisted locale lands under the temp REALM_HOME so it is cleaned up.
  const previousRealmHome = process.env.REALM_HOME;
  process.env.REALM_HOME = realmHome;
  try {
    const app = new RealmTuiApp({ baseUrl: url, draftsDir, locale: "en" });
    const noop = () => {};
    const noopAsync = async () => {};

    // :locale switches the interface language live and persists it.
    const localeNotice = await app.handleInteractiveInput(":locale zh-CN", noop, noopAsync);
    assertIncludes(localeNotice ?? "", "界面语言", "TUI :locale switch notice");
    const zhRender = await app.render();
    assertIncludes(zhRender, "会话", "TUI render flips to Chinese after :locale");
    const persisted = await readFile(path.join(realmHome, "tui-locale"), "utf8");
    assertIncludes(persisted.trim(), "zh-CN", "TUI locale persisted to ~/.realm");
    // Switch back so later assertions read English copy.
    await app.handleInteractiveInput(":locale en", noop, noopAsync);

    // :sim status reports the simulation runtime for the active world.
    const simStatus = await app.handleInteractiveInput(":sim status", noop, noopAsync);
    assertIncludes(simStatus ?? "", "Simulation", "TUI :sim status notice");
    const simTick = await app.handleInteractiveInput(":sim tick 1", noop, noopAsync);
    assertIncludes(simTick ?? "", "tick", "TUI :sim tick notice");

    // :create-world / :create-role propose a config patch (review-before-apply).
    const worldProposal = await app.handleInteractiveInput(
      ":create-world smoke-world Smoke World sandbox",
      noop,
      noopAsync,
    );
    assertIncludes(worldProposal ?? "", "smoke-world", "TUI :create-world proposal notice");
    const roleProposal = await app.handleInteractiveInput(
      ":create-role smoke-role Smoke Role",
      noop,
      noopAsync,
    );
    assertIncludes(roleProposal ?? "", "smoke-role", "TUI :create-role proposal notice");

    // :run-role gates on confirmation, surfacing model/provider/permissions and
    // the Ctrl+C cancel line. The fake server has no live provider for arbitrary
    // role turns, so we assert the observable gate (which proves the running
    // path is wired) and cancel instead of confirming.
    const runGate = await app.handleInteractiveInput(":run-role leijun ping", noop, noopAsync);
    assertIncludes(runGate ?? "", "Run Lei Jun", "TUI :run-role confirmation gate");
    assertIncludes(runGate ?? "", "Model:", "TUI :run-role shows model/provider");
    assertIncludes(runGate ?? "", "Ctrl+C cancels", "TUI :run-role shows cancel line");
    const runCancelled = await app.handleInteractiveInput("n", noop, noopAsync);
    assertIncludes(runCancelled ?? "", "cancelled", "TUI :run-role cancels cleanly");
  } finally {
    if (previousRealmHome === undefined) {
      delete process.env.REALM_HOME;
    } else {
      process.env.REALM_HOME = previousRealmHome;
    }
  }
}

async function runScrollbackSmoke(): Promise<void> {
  // Push more than one transcript window of messages, then assert the render
  // keeps status/editor context lines visible while showing an older-history
  // indicator (scrollback) rather than dropping the surrounding chrome.
  const app = new RealmTuiApp({ baseUrl: url, draftsDir, locale: "en" });
  const noop = () => {};
  const noopAsync = async () => {};
  for (let index = 0; index < 16; index += 1) {
    await app.handleInteractiveInput(
      `:send scrollback probe ${index} ${Date.now()}`,
      noop,
      noopAsync,
    );
  }
  const rendered = await app.render();
  assertIncludes(rendered, "older", "TUI render shows scrollback older-history indicator");
  assertIncludes(rendered, "Conversations", "TUI render keeps conversation chrome with scrollback");
  assertIncludes(rendered, "Shortcuts", "TUI render keeps shortcuts footer with scrollback");
}

async function assertMessagePersisted(content: string, displayedAuthorId: string): Promise<void> {
  const client = new RealmHttpClient({ baseUrl: url });
  const messages = (await client.listMessages("main")).messages;
  const match = messages.find(
    (message) => message.content === content && message.displayedAuthorId === displayedAuthorId,
  );
  assertTrue(Boolean(match), `Persisted message ${content} from ${displayedAuthorId}`);
}

async function runCli(args: string[]): Promise<string> {
  return run(["bun", "run", cliPath, ...args], {
    cwd: projectDir,
    env: { ...process.env, REALM_HOME: realmHome },
  });
}
