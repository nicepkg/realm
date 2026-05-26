#!/usr/bin/env bun
import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RealmApplicationService } from "@realm/app-service";
import {
  initProject,
  loadProjectConfig,
  projectLayout,
  projectTrustTierSchema,
  readProjectTrust,
  resolveProjectRoot,
  trustProject,
} from "@realm/config";
import { FakeVerticalSliceRuntime } from "@realm/runtime";
import { createRealmServer, createRealmWebSocketHandlers, realmWebSocketData } from "@realm/server";
import { SQLiteEventStore } from "@realm/storage";
import { runTui } from "@realm/tui";
import { writeTemplate } from "./project-templates.ts";

type Command = "init" | "doctor" | "fake-run" | "open" | "trust" | "tui" | "help" | "version";

async function main(argv: string[]): Promise<void> {
  const command = parseCommand(argv);

  switch (command) {
    case "init":
      await init(argv);
      return;
    case "doctor":
      await doctor(argv);
      return;
    case "fake-run":
      await fakeRun();
      return;
    case "open":
      await open(argv);
      return;
    case "trust":
      await trust(argv);
      return;
    case "tui":
      await runTui(argv);
      return;
    case "version":
      console.log("0.1.0");
      return;
    case "help":
      printHelp();
      return;
  }
}

function parseCommand(argv: string[]): Command {
  const command = argv[2];
  if (!command || command === "open" || (command === "server" && argv[3] === "start")) {
    return "open";
  }
  if (command === "--help" || command === "-h" || command === "help") {
    return "help";
  }
  if (command === "--version" || command === "-v" || command === "version") {
    return "version";
  }
  if (
    command === "init" ||
    command === "doctor" ||
    command === "fake-run" ||
    command === "trust" ||
    command === "tui"
  ) {
    return command;
  }
  return "help";
}

async function init(argv: string[]): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const template = readFlag(argv, "--template") ?? "cultivation";
  const layout = await initProject(root, path.basename(root));

  if (template !== "none") {
    await writeTemplate(layout, template);
  }

  console.log(`Realm initialized at ${layout.agentsDir}`);
  console.log(`Template: ${template}`);
}

async function doctor(argv: string[]): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const layout = projectLayout(root);
  const config = await loadProjectConfig(root).catch(() => undefined);
  const trust = await readProjectTrust(root);
  const piPackageStatus = await checkPiPackageImports();

  console.log(`Project root: ${root}`);
  console.log(`Agents dir: ${layout.agentsDir}`);
  console.log(`Config: ${config ? "ok" : "missing or invalid"}`);
  console.log(`Local config: ${(await pathExists(layout.localConfigPath)) ? "ok" : "missing"}`);
  console.log(`Default world: ${config?.defaults.world ?? "unknown"}`);
  console.log(`Project trust: ${trust?.tier ?? "untrusted/read-only"}`);
  console.log(
    `State gitignored: ${(await gitignoreContains(root, ".agents/state/")) ? "ok" : "missing"}`,
  );
  console.log(`Pi packages: ${piPackageStatus}`);
  if (argv.includes("--fallback")) {
    console.log(
      `Pi CLI fallback: ${(await commandExists("pi")) ? "available" : "unavailable (optional)"}`,
    );
  }
}

async function open(argv: string[]): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const layout = projectLayout(root);
  const config = await loadProjectConfig(root);
  const trust = await readProjectTrust(root);
  const trustTier = config.security.requireTrust ? (trust?.tier ?? "read-only") : "run-roles";
  await mkdir(layout.stateDir, { recursive: true });

  const requestedPort = Number.parseInt(readFlag(argv, "--port") ?? "3737", 10);
  const runtimeMode = readFlag(argv, "--runtime") ?? "package";
  if (runtimeMode !== "package" && runtimeMode !== "fake") {
    throw new Error(`Unknown runtime mode: ${runtimeMode}`);
  }
  const port = await findAvailablePort(Number.isNaN(requestedPort) ? 3737 : requestedPort);
  const host = "127.0.0.1";
  const url = `http://${host}:${port}`;
  const eventStore = new SQLiteEventStore(path.join(layout.stateDir, "events.sqlite"));
  const webDistDir = await resolveWebDistDir();
  const effectiveTrustTier = runtimeMode === "fake" ? "run-roles" : trustTier;
  const service = new RealmApplicationService({
    root,
    eventStore,
    extensionBaseUrl: url,
    trustTier: effectiveTrustTier,
    fakeVerticalSlice: runtimeMode === "fake",
  });
  const app = createRealmServer({ root, eventStore, webDistDir, extensionBaseUrl: url, service });
  const server = Bun.serve({
    hostname: host,
    port,
    fetch(request, server) {
      const requestUrl = new URL(request.url);
      if (requestUrl.pathname === "/api/events/ws") {
        const afterSeq = Number.parseInt(requestUrl.searchParams.get("afterSeq") ?? "0", 10);
        const upgraded = server.upgrade(request, {
          data: realmWebSocketData(service, afterSeq),
        });
        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(request);
    },
    websocket: createRealmWebSocketHandlers(),
  });
  const runtimeUrl = `http://${host}:${server.port}`;

  console.log(`Realm project: ${config.project.name}`);
  console.log(`Runtime mode: ${runtimeMode}`);
  console.log(
    `Project trust: ${runtimeMode === "fake" ? "run-roles (fake runtime)" : (trust?.tier ?? "untrusted/read-only")}`,
  );
  if (runtimeMode !== "fake" && config.security.requireTrust && !trust) {
    console.log("Run `realm trust --tier run-roles` to enable role turns and state actions.");
  }
  console.log(`Realm server: ${runtimeUrl}`);

  if (!argv.includes("--no-open")) {
    openBrowser(runtimeUrl);
  }

  await waitForShutdown(async () => {
    server.stop(true);
    eventStore.close();
  });
}

async function fakeRun(): Promise<void> {
  const result = new FakeVerticalSliceRuntime().run({
    seed: 1,
    clockStart: new Date("2026-05-26T00:00:00.000Z"),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        eventTypes: result.events.map((event) => event.type),
        eventCount: result.events.length,
        stateVersion: result.stateVersion,
      },
      null,
      2,
    ),
  );
}

async function trust(argv: string[]): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const tier = projectTrustTierSchema.parse(readFlag(argv, "--tier") ?? "run-roles");
  const record = await trustProject(root, tier);

  console.log(`Trusted project: ${record.root}`);
  console.log(`Trust tier: ${record.tier}`);
}

function printHelp(): void {
  console.log(`Realm CLI

Usage:
  realm
  realm open
  realm open --runtime fake
  realm init --template cultivation
  realm init --template software-company
  realm trust --tier run-roles
  realm tui --base-url http://127.0.0.1:3737 --once
  realm doctor
  realm fake-run
  realm server start --port 3737

Commands:
  open       Start the local Realm server and Web UI.
  init       Initialize .agents in the current project.
  trust      Trust the current project for role runtime capabilities.
  tui        Connect to a local Realm server with a terminal UI.
  doctor     Validate the current project Realm setup.
  fake-run   Run the deterministic P1 fake vertical slice.
`);
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

async function resolveWebDistDir(): Promise<string> {
  const candidates = [
    process.env.REALM_WEB_DIST_DIR,
    path.join(path.dirname(process.execPath), "web"),
    path.resolve(import.meta.dir, "web"),
    path.resolve(import.meta.dir, "../../web/dist"),
    path.resolve(process.cwd(), "apps/web/dist"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  throw new Error("Realm Web UI build not found. Run `bun run build` before `realm open`.");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  const extensions =
    os.platform() === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const extension of extensions) {
      if (await isExecutableFile(path.join(directory, `${command}${extension}`))) {
        return true;
      }
    }
  }
  return false;
}

async function checkPiPackageImports(): Promise<string> {
  try {
    await Promise.all([
      import("@earendil-works/pi-agent-core"),
      import("@earendil-works/pi-ai"),
      import("@earendil-works/pi-coding-agent"),
    ]);
    return "ok";
  } catch (error) {
    return `failed (${error instanceof Error ? error.message : String(error)})`;
  }
}

async function gitignoreContains(root: string, entry: string): Promise<boolean> {
  try {
    const content = await Bun.file(path.join(root, ".gitignore")).text();
    return content.split(/\r?\n/).includes(entry);
  } catch {
    return false;
  }
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return false;
    }
    if (os.platform() !== "win32") {
      await access(filePath, constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port found near ${preferredPort}`);
}

async function canListen(port: number): Promise<boolean> {
  try {
    const probe = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response("ok"),
    });
    probe.stop(true);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const platform = os.platform();
  const command =
    platform === "darwin"
      ? ["open", url]
      : platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
}

async function waitForShutdown(cleanup: () => Promise<void> | void): Promise<void> {
  let cleaned = false;
  const runCleanup = async () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await cleanup();
  };

  process.on("SIGINT", () => {
    void runCleanup().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void runCleanup().finally(() => process.exit(0));
  });

  await new Promise(() => undefined);
}

main(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
