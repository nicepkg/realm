import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const binaryName = os.platform() === "win32" ? "realm.exe" : "realm";
const binaryPath = path.join("dist", "bin", binaryName);

await access(binaryPath);
await access(path.join("dist", "bin", "web", "index.html"));

const smoke = Bun.spawn([binaryPath, "--version"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [exitCode, stdout, stderr] = await Promise.all([
  smoke.exited,
  new Response(smoke.stdout).text(),
  new Response(smoke.stderr).text(),
]);

if (exitCode !== 0) {
  console.error(stderr);
  process.exit(exitCode);
}

if (!stdout.trim()) {
  console.error("Binary smoke did not print a version.");
  process.exit(1);
}

console.log(`Binary smoke passed: ${stdout.trim()}`);
