import { describe, expect, test } from "bun:test";
import { realmEventSchema, statePatchSchema } from "./index.ts";

describe("core contracts", () => {
  test("accepts versioned state patch with idempotency key", () => {
    const patch = statePatchSchema.parse({
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      idempotencyKey: "k1",
      operations: [{ op: "set", path: "/publicState/roles/leijun/realm", value: "qi-7" }],
      reason: "Initial realm",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(patch.expectedVersion).toBe(0);
  });

  test("rejects non JSON Pointer patch paths", () => {
    expect(() =>
      statePatchSchema.parse({
        id: "patch:1",
        worldId: "cultivation",
        actorId: "god",
        proposedBy: "owner",
        baseVersion: 0,
        expectedVersion: 0,
        operations: [{ op: "set", path: "publicState.roles", value: true }],
        reason: "Invalid",
        createdAt: "2026-05-26T00:00:00.000Z",
      }),
    ).toThrow();
  });

  test("accepts event envelope", () => {
    const event = realmEventSchema.parse({
      eventId: "event:1",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "room:main",
      correlationId: "corr:1",
      createdAt: "2026-05-26T00:00:00.000Z",
      type: "config.reloaded",
      projectId: "project:demo",
    });

    expect(event.seq).toBe(1);
  });

  test("accepts turn delta trace events", () => {
    const event = realmEventSchema.parse({
      eventId: "event:turn-delta:1",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "turn:1",
      correlationId: "corr:1",
      createdAt: "2026-05-26T00:00:00.000Z",
      type: "turn.delta",
      delta: {
        turnId: "turn:1",
        roleId: "leijun",
        delta: "hello",
      },
    });

    expect(event.type).toBe("turn.delta");
  });

  test("accepts turn summaries with model usage", () => {
    const event = realmEventSchema.parse({
      eventId: "event:turn-completed:1",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "turn:1",
      correlationId: "corr:1",
      createdAt: "2026-05-26T00:00:00.000Z",
      type: "turn.completed",
      turn: {
        id: "turn:1",
        worldId: "cultivation",
        roomId: "main",
        actorId: "leijun",
        status: "completed",
        model: "gpt-5.5",
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    });

    expect(event.type).toBe("turn.completed");
  });
});
