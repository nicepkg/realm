import { spawn as spawnNode } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { loadDraft, saveFailedDraft } from "../apps/tui/src/draft-store.ts";
import { RealmTuiApp } from "../apps/tui/src/index.ts";
import { RealmHttpClient } from "../packages/client-sdk/src/index.ts";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");

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
  await runPtyLaunchSmoke();
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
  assertIncludes(copyable ?? "", saved.filePath, "TUI draft copy details include file path");

  const retryNotice = await app.handleInteractiveInput(
    `:retry-draft ${saved.record.id}`,
    showHelp,
    showSettings,
  );
  assertIncludes(retryNotice ?? "", "sent", "TUI draft retry notice");
  await assertMessagePersisted(edited, "owner");
  assertTrue(!(await loadDraft(saved.record.id, draftsDir)), "TUI draft retry removes draft");
}

async function runPtyLaunchSmoke(): Promise<void> {
  const interactiveCommand = ["bun", "run", cliPath, "tui", "--base-url", url, "--locale", "en"];
  if (os.platform() === "win32") {
    console.log("TUI PTY launch smoke skipped: portable `script` command unavailable.");
    return;
  }
  if (await commandExists("expect")) {
    const output = await runWithExpectPty(interactiveCommand);
    assertIncludes(output, "Realm", "TUI PTY launch");
    return;
  }
  if (
    !(await commandExists("script")) ||
    !(await canRunScriptPty(["printf", "realm-pty-probe"], "realm-pty-probe")) ||
    !(await canRunScriptPty([...interactiveCommand, "--once"], "Realm TUI"))
  ) {
    console.log("TUI PTY launch smoke skipped: portable `script` command unavailable.");
    return;
  }
  const output = await runWithScriptPty(interactiveCommand);
  if (output) {
    assertIncludes(output, "Realm", "TUI PTY launch");
  }
}

async function canRunScriptPty(command: string[], expected: string): Promise<boolean> {
  const proc = Bun.spawn(scriptCommand(command), {
    cwd: projectDir,
    env: { ...process.env, REALM_HOME: realmHome },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return exitCode === 0 && stripAnsi(`${stdout}${stderr}`).includes(expected);
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

async function runWithExpectPty(command: string[]): Promise<string> {
  const scriptDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-expect-"));
  const scriptPath = path.join(scriptDir, "pty.exp");
  try {
    await writeFile(
      scriptPath,
      `
set timeout 6
log_user 1
spawn -noecho {*}$argv
expect {
  -re "Realm" {}
  timeout { puts stderr "Timed out waiting for Realm"; exit 2 }
  eof { puts stderr "Exited before Realm"; exit 3 }
}
send "?"
after 250
send "\\033"
after 250
send "\\003"
after 150
send "\\003"
expect {
  eof {}
  timeout { close; wait; exit 0 }
}
set result [wait]
set code [lindex $result 3]
if {$code != 0 && $code != 130} { exit $code }
`,
      "utf8",
    );
    return await run(["expect", scriptPath, ...command], {
      cwd: projectDir,
      env: { ...process.env, REALM_HOME: realmHome },
    });
  } finally {
    await rm(scriptDir, { force: true, recursive: true });
  }
}

async function runWithScriptPty(command: string[]): Promise<string> {
  const child = spawnNode("script", scriptCommand(command).slice(1), {
    cwd: projectDir,
    env: { ...process.env, REALM_HOME: realmHome },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });
  const rendered = await waitForText(() => output, "Realm", 6000);
  if (!rendered) {
    child.kill("SIGTERM");
    throw new Error(`TUI PTY launch did not render observable output:\n${stripAnsi(output)}`);
  }
  child.stdin.write("?");
  await sleep(250);
  child.stdin.write("\x1b");
  await sleep(250);
  child.stdin.write("\x03");
  await sleep(150);
  child.stdin.write("\x03");
  const exitCode = await waitForChildExit(child, 4000).catch(() => {
    child.kill("SIGTERM");
    return 0;
  });
  if (exitCode !== 0 && exitCode !== 130) {
    throw new Error(`TUI PTY launch exited with ${exitCode}:\n${stripAnsi(output).slice(-1200)}`);
  }
  return stripAnsi(output);
}

function scriptCommand(command: string[]): string[] {
  return os.platform() === "darwin"
    ? ["script", "-q", "/dev/null", ...command]
    : ["script", "-q", "-c", shellJoin(command), "/dev/null"];
}

async function run(
  command: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
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

async function waitForHttp(target: string, readExitCode?: () => number | undefined): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const exitCode = readExitCode?.();
    if (exitCode !== undefined) {
      throw new Error(`Server exited with ${exitCode} before ${target} was healthy`);
    }
    try {
      const response = await fetch(target);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function waitForText(
  read: () => string,
  expected: string,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (stripAnsi(read()).includes(expected)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

function waitForChildExit(
  child: ReturnType<typeof spawnNode>,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for child exit")),
      timeoutMs,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function commandExists(command: string): Promise<boolean> {
  const checker = os.platform() === "win32" ? "where" : "which";
  const proc = Bun.spawn([checker, command], { stderr: "pipe", stdout: "pipe" });
  const exitCode = await proc.exited;
  await drain(proc.stdout);
  await drain(proc.stderr);
  return exitCode === 0;
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

function assertIncludes(value: string, expected: string, label: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}:\n${value}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label} failed`);
  }
}

function shellJoin(command: string[]): string {
  return command.map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 0x1b && value[index + 1] === "[") {
      index += 2;
      while (index < value.length) {
        const code = value.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
        index += 1;
      }
      continue;
    }
    output += value[index];
  }
  return output;
}
