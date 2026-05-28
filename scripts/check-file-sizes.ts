import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type OversizedFile = {
  file: string;
  lines: number;
};

const repoRoot = process.cwd();
const maxLines = 500;
const scanRoots = ["apps", "packages", "scripts"];
const extensions = new Set([".ts", ".tsx", ".css"]);
const ignoredDirectories = new Set(["node_modules", "dist", ".turbo", ".vite"]);

const oversized: OversizedFile[] = [];

for (const root of scanRoots) {
  await walk(root);
}

if (oversized.length > 0) {
  console.error(`Files over ${maxLines} lines require a split before merge:`);
  for (const item of oversized.sort((a, b) => b.lines - a.lines)) {
    console.error(`  ${item.lines.toString().padStart(4, " ")} ${item.file}`);
  }
  process.exit(1);
}

console.log(`File-size audit passed: no scanned source file exceeds ${maxLines} lines.`);

async function walk(directory: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) {
      continue;
    }

    const source = await readFile(fullPath, "utf8");
    const lines = source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length;
    if (lines > maxLines) {
      oversized.push({ file: path.relative(repoRoot, fullPath), lines });
    }
  }
}
