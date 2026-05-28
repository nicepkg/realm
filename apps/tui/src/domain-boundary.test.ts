import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const forbiddenImports = [
  "@realm/app-service",
  "@realm/config",
  "@realm/kernel",
  "@realm/policy",
  "@realm/runtime",
  "@realm/server",
  "@realm/storage",
  "packages/app-service",
  "packages/config",
  "packages/runtime",
  "packages/server",
  "packages/storage",
];

describe("TUI domain boundary", () => {
  test("keeps domain logic behind the client SDK and API contracts", async () => {
    const files = await listSourceFiles(import.meta.dir);
    const violations: string[] = [];

    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      for (const forbidden of forbiddenImports) {
        if (source.includes(`"${forbidden}`) || source.includes(`'${forbidden}`)) {
          violations.push(`${path.relative(import.meta.dir, filePath)} imports ${forbidden}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }
      if (entry.name === "domain-boundary.test.ts") {
        return [];
      }
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        return [entryPath];
      }
      return [];
    }),
  );
  return files.flat();
}
