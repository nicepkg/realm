import { describe, expect, test } from "bun:test";
import { RealmHttpClient } from "./index.ts";

describe("RealmHttpClient world events", () => {
  test("posts typed world event engine commands and reads replay", async () => {
    const requestPaths: string[] = [];
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        const url = new URL(String(input), "http://realm.test");
        requestPaths.push(`${url.pathname}${url.search}`);
        if (url.pathname.endsWith("/events/replay")) {
          return Response.json({
            worldId: "cultivation",
            fromSeq: 1,
            toSeq: 4,
            replayHash: "a".repeat(64),
            events: [],
          });
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const event = {
          id: "world-event:1",
          worldId: "cultivation",
          kind: worldEventKind(url.pathname),
          title: body.title ?? "Random",
          description: body.description ?? "Random event.",
          severity: body.severity ?? "minor",
          targetRoleIds: body.targetRoleIds ?? [],
          patchId: "state-patch:1",
          stateVersion: 1,
          status: "committed",
          createdAt: "2026-05-27T00:00:00.000Z",
        };
        if (url.pathname.endsWith("/events/tick")) {
          return Response.json({
            event,
            tick: {
              id: "world-tick:1",
              worldId: "cultivation",
              tick: body.tick ?? 1,
              seed: body.seed ?? "seed",
              eventId: event.id,
              stateVersion: 1,
              status: "triggered",
              createdAt: "2026-05-27T00:00:00.000Z",
            },
          });
        }
        return Response.json({ event });
      }) as typeof fetch,
    });

    await client.triggerManualWorldEvent("cultivation", {
      title: "Storm",
      description: "Weather changes.",
      operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
    });
    await client.triggerGodAdjudicatedWorldEvent("cultivation", {
      title: "Duel Result",
      description: "God adjudicates a duel.",
      operations: [{ op: "set", path: "/publicState/duel", value: "settled" }],
    });
    await client.triggerRandomWorldEvent("cultivation", { seed: "day-1" });
    const tick = await client.triggerWorldTick("cultivation", { tick: 1, seed: "day-1" });
    await client.triggerConditionWorldEvent("cultivation", {
      title: "Reward",
      description: "Condition matched.",
      condition: { path: "/publicState/weather", exists: true },
      operations: [{ op: "set", path: "/publicState/reward", value: "sunlight" }],
    });
    const replay = await client.getWorldEventReplay("cultivation");

    expect(requestPaths).toEqual([
      "/api/worlds/cultivation/events/manual",
      "/api/worlds/cultivation/events/god-adjudicated",
      "/api/worlds/cultivation/events/random",
      "/api/worlds/cultivation/events/tick",
      "/api/worlds/cultivation/events/condition",
      "/api/worlds/cultivation/events/replay?afterSeq=0",
    ]);
    expect(tick.tick.tick).toBe(1);
    expect(replay.replayHash).toHaveLength(64);
  });
});

function worldEventKind(pathname: string): string {
  if (pathname.endsWith("/god-adjudicated")) {
    return "god-adjudicated";
  }
  if (pathname.endsWith("/condition")) {
    return "condition";
  }
  return pathname.endsWith("/random") ? "random" : "manual";
}
