import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

type Manifest = {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type Workspace = {
  manifest: Manifest;
  manifestPath: string;
  packageRoot: string;
  scanRoot: string;
};

type MissingImport = {
  dependency: string;
  files: Set<string>;
};

const repoRoot = process.cwd();
const builtinNames = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((moduleName) => moduleName.replace(/^node:/, "")),
]);

const rootManifest = await readJson<Manifest>("package.json");
const workspaces = await discoverWorkspaces(rootManifest);
const missingByWorkspace = new Map<string, MissingImport[]>();

for (const workspace of workspaces) {
  const declared = declaredDependencies(workspace.manifest);
  const imports = new Map<string, Set<string>>();
  const files = await listSourceFiles(workspace.scanRoot);

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const specifier of collectImportSpecifiers(file, source)) {
      const packageName = packageNameFromSpecifier(specifier);
      if (!packageName || packageName === workspace.manifest.name) {
        continue;
      }
      if (!imports.has(packageName)) {
        imports.set(packageName, new Set());
      }
      imports.get(packageName)?.add(path.relative(repoRoot, file));
    }
  }

  const missing = [...imports]
    .filter(([packageName]) => !declared.has(packageName))
    .map(([dependency, filesForDependency]) => ({
      dependency,
      files: filesForDependency,
    }))
    .sort((a, b) => a.dependency.localeCompare(b.dependency));

  if (missing.length > 0) {
    missingByWorkspace.set(workspace.packageRoot, missing);
  }
}

if (missingByWorkspace.size > 0) {
  console.error("Undeclared package imports found:");
  for (const [workspaceRoot, missing] of missingByWorkspace) {
    console.error(`\n${workspaceRoot}`);
    for (const item of missing) {
      const fileList = [...item.files].sort().join(", ");
      console.error(`  ${item.dependency} <- ${fileList}`);
    }
  }
  process.exit(1);
}

console.log(`Dependency audit passed for ${workspaces.length} package roots.`);

async function discoverWorkspaces(manifest: Manifest): Promise<Workspace[]> {
  const packageRoots = new Set<string>(["."]);
  for (const pattern of manifest.workspaces ?? []) {
    const workspaceRoots = await expandWorkspacePattern(pattern);
    for (const workspaceRoot of workspaceRoots) {
      packageRoots.add(workspaceRoot);
    }
  }

  const discovered: Workspace[] = [];
  for (const packageRoot of [...packageRoots].sort()) {
    const manifestPath = path.join(packageRoot, "package.json");
    const workspaceManifest =
      packageRoot === "." ? manifest : await readJson<Manifest>(manifestPath);
    discovered.push({
      manifest: workspaceManifest,
      manifestPath,
      packageRoot,
      scanRoot: packageRoot === "." ? "scripts" : packageRoot,
    });
  }
  return discovered;
}

async function expandWorkspacePattern(pattern: string): Promise<string[]> {
  if (!pattern.endsWith("/*")) {
    throw new Error(`Unsupported workspace pattern: ${pattern}`);
  }
  const parent = pattern.slice(0, -2);
  const entries = await readdir(parent, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name))
    .sort();
}

async function listSourceFiles(scanRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo") {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        files.push(fullPath);
      }
    }
  }

  await walk(scanRoot);
  return files.sort();
}

function collectImportSpecifiers(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        specifiers.push(argument.text);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        specifiers.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function packageNameFromSpecifier(specifier: string): string | undefined {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("bun:") ||
    specifier.startsWith("data:")
  ) {
    return undefined;
  }

  if (builtinNames.has(specifier)) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

function declaredDependencies(manifest: Manifest): Set<string> {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}
