import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SubprocessPiBridge } from "../packages/pi-bridge/src/index.ts";

const binary = process.env.REALM_PI_BIN ?? (await resolveLocalPiBinary());
if (!binary) {
  console.log("Pi RPC smoke skipped: no local pi binary found.");
  process.exit(0);
}

const bridge = new SubprocessPiBridge({
  binary,
  commandTimeoutMs: 3_000,
  extraArgs: ["--no-session"],
});

const handle = await bridge.startSession({
  worldId: "smoke",
  roomId: "main",
  roleId: "doctor",
  cwd: process.cwd(),
  sessionDir: path.join(os.tmpdir(), "realm-pi-rpc-smoke"),
  systemPrompt: "Smoke test.",
  allowedSkillPaths: [],
  extensionPaths: [],
});

const iterator = handle.events[Symbol.asyncIterator]();
const started = await nextEvent(iterator);
if (started?.type !== "session.started") {
  throw new Error(`Expected session.started, got ${JSON.stringify(started)}`);
}

await bridge.abort(handle.id);
const aborted = await nextEvent(iterator);
if (aborted?.type !== "session.aborted") {
  throw new Error(`Expected session.aborted, got ${JSON.stringify(aborted)}`);
}

await bridge.dispose(handle.id);
console.log(`Pi RPC smoke passed: ${binary}`);

async function resolveLocalPiBinary(): Promise<string | undefined> {
  const candidates =
    os.platform() === "win32"
      ? [path.join(process.cwd(), "node_modules", ".bin", "pi.cmd")]
      : [path.join(process.cwd(), "node_modules", ".bin", "pi")];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function nextEvent(iterator: AsyncIterator<unknown>): Promise<{ type?: string } | undefined> {
  const result = await Promise.race([
    iterator.next(),
    new Promise<IteratorResult<unknown>>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for Pi RPC event")), 5_000),
    ),
  ]);
  return result.value as { type?: string } | undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
