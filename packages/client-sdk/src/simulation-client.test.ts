import { describe, expect, test } from "bun:test";
import { RealmHttpClient } from "./index.ts";

describe("RealmSimulationClient", () => {
  test("uses typed simulation endpoints through a nested client", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const client = new RealmHttpClient({
      baseUrl: "http://realm.test",
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return Response.json(responseFor(String(url)));
      }) as typeof fetch,
    });

    await client.simulation.getStatus("cultivation");
    await client.simulation.runTicks("cultivation", { ticks: 2, seed: "typed" });
    await client.simulation.pause("cultivation", { reason: "pause" });
    await client.simulation.resume("cultivation", { reason: "resume" });
    await client.simulation.exportWorld("cultivation");
    await client.simulation.fork("cultivation", { label: "branch" });
    await client.simulation.startBackground("cultivation", { ticks: 1, intervalMs: 10 });
    await client.simulation.stopBackground("run-1");

    expect(calls.map((call) => call.url)).toEqual([
      "http://realm.test/api/worlds/cultivation/simulation/status",
      "http://realm.test/api/worlds/cultivation/simulation/ticks",
      "http://realm.test/api/worlds/cultivation/simulation/pause",
      "http://realm.test/api/worlds/cultivation/simulation/resume",
      "http://realm.test/api/worlds/cultivation/simulation/export?afterSeq=0",
      "http://realm.test/api/worlds/cultivation/simulation/forks",
      "http://realm.test/api/worlds/cultivation/simulation/background",
      "http://realm.test/api/simulation/background/run-1/stop",
    ]);
    expect(calls[1]?.body).toMatchObject({ ticks: 2, seed: "typed" });
  });
});

function responseFor(url: string): unknown {
  if (url.endsWith("/status")) {
    return { worldId: "cultivation", paused: false, tick: 0, activeRuns: [] };
  }
  if (url.endsWith("/ticks")) {
    return {
      worldId: "cultivation",
      status: "completed",
      ticks: [],
      eventCount: 0,
      replayHash: "hash",
    };
  }
  if (url.endsWith("/pause") || url.endsWith("/resume")) {
    return { worldId: "cultivation", paused: url.endsWith("/pause"), stateVersion: 1 };
  }
  if (url.includes("/export")) {
    return {
      worldId: "cultivation",
      exportedAt: "2026-05-27T00:00:00.000Z",
      fromSeq: 0,
      toSeq: 0,
      eventCount: 0,
      replayHash: "hash",
      stateHash: "state",
      state: {},
      events: [],
    };
  }
  if (url.endsWith("/forks")) {
    return {
      forkId: "fork-1",
      worldId: "cultivation",
      label: "branch",
      path: "/tmp/fork.json",
      replayHash: "hash",
      stateHash: "state",
    };
  }
  return {
    runId: "run-1",
    worldId: "cultivation",
    status: url.endsWith("/stop") ? "stopped" : "running",
    intervalMs: 10,
    plannedTicks: 1,
  };
}
