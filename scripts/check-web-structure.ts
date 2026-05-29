import type { Dirent } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

type Failure = {
  detail: string;
  file?: string;
};

const repoRoot = process.cwd();
const failures: Failure[] = [];
const webRoot = path.join("apps", "web");
const webSrc = path.join(webRoot, "src");
const legacyUiRoot = path.join(webSrc, "ui");

const requiredFiles = [
  path.join(webRoot, "components.json"),
  ...[
    "badge.tsx",
    "button.tsx",
    "command.tsx",
    "dialog.tsx",
    "input.tsx",
    "scroll-area.tsx",
    "select.tsx",
    "sheet.tsx",
    "skeleton.tsx",
    "textarea.tsx",
    "tooltip.tsx",
  ].map((file) => path.join(webSrc, "components", "ui", file)),
  // The messenger rebuild folded the chat primitives into the workspace and
  // kept only the AI Elements pieces it still composes. Require the ones the
  // current UI actually renders, not the pre-rebuild superset.
  ...["conversation.tsx", "shimmer.tsx"].map((file) =>
    path.join(webSrc, "components", "ai-elements", file),
  ),
];

for (const file of requiredFiles) {
  await assertReadable(file);
}

const legacyFiles = await listFiles(legacyUiRoot);
for (const file of legacyFiles.filter((file) => /\.(css|tsx?)$/.test(file))) {
  failures.push({
    detail: "legacy Web UI source must not exist after the rebuild",
    file,
  });
}

for (const file of await listFiles(webSrc)) {
  if (!/\.tsx?$/.test(file)) {
    continue;
  }
  const source = await readFile(file, "utf8");
  for (const specifier of collectImportSpecifiers(source)) {
    if (isLegacyUiImport(specifier)) {
      failures.push({
        detail: `legacy Web UI import "${specifier}" is forbidden`,
        file,
      });
    }
  }
}

if (failures.length > 0) {
  console.error("Web structure audit failed:");
  for (const failure of failures) {
    const location = failure.file ? `${path.relative(repoRoot, failure.file)}: ` : "";
    console.error(`  ${location}${failure.detail}`);
  }
  process.exit(1);
}

console.log(
  "Web structure audit passed: shadcn/AI Elements source is present and legacy ui is gone.",
);

async function assertReadable(file: string): Promise<void> {
  try {
    await access(file);
  } catch {
    failures.push({
      detail: "required Web rebuild source file is missing",
      file,
    });
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await walk(directory);
  return files.sort();
}

function collectImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(importPattern)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function isLegacyUiImport(specifier: string): boolean {
  return (
    specifier.startsWith("@/ui/") ||
    specifier.includes("/src/ui/") ||
    specifier.includes("../ui/") ||
    specifier.includes("./ui/")
  );
}
