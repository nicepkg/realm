type PackFile = {
  path: string;
  size: number;
};

type PackResult = {
  entryCount: number;
  files: PackFile[];
  filename: string;
  unpackedSize: number;
};

const maxEntries = 20;
const maxUnpackedSize = 25 * 1024 * 1024;
const forbiddenPathPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)src\//,
  /\.test\.[cm]?[jt]sx?$/,
  /^dist\/bin\//,
  /^apps\//,
  /^packages\//,
  /^scripts\//,
  /^examples\//,
];

const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (exitCode !== 0) {
  console.error(stderr);
  process.exit(exitCode);
}

const [pack] = JSON.parse(stdout) as PackResult[];
if (!pack) {
  throw new Error("npm pack did not return package metadata");
}

const forbiddenFiles = pack.files.filter((file) =>
  forbiddenPathPatterns.some((pattern) => pattern.test(file.path)),
);

if (pack.entryCount > maxEntries || pack.unpackedSize > maxUnpackedSize || forbiddenFiles.length) {
  console.error(`Unexpected npm package contents in ${pack.filename}:`);
  console.error(`  entries: ${pack.entryCount}/${maxEntries}`);
  console.error(`  unpacked: ${pack.unpackedSize}/${maxUnpackedSize}`);
  for (const file of forbiddenFiles) {
    console.error(`  forbidden: ${file.path}`);
  }
  process.exit(1);
}

console.log(
  `Package smoke passed: ${pack.filename}, ${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked.`,
);

export {};
