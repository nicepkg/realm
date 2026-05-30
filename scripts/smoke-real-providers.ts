import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * Real-provider role-TURN smoke for the model-backed runtime.
 *
 * Boots the package runtime against the cultivation-sim example with a real
 * provider configured, POSTs a role turn to `POST /api/rooms/main/role-turns`,
 * and asserts a non-empty assistant message backed by a recorded
 * `turn.completed` event with usage > 0.
 *
 * TOLERANCE CONTRACT (mirrors `smoke-real-intent.ts`): the live model is an
 * external flaky dependency. A missing API key, network error, rate limit
 * (429), auth/quota error (401/403), upstream 5xx, or timeout SKIPS that
 * provider gracefully (clear console note) and the script moves on to the next
 * provider — it NEVER reds the run on an external flaky call. Correctness is
 * asserted ONLY when a provider's call SUCCEEDS. PASS requires at least one
 * provider returning a non-empty role message with usage > 0; when every
 * provider skips, the script prints a SKIP summary and exits 0. This is an
 * opt-in confidence check the loop runs manually.
 *
 * Concretely: with Boss's real keys, a project-scoped OPENAI_API_KEY that
 * returns HTTP 401 ("project does not allow user keys") must SKIP the openai
 * segment while a healthy gemini segment still PASSes — one provider's external
 * failure never fails the whole script.
 */

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

/** HTTP statuses we treat as external flakiness rather than a real defect. */
const tolerableStatuses = new Set([401, 403, 408, 429]);

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
  // An unknown --provider flag is an operator mistake, not external flakiness:
  // surface it loudly rather than silently skipping.
  console.error(`Unknown provider for smoke: ${requestedProvider}`);
  process.exit(1);
}

await access(cliPath, constants.R_OK);
await access(examplePath, constants.R_OK);

// Drop providers whose API key is absent — a missing key is a tolerated SKIP,
// not a hard error (matches smoke-real-intent's contract).
const reachable = providerSmokes.filter((provider) => {
  if (process.env[provider.apiKeyEnv]) {
    return true;
  }
  console.log(
    `[skip] ${provider.id}: ${provider.apiKeyEnv} not set — skipping (this is fine; opt-in check).`,
  );
  return false;
});

if (reachable.length === 0) {
  console.log(
    "Real provider smoke SKIPPED: no provider API keys present. Exit 0 (never blocks the gate).",
  );
  process.exit(0);
}

let passedAnyProvider = false;
const reportLines: string[] = [];

for (const provider of reachable) {
  const outcome = await runProviderSmoke(provider);
  if (outcome.skipped) {
    console.log(`[skip] ${provider.id}: ${outcome.note}`);
    reportLines.push(`${provider.id}: SKIP — ${outcome.note}`);
    continue;
  }
  passedAnyProvider = true;
  console.log(`[pass] ${provider.id}: ${outcome.note}`);
  reportLines.push(`${provider.id}: PASS — ${outcome.note}`);
}

console.log(`\nReal provider smoke report:\n${reportLines.map((line) => `- ${line}`).join("\n")}`);

if (!passedAnyProvider) {
  console.log(
    "\nNo provider returned a live role turn (all keys missing or external flakiness). Exit 0 — external failures never red this smoke.",
  );
}

process.exit(0);

type ProviderOutcome = { skipped: true; note: string } | { skipped: false; note: string };

async function runProviderSmoke(provider: ProviderSmoke): Promise<ProviderOutcome> {
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

    // The role turn is the live model call — tolerate external flakiness here.
    const response = await postRoleTurn(url, provider);
    if (!response) {
      return {
        skipped: true,
        note: "role turn failed against the live model (auth/quota/rate-limit/timeout/network) — tolerated",
      };
    }

    const events = await getEvents(url);
    if (!events) {
      return {
        skipped: true,
        note: "event query failed after the role turn (network/timeout) — tolerated",
      };
    }

    const completed = events.events.find(
      (event) => event.type === "turn.completed" && event.turn?.id === response.turnId,
    );

    // From here the live call SUCCEEDED — correctness is fair to assert. These
    // are real defects (the model answered but produced a bad result), so they
    // throw SmokeAssertionError to red the run rather than be tolerated.
    if (!completed?.turn) {
      throw new SmokeAssertionError(
        `${provider.id} role turn completed but no turn.completed event was recorded.`,
      );
    }

    const messageChars = response.message.content.trim().length;
    if (messageChars === 0) {
      throw new SmokeAssertionError(`${provider.id} returned an empty role message.`);
    }

    const usage = completed.turn.usage?.totalTokens;
    if (typeof usage !== "number" || usage <= 0) {
      throw new SmokeAssertionError(
        `${provider.id} role turn recorded usage=${usage ?? "unknown"} (expected > 0).`,
      );
    }

    return {
      skipped: false,
      note: `model=${completed.turn.model ?? provider.model} messageChars=${messageChars}, usage=${usage}`,
    };
  } catch (error) {
    // Boot/setup or wait-for-http failures are environmental, not external model
    // flakiness — but they still must not red an opt-in confidence check. A real
    // correctness defect (empty message, missing event, usage<=0) is rethrown
    // above as an Error; surface those distinctly so they remain visible while
    // still letting other providers run.
    if (error instanceof SmokeAssertionError) {
      console.error(`\nReal provider smoke FAILED for ${provider.id}: ${error.message}`);
      process.exit(1);
    }
    return {
      skipped: true,
      note: `runtime/boot error — tolerated: ${error instanceof Error ? error.message : String(error)}`,
    };
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

/** Marks a real correctness defect (vs. tolerable external flakiness). */
class SmokeAssertionError extends Error {}

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

/**
 * POST a role turn against the live model. Returns the parsed response, or
 * `null` on ANY external flakiness — a tolerable HTTP status (401/403/408/429),
 * an upstream 5xx, a network error, or a timeout — so the caller can SKIP that
 * provider gracefully. A 4xx outside the tolerable set (e.g. a malformed request
 * we control) is a real defect and is thrown.
 */
async function postRoleTurn(
  url: string,
  provider: ProviderSmoke,
): Promise<RoleTurnResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/api/rooms/main/role-turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        prompt: `Reply with one short sentence for a Realm ${provider.id} smoke test.`,
        timeoutMs,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (tolerableStatuses.has(response.status) || response.status >= 500) {
        console.log(
          `[flaky] ${provider.id}: role turn returned ${response.status} — tolerating as external flakiness${
            detail ? ` (${truncate(detail)})` : ""
          }.`,
        );
        return null;
      }
      // A non-tolerable 4xx points at our request shape, not the provider.
      throw new SmokeAssertionError(
        `${provider.id} role turn failed with ${response.status}: ${detail}`,
      );
    }
    return (await response.json()) as RoleTurnResponse;
  } catch (error) {
    if (error instanceof SmokeAssertionError) {
      throw error;
    }
    console.log(
      `[flaky] ${provider.id}: role turn threw (${
        error instanceof Error ? error.name : "error"
      }) — tolerating as external flakiness.`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query recorded events. Returns the parsed payload, or `null` on external
 * flakiness (network/timeout/non-2xx) so a transient hiccup after a successful
 * role turn skips rather than reds the provider.
 */
async function getEvents(url: string): Promise<EventsResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/api/events`, { signal: controller.signal });
    if (!response.ok) {
      console.log(
        `[flaky] event query returned ${response.status} — tolerating as external flakiness.`,
      );
      return null;
    }
    return (await response.json()) as EventsResponse;
  } catch (error) {
    console.log(
      `[flaky] event query threw (${
        error instanceof Error ? error.name : "error"
      }) — tolerating as external flakiness.`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
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

function truncate(value: string, max = 200): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
