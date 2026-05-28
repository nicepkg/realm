import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, "apps", "docs");
const docsDist = path.join(docsDir, "dist");
const cdpPort = readFlag("--cdp-port") ?? process.env.REALM_CDP_PORT;
const session = `realm-docs-smoke-${Date.now()}`;
const outputDir = path.join(os.tmpdir(), session);

if (!cdpPort) {
  console.error("Set REALM_CDP_PORT or pass --cdp-port from the dedicated /chrome-cdp instance.");
  process.exit(1);
}

await ensureCommand("agent-browser");
await buildDocs();
await access(path.join(docsDist, "index.html"), constants.R_OK);
await mkdir(outputDir, { recursive: true });

const port = await findAvailablePort(4190);
const url = `http://127.0.0.1:${port}`;
const server = Bun.serve({
  fetch: (request) => serveDocs(request),
  hostname: "127.0.0.1",
  port,
});

try {
  await browser("connect", cdpPort);
  await browser("set", "viewport", "1440", "1000");
  await browser("open", url);
  await browser("wait", ".docs-shell");
  await assertPage(
    "Docs home renders Realm hero",
    "document.querySelector('#hero-title')?.textContent === 'Realm'",
  );
  await assertPage(
    "Docs home exposes real product preview",
    "document.querySelector('.product-preview')?.textContent?.includes('Create World') === true",
  );
  await assertPage(
    "Docs home product preview uses WeChat-style nine-grid group avatar",
    "document.querySelectorAll('.group-avatar i').length === 9",
  );
  await assertPage(
    "Docs home surfaces verification signals",
    "document.querySelector('.proof-band')?.textContent?.includes('Agent Browser') === true",
  );
  await assertPage(
    "Docs home has no horizontal overflow",
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
  );
  await screenshot("docs-home-en.png");

  await browser("open", `${url}/zh-CN`);
  await browser("wait", ".docs-shell");
  await assertPage(
    "Chinese docs route renders localized copy",
    "document.documentElement.lang === 'zh-CN' && document.body.innerText.includes('创建世界')",
  );
  await assertPage(
    "Chinese docs route has no horizontal overflow",
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
  );
  await screenshot("docs-home-zh-CN.png");

  await browser("click", ".language-button");
  await browser("wait", "300");
  await assertPage(
    "Language switch persists English route",
    "location.pathname === '/' && localStorage.getItem('realm-docs-locale') === 'en'",
  );

  await browser("set", "viewport", "390", "844");
  await browser("open", `${url}/zh-CN`);
  await browser("wait", ".docs-shell");
  await assertPage(
    "Mobile docs layout has no horizontal overflow",
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
  );
  await assertPage(
    "Mobile docs keeps product preview visible",
    "document.querySelector('.product-preview') !== null",
  );
  await screenshot("docs-mobile-zh-CN.png");

  await browser("close");
  console.log(`Docs UI smoke passed. Screenshots: ${outputDir}`);
} finally {
  await tryBrowser("close");
  server.stop(true);
}

async function buildDocs(): Promise<void> {
  await run(["bun", "run", "--cwd", docsDir, "build"]);
}

function serveDocs(request: Request): Response | Promise<Response> {
  const requestUrl = new URL(request.url);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = pathname === "/" || pathname === "/zh-CN" ? "/index.html" : pathname;
  const normalized = path.normalize(safePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(docsDist, normalized);
  if (!filePath.startsWith(docsDist)) {
    return new Response("Not found", { status: 404 });
  }
  return fileResponse(filePath);
}

async function fileResponse(filePath: string): Promise<Response> {
  try {
    await access(filePath, constants.R_OK);
    return new Response(Bun.file(filePath));
  } catch {
    return new Response(Bun.file(path.join(docsDist, "index.html")));
  }
}

async function browser(...args: string[]): Promise<string> {
  return run(["agent-browser", ...args, "--session", session]);
}

async function tryBrowser(...args: string[]): Promise<string | undefined> {
  try {
    return await browser(...args);
  } catch {
    return undefined;
  }
}

async function screenshot(fileName: string): Promise<void> {
  await browser("screenshot", path.join(outputDir, fileName));
}

async function browserEval(source: string): Promise<string> {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return browser("eval", "-b", encoded);
}

async function assertPage(label: string, expression: string): Promise<void> {
  const result = await browserEval(expression);
  if (!result.includes("true")) {
    throw new Error(`${label} failed. Result: ${result}`);
  }
}

async function run(command: string[]): Promise<string> {
  const proc = Bun.spawn(command, { stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${stderr || stdout}`);
  }
  return stdout.trim();
}

async function ensureCommand(command: string): Promise<void> {
  const checker = os.platform() === "win32" ? "where" : "which";
  await run([checker, command]);
}

async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port near ${start}`);
}

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function readFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}
