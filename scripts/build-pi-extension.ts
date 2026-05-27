import { mkdir, rm } from "node:fs/promises";

export async function buildPiExtension(outdir: string): Promise<void> {
  await rm(outdir, { force: true, recursive: true });
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: ["packages/pi-extension/src/index.ts"],
    outdir,
    target: "bun",
    format: "esm",
    splitting: false,
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Failed to build Realm Pi extension");
  }

  console.log(`Built Realm Pi extension in ${outdir}`);
}
