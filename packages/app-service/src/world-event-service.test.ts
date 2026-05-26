import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { RealmApplicationService } from "./index.ts";

describe("WorldEventService", () => {
  test("triggers manual events with patch trail, event message, and replay hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-world-event-manual-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const response = await service.worldEvents.triggerManualEvent({
      worldId: "cultivation",
      roomId: "main",
      title: "Sudden Storm",
      description: "The weather shifts and everyone must adapt.",
      operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
      idempotencyKey: "manual-storm",
    });
    const replay = service.worldEvents.getReplay({ worldId: "cultivation" });

    expect(response.event).toMatchObject({
      kind: "manual",
      title: "Sudden Storm",
      patchId: response.patch?.id,
      messageId: response.message?.id,
      status: "committed",
      stateVersion: 1,
    });
    expect(response.result).toMatchObject({ status: "committed", version: 1 });
    expect(service.listMessages("main")[0]).toMatchObject({
      displayedAuthorId: "god",
      content: expect.stringContaining("Sudden Storm"),
    });
    expect(service.listEvents().map((event) => event.type)).toContain("world.event.triggered");
    expect(replay.events.map((event) => event.type)).toEqual([
      "state.patch.proposed",
      "state.patch.committed",
      "message.created",
      "world.event.triggered",
    ]);
    expect(replay.replayHash).toHaveLength(64);
  });

  test("skips condition events when the visible state condition does not match", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-world-event-condition-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const response = await service.worldEvents.triggerConditionEvent({
      worldId: "cultivation",
      title: "Clear Sky Reward",
      description: "Only happens when weather exists.",
      condition: { path: "/publicState/weather", exists: true },
      operations: [{ op: "set", path: "/publicState/reward", value: "sunlight" }],
      idempotencyKey: "condition-weather",
    });

    expect(response.event).toMatchObject({
      kind: "condition",
      status: "skipped",
      reason: "Condition did not match current state.",
    });
    expect(service.listEvents().filter((event) => event.type === "state.patch.committed")).toEqual(
      [],
    );
  });

  test("triggers deterministic ticks and returns duplicate ticks by idempotency key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-world-event-tick-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const first = await service.worldEvents.triggerTick({
      worldId: "cultivation",
      tick: 1,
      seed: "day-1",
      targetRoleIds: ["leijun", "guchenfeng"],
      idempotencyKey: "tick-day-1",
    });
    const duplicate = await service.worldEvents.triggerTick({
      worldId: "cultivation",
      tick: 1,
      seed: "different-seed",
      targetRoleIds: ["leijun", "guchenfeng"],
      idempotencyKey: "tick-day-1",
    });

    expect(first.tick).toMatchObject({
      worldId: "cultivation",
      tick: 1,
      eventId: first.event.id,
      status: "triggered",
    });
    expect(duplicate.tick.id).toBe(first.tick.id);
    expect(duplicate.event.id).toBe(first.event.id);
    expect(first.event.targetRoleIds.length).toBeGreaterThanOrEqual(0);
    expect(service.listEvents().map((event) => event.type)).toContain("world.tick.triggered");
  });
});
