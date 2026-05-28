import type { spawn as spawnNode } from "node:child_process";
import net from "node:net";
import os from "node:os";

/**
 * Process / IO / assertion helpers shared by the TUI smoke entrypoint and its
 * PTY-drive section. Split out of smoke-tui.ts to keep each file under the
 * project's 500-line ceiling. Everything here is self-contained (no module
 * state) so callers pass their fixture paths in explicitly.
 */

export async function run(
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

export async function waitForHttp(
  target: string,
  readExitCode?: () => number | undefined,
): Promise<void> {
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

export async function waitForText(
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

export function waitForChildExit(
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

export async function commandExists(command: string): Promise<boolean> {
  const checker = os.platform() === "win32" ? "where" : "which";
  const proc = Bun.spawn([checker, command], { stderr: "pipe", stdout: "pipe" });
  const exitCode = await proc.exited;
  await drain(proc.stdout);
  await drain(proc.stderr);
  return exitCode === 0;
}

export async function findAvailablePort(start: number): Promise<number> {
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

export async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) {
    return;
  }
  await new Response(stream).text().catch(() => undefined);
}

export function assertIncludes(value: string, expected: string, label: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}:\n${value}`);
  }
}

export function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label} failed`);
  }
}

export function parseJsonPayload(value: string, label: string): Record<string, unknown> {
  const payloadStart = value.indexOf("{");
  if (payloadStart === -1) {
    throw new Error(`${label} did not include a JSON payload:\n${value}`);
  }
  const parsed = JSON.parse(value.slice(payloadStart)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} payload was not an object:\n${value}`);
  }
  return parsed as Record<string, unknown>;
}

export function shellJoin(command: string[]): string {
  return command.map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(" ");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripAnsi(value: string): string {
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
