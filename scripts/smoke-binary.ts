import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const binaryName = os.platform() === "win32" ? "realm.exe" : "realm";
const binaryPath = path.resolve("dist", "bin", binaryName);

await access(binaryPath);
await access(path.join("dist", "bin", "web", "index.html"));
await access(path.join("dist", "bin", "pi-extension", "index.js"));

const version = await run([binaryPath, "--version"]);
if (!version.trim()) {
  console.error("Binary smoke did not print a version.");
  process.exit(1);
}

const projectDir = await mkdtemp(path.join(os.tmpdir(), "realm-binary-smoke-"));
try {
  const initOutput = await run([binaryPath, "init", "--template", "cultivation"], projectDir);
  if (!initOutput.includes("Template: cultivation")) {
    throw new Error(`Binary init did not apply cultivation template:\n${initOutput}`);
  }
  await access(path.join(projectDir, ".agents", "config.yaml"));

  const doctorOutput = await run([binaryPath, "doctor", "--fallback"], projectDir);
  if (!doctorOutput.includes("Config: ok") || !doctorOutput.includes("State gitignored: ok")) {
    throw new Error(`Binary doctor did not verify the initialized project:\n${doctorOutput}`);
  }

  const fakeRunOutput = await run([binaryPath, "fake-run"], projectDir);
  const fakeRun = JSON.parse(fakeRunOutput) as { ok?: boolean; eventCount?: number };
  if (!fakeRun.ok || !fakeRun.eventCount) {
    throw new Error(`Binary fake-run did not produce runtime events:\n${fakeRunOutput}`);
  }
} finally {
  await rm(projectDir, { force: true, recursive: true });
}

console.log(`Binary smoke passed: ${version.trim()}`);

async function run(command: string[], cwd?: string): Promise<string> {
  const smoke = Bun.spawn(command, {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    smoke.exited,
    new Response(smoke.stdout).text(),
    new Response(smoke.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${stderr || stdout}`);
  }
  return stdout.trim();
}
