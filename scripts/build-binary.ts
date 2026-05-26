import { cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const binaryName = os.platform() === "win32" ? "realm.exe" : "realm";
const outdir = path.join("dist", "bin");
const outfile = path.join(outdir, binaryName);

await mkdir(outdir, { recursive: true });

const compile = Bun.spawn(
  ["bun", "build", "--compile", "--target=bun", "--outfile", outfile, "apps/cli/src/index.ts"],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);

const exitCode = await compile.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

const binaryWebDir = path.join(outdir, "web");
await rm(binaryWebDir, { force: true, recursive: true });
await cp(path.join("apps", "web", "dist"), binaryWebDir, { recursive: true });

console.log(`Built binary ${outfile}`);
console.log(`Copied Web UI assets to ${binaryWebDir}`);
