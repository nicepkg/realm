import { describe, expect, test } from "bun:test";
import { buildRandomNaturalEvent } from "./index.ts";

describe("natural event scheduler", () => {
  test("builds deterministic natural events from a seed", () => {
    const first = buildRandomNaturalEvent({
      worldId: "cultivation",
      roleIds: ["leijun", "guchenfeng"],
      seed: "day-1",
    });
    const second = buildRandomNaturalEvent({
      worldId: "cultivation",
      roleIds: ["leijun", "guchenfeng"],
      seed: "day-1",
    });

    expect(second).toEqual(first);
    expect(first.operations.length).toBeGreaterThan(0);
  });

  test("falls back to public world events when no roles are available", () => {
    const event = buildRandomNaturalEvent({ worldId: "empty", roleIds: [], seed: "no-roles" });

    expect(event.operations[0]?.path.startsWith("/publicState")).toBe(true);
  });
});
