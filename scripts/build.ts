import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { buildPiExtension } from "./build-pi-extension.ts";

await mkdir("dist", { recursive: true });

const webBuild = Bun.spawn(["bun", "run", "--cwd", "apps/web", "build"], {
  stdout: "inherit",
  stderr: "inherit",
});

const webBuildExitCode = await webBuild.exited;
if (webBuildExitCode !== 0) {
  process.exit(webBuildExitCode);
}

const result = await Bun.build({
  entrypoints: ["apps/cli/src/index.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Built dist/index.js");

const packagedWebDir = path.join("dist", "web");
await rm(packagedWebDir, { force: true, recursive: true });
await cp(path.join("apps", "web", "dist"), packagedWebDir, { recursive: true });
console.log("Copied Web UI assets to dist/web");

await buildPiExtension(path.join("dist", "pi-extension"));
