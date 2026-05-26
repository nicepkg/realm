import { describe, expect, test } from "bun:test";
import {
  FakePiBridge,
  type PiBridge,
  type PiBridgeEvent,
  type PiPromptInput,
  type PiSessionHandle,
  type PiSessionStartInput,
} from "@realm/pi-bridge";
import { InMemoryEventStore } from "@realm/storage";
import { FakeVerticalSliceRuntime, PiRoleTurnRunner } from "./index.ts";

describe("FakeVerticalSliceRuntime", () => {
  test("produces deterministic P1 event sequence", () => {
    const result = new FakeVerticalSliceRuntime().run({
      seed: 1,
      clockStart: new Date("2026-05-26T00:00:00.000Z"),
    });

    expect(result.events.map((event) => event.type)).toEqual([
      "message.created",
      "turn.started",
      "message.created",
      "turn.completed",
      "turn.started",
      "message.created",
      "turn.completed",
      "state.patch.proposed",
      "state.patch.committed",
      "audit.created",
    ]);
    expect(result.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.stateVersion).toBe(1);
  });
});

describe("PiRoleTurnRunner", () => {
  test("runs a Pi-backed role turn through the bridge contract", async () => {
    const eventStore = new InMemoryEventStore();
    const runner = new PiRoleTurnRunner(
      new FakePiBridge(),
      eventStore,
      fakeClock(new Date("2026-05-26T00:00:00.000Z")),
    );

    const result = await runner.run({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      prompt: "Hello",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      timeoutMs: 500,
    });

    expect(result.message.content).toBe("[leijun] Hello");
    expect(eventStore.list().map((event) => event.type)).toEqual([
      "turn.started",
      "turn.delta",
      "message.created",
      "turn.completed",
    ]);
  });

  test("attaches Pi usage to completed turns", async () => {
    const runner = new PiRoleTurnRunner(
      new UsagePiBridge(),
      new InMemoryEventStore(),
      fakeClock(new Date("2026-05-26T00:00:00.000Z")),
    );

    const result = await runner.run({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      prompt: "Hello",
      cwd: "/tmp/project",
      sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
      systemPrompt: "You are Lei Jun.",
      timeoutMs: 500,
    });

    expect(result.turn.model).toBe("gpt-5");
    expect(result.turn.usage).toMatchObject({ input: 10, output: 5, totalTokens: 15 });
  });

  test("emits turn.failed as a distinct event type", async () => {
    const eventStore = new InMemoryEventStore();
    const runner = new PiRoleTurnRunner(
      new ErrorPiBridge(),
      eventStore,
      fakeClock(new Date("2026-05-26T00:00:00.000Z")),
    );

    await expect(
      runner.run({
        worldId: "cultivation",
        roomId: "main",
        roleId: "leijun",
        prompt: "Hello",
        cwd: "/tmp/project",
        sessionDir: "/tmp/project/.agents/state/pi-sessions/cultivation/main/leijun",
        systemPrompt: "You are Lei Jun.",
        timeoutMs: 500,
      }),
    ).rejects.toThrow("model failed");

    expect(eventStore.list().map((event) => event.type)).toContain("turn.failed");
  });
});

class UsagePiBridge implements PiBridge {
  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    return {
      id: "session-usage",
      sessionDir: input.sessionDir,
      events: usageEvents(input.sessionDir),
    };
  }

  async sendPrompt(_sessionId: string, _input: PiPromptInput): Promise<void> {}

  async abort(_sessionId: string): Promise<void> {}

  async dispose(_sessionId: string): Promise<void> {}
}

class ErrorPiBridge implements PiBridge {
  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    return {
      id: "session-error",
      sessionDir: input.sessionDir,
      events: errorEvents(input.sessionDir),
    };
  }

  async sendPrompt(_sessionId: string, _input: PiPromptInput): Promise<void> {}

  async abort(_sessionId: string): Promise<void> {}

  async dispose(_sessionId: string): Promise<void> {}
}

async function* errorEvents(sessionDir: string): AsyncIterable<PiBridgeEvent> {
  yield { type: "session.started", sessionId: "session-error", sessionDir };
  yield { type: "session.error", sessionId: "session-error", message: "model failed" };
}

async function* usageEvents(sessionDir: string): AsyncIterable<PiBridgeEvent> {
  yield { type: "session.started", sessionId: "session-usage", sessionDir };
  yield {
    type: "usage.reported",
    sessionId: "session-usage",
    model: "gpt-5",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  yield { type: "assistant.message", sessionId: "session-usage", content: "done" };
}

function fakeClock(start: Date): () => Date {
  let current = start.getTime();
  return () => {
    current += 1000;
    return new Date(current);
  };
}
