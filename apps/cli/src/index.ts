#!/usr/bin/env bun
import { constants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RealmApplicationService } from "@realm/app-service";
import {
  initProject,
  loadProjectConfig,
  projectLayout,
  resolveProjectRoot,
  writeYamlFile,
} from "@realm/config";
import { FakeVerticalSliceRuntime } from "@realm/runtime";
import { createRealmServer, createRealmWebSocketHandlers, realmWebSocketData } from "@realm/server";
import { SQLiteEventStore } from "@realm/storage";

type Command = "init" | "doctor" | "fake-run" | "open" | "help" | "version";

async function main(argv: string[]): Promise<void> {
  const command = parseCommand(argv);

  switch (command) {
    case "init":
      await init(argv);
      return;
    case "doctor":
      await doctor();
      return;
    case "fake-run":
      await fakeRun();
      return;
    case "open":
      await open(argv);
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
  if (command === "init" || command === "doctor" || command === "fake-run") {
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

async function doctor(): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const layout = projectLayout(root);
  const config = await loadProjectConfig(root).catch(() => undefined);

  console.log(`Project root: ${root}`);
  console.log(`Agents dir: ${layout.agentsDir}`);
  console.log(`Config: ${config ? "ok" : "missing or invalid"}`);
  console.log(`Default world: ${config?.defaults.world ?? "unknown"}`);
  console.log("Pi package bridge: installed");
  console.log(
    `Pi CLI fallback: ${(await commandExists("pi")) ? "available" : "unavailable (optional)"}`,
  );
}

async function open(argv: string[]): Promise<void> {
  const root = await resolveProjectRoot(process.cwd());
  const layout = projectLayout(root);
  const config = await loadProjectConfig(root);
  await mkdir(layout.stateDir, { recursive: true });

  const requestedPort = Number.parseInt(readFlag(argv, "--port") ?? "3737", 10);
  const port = await findAvailablePort(Number.isNaN(requestedPort) ? 3737 : requestedPort);
  const host = "127.0.0.1";
  const url = `http://${host}:${port}`;
  const eventStore = new SQLiteEventStore(path.join(layout.stateDir, "events.sqlite"));
  const webDistDir = await resolveWebDistDir();
  const service = new RealmApplicationService({ root, eventStore, extensionBaseUrl: url });
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

function printHelp(): void {
  console.log(`Realm CLI

Usage:
  realm
  realm open
  realm init --template cultivation
  realm doctor
  realm fake-run
  realm server start --port 3737

Commands:
  open       Start the local Realm server and Web UI.
  init       Initialize .agents in the current project.
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

async function writeTemplate(
  layout: ReturnType<typeof projectLayout>,
  template: string,
): Promise<void> {
  if (template !== "cultivation") {
    throw new Error(`Unknown template: ${template}`);
  }

  const worldDir = path.join(layout.worldsDir, "cultivation");
  await mkdir(worldDir, { recursive: true });

  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "cultivation",
    name: "Cultivation Demo",
    mode: { type: "game", time: { kind: "manual" } },
    rooms: {
      main: { type: "world-main", name: "All Hands" },
    },
    roles: [
      { id: "leijun", model: "default" },
      { id: "guchenfeng", model: "default" },
    ],
    god: {
      id: "god",
      model: "default",
      permissions: {
        canPatchAnyState: true,
        canKillRole: true,
        canCreateEvents: true,
      },
    },
  });

  await writeYamlFile(path.join(worldDir, "initial-state.yaml"), {
    publicState: {
      roles: {
        leijun: { name: "Lei Jun", realm: "Qi Refining 7" },
        guchenfeng: { name: "Gu Chenfeng", realm: "Qi Refining 5" },
      },
    },
    privateState: {},
    hiddenState: {},
    derivedState: {},
    metaState: {
      roles: {
        leijun: { alive: true, muted: false },
        guchenfeng: { alive: true, muted: false },
      },
    },
  });

  await writeCultivationRole(layout, {
    id: "leijun",
    displayName: "Lei Jun",
    summary: "Founder mindset with product, operations, marketing, and engineering instincts.",
    prompt:
      "Think like Lei Jun: practical product judgment, long-term patience, operational discipline, and user-first communication. Avoid empty slogans; ground advice in tradeoffs and execution.",
  });
  await writeCultivationRole(layout, {
    id: "guchenfeng",
    displayName: "Gu Chenfeng",
    summary: "A resilient cultivation-world protagonist who learns through pressure and risk.",
    prompt:
      "Think like Gu Chenfeng: resilient, observant, willing to take calculated risks, and honest about fear. Treat setbacks as material for growth, not as excuses.",
  });
}

async function writeCultivationRole(
  layout: ReturnType<typeof projectLayout>,
  input: { id: string; displayName: string; summary: string; prompt: string },
): Promise<void> {
  const roleDir = path.join(layout.rolesDir, input.id);
  const skillDir = path.join(roleDir, "skills", input.id);
  await mkdir(skillDir, { recursive: true });
  await writeYamlFile(path.join(roleDir, "role.yaml"), {
    version: 1,
    id: input.id,
    displayName: input.displayName,
    model: "default",
    profile: { summary: input.summary },
    rolePrompt: { skill: input.id, source: "role-private" },
  });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [`# ${input.displayName}`, "", input.prompt, ""].join("\n"),
    "utf8",
  );
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
