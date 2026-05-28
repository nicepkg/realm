import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

type ProviderSmoke = {
  id: "openai" | "google";
  displayName: string;
  apiKeyEnv: "OPENAI_API_KEY" | "GEMINI_API_KEY";
  model: string;
};

type RoleTurnResponse = {
  turnId: string;
  message: {
    content: string;
  };
};

type EventsResponse = {
  events: Array<{
    type: string;
    turn?: {
      id: string;
      model?: string;
      usage?: {
        totalTokens: number;
      };
    };
  }>;
};

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "apps", "cli", "src", "index.ts");
const examplePath = path.join(repoRoot, "examples", "cultivation-sim");
const requestedProvider = readFlag("--provider");
const timeoutMs = Number.parseInt(readFlag("--timeout-ms") ?? "120000", 10);

const allProviderSmokes: ProviderSmoke[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-5-mini",
  },
  {
    id: "google",
    displayName: "Google",
    apiKeyEnv: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
  },
];
const providerSmokes = allProviderSmokes.filter(
  (provider) => !requestedProvider || provider.id === requestedProvider,
);

if (providerSmokes.length === 0) {
  throw new Error(`Unknown provider for smoke: ${requestedProvider}`);
}

for (const provider of providerSmokes) {
  if (!process.env[provider.apiKeyEnv]) {
    throw new Error(
      `Missing ${provider.apiKeyEnv}; source your local shell profile before running.`,
    );
  }
}

await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);

const results: string[] = [];

for (const provider of providerSmokes) {
  results.push(await runProviderSmoke(provider));
}

console.log(`Real provider smoke passed:\n${results.map((line) => `- ${line}`).join("\n")}`);

async function runProviderSmoke(provider: ProviderSmoke): Promise<string> {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), `realm-${provider.id}-project-`));
  const realmHome = await mkdtemp(path.join(os.tmpdir(), `realm-${provider.id}-home-`));
  const port = await findAvailablePort(provider.id === "openai" ? 4197 : 4297);
  const url = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    REALM_HOME: realmHome,
  };
  let server: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;

  try {
    await cp(examplePath, projectDir, { recursive: true });
    await rm(path.join(projectDir, ".agents", "state", "events.sqlite"), {
      force: true,
    });
    await writeUserConfig(realmHome, provider);
    await run(["bun", "run", cliPath, "trust", "--tier", "run-roles"], {
      cwd: projectDir,
      env,
    });

    server = Bun.spawn(
      ["bun", "run", cliPath, "open", "--runtime", "package", "--no-open", "--port", String(port)],
      {
        cwd: projectDir,
        env,
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    await waitForHttp(`${url}/api/health`);
    const response = await postRoleTurn(url, provider);
    const events = await getEvents(url);
    const completed = events.events.find(
      (event) => event.type === "turn.completed" && event.turn?.id === response.turnId,
    );

    if (!completed?.turn) {
      throw new Error(
        `${provider.id} role turn completed but no turn.completed event was recorded.`,
      );
    }

    const messageChars = response.message.content.trim().length;
    if (messageChars === 0) {
      throw new Error(`${provider.id} returned an empty role message.`);
    }

    const usage = completed.turn.usage?.totalTokens;
    const usageLabel = typeof usage === "number" ? `, usage=${usage}` : "";
    return `${provider.id}/${completed.turn.model ?? provider.model}: messageChars=${messageChars}${usageLabel}`;
  } finally {
    server?.kill();
    if (server) {
      await drain(server.stdout);
      await drain(server.stderr);
    }
    await rm(projectDir, { force: true, recursive: true });
    await rm(realmHome, { force: true, recursive: true });
  }
}

async function writeUserConfig(realmHome: string, provider: ProviderSmoke): Promise<void> {
  await mkdir(realmHome, { recursive: true });
  await writeFile(
    path.join(realmHome, "config.yaml"),
    [
      "version: 1",
      `defaultProvider: ${provider.id}`,
      `defaultModel: ${provider.model}`,
      "providers:",
      "  - id: openai",
      "    displayName: OpenAI",
      "    apiKeyEnv: OPENAI_API_KEY",
      "    defaultModel: gpt-5-mini",
      "    enabled: true",
      "  - id: google",
      "    displayName: Google",
      "    apiKeyEnv: GEMINI_API_KEY",
      "    defaultModel: gemini-2.5-flash",
      "    enabled: true",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function postRoleTurn(url: string, provider: ProviderSmoke): Promise<RoleTurnResponse> {
  const response = await fetch(`${url}/api/rooms/main/role-turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      worldId: "cultivation",
      roleId: "leijun",
      prompt: `Reply with one short sentence for a Realm ${provider.id} smoke test.`,
      timeoutMs,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `${provider.id} role turn failed with ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as RoleTurnResponse;
}

async function getEvents(url: string): Promise<EventsResponse> {
  const response = await fetch(`${url}/api/events`);
  if (!response.ok) {
    throw new Error(`Event query failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as EventsResponse;
}

async function waitForHttp(target: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(target);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${target}`);
}

async function run(
  command: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stderr: "pipe",
    stdout: "pipe",
  });
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

async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 200; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port starting at ${start}`);
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

async function drain(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) {
    return;
  }
  await new Response(stream).text().catch(() => undefined);
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
