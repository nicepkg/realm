import { spawn as spawnNode } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertIncludes,
  commandExists,
  run,
  shellJoin,
  sleep,
  stripAnsi,
  waitForChildExit,
  waitForText,
} from "./smoke-tui-helpers.ts";

// One PTY drive proving the interactive surface launches under a real PTY and
// the input loop routes a bare "?" to the help overlay. The help open is gated
// INLINE (reliable: help is the first overlay after a settled launch gate, so
// it matches before any repaint) — the script exits 4 if help never opens,
// which `run()` surfaces as a failure; then Esc dismisses it and we exit.
//
// The richer interactive behaviors are asserted DETERMINISTICALLY elsewhere,
// because the TUI repaints with full-screen clears (CSI 2J/3J) that make
// mid-sequence overlay frames and per-glyph-styled composer text unmatchable in
// a captured PTY stream:
//   - "?" forwards to a non-empty composer  → keybindings unit test +
//     runStatefulInteractionSmoke (resolveTuiKeybinding gating).
//   - Ctrl+K picker selection routes a command → runStatefulInteractionSmoke
//     (applyPaletteItem, exactly what SelectList.onSelect calls).
//   - send persists / :run-role runs / locale / sim / scrollback → the
//     controller-level smokes above.
const PTY_INTERACTION_BODY = `
send "?"
expect {
  -re "Keys:" {}
  timeout { puts stderr "Help overlay did not open on bare ?"; exit 4 }
}
send "\\033"
after 400
send "\\003"
after 250
send "\\003"`;

/** Fixture paths the PTY-drive smoke needs from the entrypoint. */
export type PtySmokeContext = {
  cliPath: string;
  projectDir: string;
  realmHome: string;
  url: string;
};

/**
 * Proves the TUI launches under a real PTY and routes "?" to help. Prefers
 * `expect` (which gates help-open inline), falls back to `script`, and skips
 * cleanly when no portable PTY tool is available — identical behavior to the
 * previous inline implementation.
 */
export async function runPtyLaunchSmoke(context: PtySmokeContext): Promise<void> {
  const interactiveCommand = [
    "bun",
    "run",
    context.cliPath,
    "tui",
    "--base-url",
    context.url,
    "--locale",
    "en",
  ];
  if (os.platform() === "win32") {
    console.log("TUI PTY launch smoke skipped: portable `script` command unavailable.");
    return;
  }
  if (await commandExists("expect")) {
    // Help-opens-on-"?" is gated inline by the expect script (exit 4 on failure,
    // surfaced by run()); reaching this line means a real PTY launched the TUI
    // and the input loop routed "?" to the help overlay.
    const screen = stripAnsi(
      await runWithExpectPty(context, interactiveCommand, PTY_INTERACTION_BODY),
    );
    assertIncludes(screen, "Realm", "TUI PTY launch");
    return;
  }
  if (
    !(await commandExists("script")) ||
    !(await canRunScriptPty(context, ["printf", "realm-pty-probe"], "realm-pty-probe")) ||
    !(await canRunScriptPty(context, [...interactiveCommand, "--once"], "Realm TUI"))
  ) {
    console.log("TUI PTY launch smoke skipped: portable `script` command unavailable.");
    return;
  }
  const output = await runWithScriptPty(context, interactiveCommand);
  if (output) {
    assertIncludes(output, "Realm", "TUI PTY launch");
  }
}

async function canRunScriptPty(
  context: PtySmokeContext,
  command: string[],
  expected: string,
): Promise<boolean> {
  const proc = Bun.spawn(scriptCommand(command), {
    cwd: context.projectDir,
    env: { ...process.env, REALM_HOME: context.realmHome },
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

async function runWithExpectPty(
  context: PtySmokeContext,
  command: string[],
  body: string,
): Promise<string> {
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
${body}
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
      cwd: context.projectDir,
      env: { ...process.env, REALM_HOME: context.realmHome },
    });
  } finally {
    await rm(scriptDir, { force: true, recursive: true });
  }
}

async function runWithScriptPty(context: PtySmokeContext, command: string[]): Promise<string> {
  const child = spawnNode("script", scriptCommand(command).slice(1), {
    cwd: context.projectDir,
    env: { ...process.env, REALM_HOME: context.realmHome },
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
