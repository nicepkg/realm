import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai";
import {
  buildPiRpcArgs,
  buildRealmAgentTools,
  FakePiBridge,
  JsonlDecoder,
  mapAgentEventToBridgeEvents,
  mapPiRpcRecordToBridgeEvents,
  PackagePiBridge,
  parsePiRpcJsonLine,
  SubprocessPiBridge,
} from "./index.ts";

describe("FakePiBridge", () => {
  test("starts a session and emits deterministic prompt events", async () => {
    const bridge = new FakePiBridge();
    const handle = await bridge.startSession({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      allowedSkillPaths: [],
      extensionPaths: [],
    });
    const iterator = handle.events[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({ type: "session.started" });
    await bridge.sendPrompt(handle.id, { message: "Hello" });
    expect((await iterator.next()).value).toMatchObject({ type: "prompt.accepted" });
    expect((await iterator.next()).value).toMatchObject({
      type: "assistant.delta",
      delta: "[leijun] Hello",
    });
    expect((await iterator.next()).value).toMatchObject({
      type: "assistant.message",
      content: "[leijun] Hello",
    });
    await bridge.dispose(handle.id);
  });
});

describe("PackagePiBridge", () => {
  test("reports package-first adapter metadata for turn traces", () => {
    const bridge = new PackagePiBridge();

    expect(bridge.adapterMetadata()).toMatchObject({
      adapterKind: "package",
      fallback: { adapterKind: "subprocess", status: "not-used" },
      packageName: "@earendil-works/pi-agent-core",
    });
    expect(typeof bridge.adapterMetadata().packageVersion).toBe("string");
  });

  test("builds package-first Realm tools from injected extension scope", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return Response.json({ state: { hp: 92 } });
    }) as typeof fetch;
    try {
      const tools = buildRealmAgentTools({
        worldId: "cultivation",
        roomId: "main",
        roleId: "leijun",
        cwd: "/tmp/project",
        sessionDir: "/tmp/session",
        systemPrompt: "You are Lei Jun.",
        allowedSkillPaths: [],
        extensionPaths: [],
        env: {
          REALM_EXTENSION_BASE_URL: "http://127.0.0.1:3999",
          REALM_EXTENSION_TOKEN: "token",
          REALM_EXTENSION_WORLD_ID: "cultivation",
          REALM_EXTENSION_ROLE_ID: "leijun",
        },
      });

      expect(tools.map((tool) => tool.name)).toEqual([
        "realm_state_query",
        "realm_memory_read",
        "realm_memory_write",
      ]);
      await tools[0]?.execute("tool-1", { path: "/privateState" });

      expect(requests[0]).toMatchObject({
        url: "http://127.0.0.1:3999/api/extension/state-query",
        body: {
          toolCallId: "tool-1",
          worldId: "cultivation",
          roleId: "leijun",
          path: "/privateState",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("runs through Pi's package runtime without spawning the CLI", async () => {
    const faux = registerFauxProvider({ tokensPerSecond: 0 });
    faux.setResponses([fauxAssistantMessage("package reply")]);
    const bridge = new PackagePiBridge({ resolveModel: () => faux.getModel() });
    const handle = await bridge.startSession({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      allowedSkillPaths: [],
      extensionPaths: [],
    });
    const iterator = handle.events[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({ type: "session.started" });
    await bridge.sendPrompt(handle.id, { message: "Hello" });
    expect((await iterator.next()).value).toMatchObject({ type: "prompt.accepted" });

    const events = await readUntilAssistantMessage(iterator);
    const deltaText = events
      .filter((event) => event?.type === "assistant.delta")
      .map((event) => event.delta)
      .join("");
    expect(deltaText).toBe("package reply");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "assistant.message", content: "package reply" }),
    );

    await bridge.dispose(handle.id);
    faux.unregister();
  });
});

describe("Pi RPC JSONL helpers", () => {
  test("splits on LF only and preserves unicode separators", () => {
    const decoder = new JsonlDecoder();
    const lines = decoder.push('{"type":"event","text":"a b c"}\n{"type":"response"}\r\n');

    expect(lines).toEqual(['{"type":"event","text":"a b c"}', '{"type":"response"}']);
    expect(decoder.flush()).toEqual([]);
  });

  test("parses JSON records and strips CR", () => {
    expect(parsePiRpcJsonLine('{"type":"response","success":true}\r')).toMatchObject({
      type: "response",
      success: true,
    });
  });
});

describe("Pi subprocess adapter", () => {
  test("reports subprocess adapter metadata for diagnostic traces", () => {
    const bridge = new SubprocessPiBridge({ binary: "/usr/local/bin/pi" });

    expect(bridge.adapterMetadata()).toEqual({
      adapterKind: "subprocess",
      binary: "/usr/local/bin/pi",
      fallback: {
        adapterKind: "subprocess",
        reason: "Subprocess bridge is the active adapter.",
        status: "available",
      },
    });
  });

  test("builds a locked-down Pi RPC command line", () => {
    const args = buildPiRpcArgs(
      {
        worldId: "cultivation",
        roomId: "main",
        roleId: "leijun",
        cwd: "/tmp/project",
        sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "You are Lei Jun.",
        allowedSkillPaths: ["/skills/leijun"],
        extensionPaths: ["/extensions/realm.ts"],
      },
      ["--offline"],
    );

    expect(args).toEqual([
      "--mode",
      "rpc",
      "--session-dir",
      "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      "--system-prompt",
      "You are Lei Jun.",
      "--no-context-files",
      "--no-builtin-tools",
      "--no-extensions",
      "--provider",
      "openai",
      "--model",
      "gpt-5",
      "--extension",
      "/extensions/realm.ts",
      "--skill",
      "/skills/leijun",
      "--offline",
    ]);
  });

  test("maps Pi RPC stream records into Realm bridge events", () => {
    expect(
      mapPiRpcRecordToBridgeEvents("session-1", {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "hello" },
      }),
    ).toEqual([{ type: "assistant.delta", sessionId: "session-1", delta: "hello" }]);

    expect(
      mapPiRpcRecordToBridgeEvents("session-1", {
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      }),
    ).toEqual([{ type: "assistant.message", sessionId: "session-1", content: "done" }]);

    expect(
      mapPiRpcRecordToBridgeEvents("session-1", {
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName: "realm_state_query",
      }),
    ).toEqual([
      {
        type: "tool.started",
        sessionId: "session-1",
        toolCallId: "tool-1",
        toolName: "realm_state_query",
      },
    ]);
  });

  test("maps Pi package agent events into Realm bridge events", () => {
    expect(
      mapAgentEventToBridgeEvents("session-1", {
        type: "message_update",
        message: { role: "assistant", content: [{ type: "text", text: "he" }] },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "he", partial: {} },
      } as never),
    ).toEqual([{ type: "assistant.delta", sessionId: "session-1", delta: "he" }]);

    expect(
      mapAgentEventToBridgeEvents("session-1", {
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      } as never),
    ).toEqual([{ type: "assistant.message", sessionId: "session-1", content: "done" }]);
  });

  test("extracts model usage from assistant message end events", () => {
    const usage = usageSnapshot();

    expect(
      mapAgentEventToBridgeEvents("session-1", {
        type: "message_end",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-5",
          usage,
          content: [{ type: "text", text: "done" }],
        },
      } as never),
    ).toEqual([
      {
        type: "usage.reported",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        usage,
      },
      { type: "assistant.message", sessionId: "session-1", content: "done" },
    ]);
  });

  test("maps Pi package assistant errors into session errors", () => {
    expect(
      mapAgentEventToBridgeEvents("session-1", {
        type: "message_end",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-4o-mini",
          stopReason: "error",
          errorMessage: "OpenAI API error (401): permission denied",
          content: [],
        },
      } as never),
    ).toEqual([
      {
        type: "session.error",
        sessionId: "session-1",
        message: "Pi openai/gpt-4o-mini failed: OpenAI API error (401): permission denied",
      },
    ]);
  });

  test("sends prompt commands and resolves prompt acceptance", async () => {
    const fakeProcess = new FakeChildProcess();
    let spawnedEnv: NodeJS.ProcessEnv | undefined;
    const bridge = new SubprocessPiBridge({
      binary: "pi",
      commandTimeoutMs: 500,
      spawnProcess: (_command, _args, options) => {
        spawnedEnv = options.env;
        return fakeProcess.asChildProcess();
      },
    });
    const handle = await bridge.startSession({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      allowedSkillPaths: [],
      extensionPaths: [],
      env: { REALM_EXTENSION_TOKEN: "secret" },
    });
    const iterator = handle.events[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ type: "session.started" });

    const promptPromise = bridge.sendPrompt(handle.id, { message: "hello" });
    const command = await fakeProcess.nextCommand();
    expect(command).toMatchObject({ type: "prompt", message: "hello" });
    fakeProcess.stdout.write(
      `${JSON.stringify({ id: command.id, type: "response", command: "prompt", success: true })}\n`,
    );
    await promptPromise;

    expect(spawnedEnv?.REALM_EXTENSION_TOKEN).toBe("secret");
    expect((await iterator.next()).value).toMatchObject({
      type: "prompt.accepted",
      requestId: command.id,
    });
    await bridge.dispose(handle.id);
  });
  test("emits subprocess heartbeat events when enabled", async () => {
    const fakeProcess = new FakeChildProcess();
    const bridge = new SubprocessPiBridge({
      heartbeatIntervalMs: 1,
      spawnProcess: () => fakeProcess.asChildProcess(),
    });
    const handle = await bridge.startSession({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      allowedSkillPaths: [],
      extensionPaths: [],
    });
    const iterator = handle.events[Symbol.asyncIterator]();

    expect(await nextEventWithTimeout(iterator)).toMatchObject({ type: "session.started" });
    expect(await nextEventWithTimeout(iterator)).toMatchObject({
      type: "session.heartbeat",
      status: "alive",
    });
    await bridge.dispose(handle.id);
  });

  test("emits subprocess restart events when enabled", async () => {
    const processes = [new FakeChildProcess(), new FakeChildProcess()];
    let spawnCount = 0;
    const bridge = new SubprocessPiBridge({
      restartOnFailure: true,
      maxRestarts: 1,
      spawnProcess: () => {
        const nextProcess = processes[spawnCount];
        if (!nextProcess) {
          throw new Error("Unexpected spawn");
        }
        spawnCount += 1;
        return nextProcess.asChildProcess();
      },
    });
    const handle = await bridge.startSession({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      allowedSkillPaths: [],
      extensionPaths: [],
    });
    const iterator = handle.events[Symbol.asyncIterator]();

    expect(await nextEventWithTimeout(iterator)).toMatchObject({ type: "session.started" });
    processes[0]?.emit("exit", 1, null);

    expect(await nextEventWithTimeout(iterator)).toMatchObject({
      type: "session.restarted",
      attempt: 1,
    });
    expect(spawnCount).toBe(2);
    await bridge.dispose(handle.id);
  });
});

class FakeChildProcess extends EventEmitter {
  private static nextPid = 10_000;

  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = FakeChildProcess.nextPid++;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor() {
    super();
    this.stdin.setEncoding("utf8");
  }

  asChildProcess(): never {
    return this as never;
  }

  kill(): boolean {
    this.exitCode = 0;
    return true;
  }

  async nextCommand(): Promise<Record<string, unknown>> {
    const chunk = await new Promise<Buffer>((resolve) => {
      this.stdin.once("data", resolve);
    });
    return JSON.parse(chunk.toString("utf8").trim()) as Record<string, unknown>;
  }
}

async function readUntilAssistantMessage(
  iterator: AsyncIterator<unknown>,
): Promise<Array<Record<string, string>>> {
  const events: Array<Record<string, string>> = [];
  while (events.length < 20) {
    const result = await iterator.next();
    if (result.done) {
      break;
    }
    const event = result.value as Record<string, string>;
    events.push(event);
    if (event.type === "assistant.message") {
      break;
    }
  }
  return events;
}

async function nextEventWithTimeout(iterator: AsyncIterator<unknown>): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next().then((result) => result.value),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timed out waiting for event")), 250);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function usageSnapshot() {
  return {
    input: 10,
    output: 5,
    cacheRead: 2,
    cacheWrite: 1,
    totalTokens: 18,
    cost: {
      input: 0.00001,
      output: 0.00002,
      cacheRead: 0.000001,
      cacheWrite: 0.000002,
      total: 0.000033,
    },
  };
}
