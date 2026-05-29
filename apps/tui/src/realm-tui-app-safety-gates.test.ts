import { describe, expect, test } from "bun:test";
import { RealmTuiApp } from "./realm-tui-app.ts";
import type { TuiState } from "./types.ts";

describe("RealmTuiApp sim / model / rollback safety gates", () => {
  test("every tick (including a single tick) and fork arm a confirmation", async () => {
    const app = new RealmTuiApp();
    const calls: string[] = [];
    const world = {
      defaultRoomId: "main",
      id: "cultivation",
      mode: { time: { kind: "manual" }, type: "game" } as const,
      name: "Cultivation",
      roleIds: [],
    };
    const harness = app as unknown as {
      client: {
        getEffectiveConfig: () => Promise<{
          project: { defaultWorldId: string; name: string; root: string };
          roles: TuiState["roles"];
          worlds: NonNullable<TuiState["world"]>[];
        }>;
        getEffectivePolicy: () => Promise<{
          capabilities: [];
          roleWorlds: [];
          trustTier: "run-roles";
          warnings: string[];
        }>;
        getSettings: () => Promise<{
          project: Record<string, unknown>;
          user: { defaultModel: string; defaultProvider: string };
        }>;
        getWorldState: (
          worldId: string,
        ) => Promise<{ state: Record<string, unknown>; version: number; worldId: string }>;
        listEvents: () => Promise<{ events: []; lastSeq: number }>;
        listMessages: (roomId: string) => Promise<{ messages: [] }>;
        listRooms: (worldId: string) => Promise<{ rooms: NonNullable<TuiState["room"]>[] }>;
        simulation: {
          runTicks: (
            worldId: string,
            input: { ticks: number },
          ) => Promise<{ eventCount: number; ticks: unknown[] }>;
          fork: (
            worldId: string,
            input: { label?: string },
          ) => Promise<{ forkId: string; label: string }>;
        };
      };
      state: TuiState;
    };
    harness.client.simulation.runTicks = async (worldId, input) => {
      calls.push(`tick:${worldId}:${input.ticks}`);
      return { eventCount: 2, ticks: new Array(input.ticks).fill(null) };
    };
    harness.client.simulation.fork = async (worldId, input) => {
      calls.push(`fork:${worldId}:${input.label ?? ""}`);
      return { forkId: "fork-1", label: input.label ?? "fork-1" };
    };
    harness.client.getEffectiveConfig = async () => ({
      project: { defaultWorldId: "cultivation", name: "demo", root: "/tmp/demo" },
      roles: [],
      worlds: [world],
    });
    harness.client.listRooms = async () => ({ rooms: [] });
    harness.client.listMessages = async () => ({ messages: [] });
    harness.client.listEvents = async () => ({ events: [], lastSeq: 0 });
    harness.client.getSettings = async () => ({
      project: {},
      user: { defaultModel: "default", defaultProvider: "fake" },
    });
    harness.client.getEffectivePolicy = async () => ({
      capabilities: [],
      roleWorlds: [],
      trustTier: "run-roles",
      warnings: [],
    });
    harness.client.getWorldState = async (worldId) => ({ state: {}, version: 0, worldId });
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [],
      rooms: [],
      world,
      worlds: [],
    };

    const tickPrompt = await app.handleInteractiveInput(
      ":sim tick 5",
      () => {},
      async () => {},
    );
    expect(tickPrompt).toContain("cultivation");
    expect(calls).toEqual([]);
    const stillPending = await app.handleInteractiveInput(
      "y",
      () => {},
      async () => {},
    );
    expect(stillPending).toContain("cultivation");
    expect(calls).toEqual([]);
    await app.handleInteractiveInput(
      "cultivation",
      () => {},
      async () => {},
    );
    expect(calls).toEqual(["tick:cultivation:5"]);

    harness.state = { ...harness.state, world };
    const forkPrompt = await app.handleInteractiveInput(
      ":sim fork",
      () => {},
      async () => {},
    );
    expect(forkPrompt).toContain("cultivation");
    expect(calls).toEqual(["tick:cultivation:5"]);
    await app.handleInteractiveInput(
      "cultivation",
      () => {},
      async () => {},
    );
    expect(calls).toEqual(["tick:cultivation:5", "fork:cultivation:"]);

    // A single `tick 1` is an irreversible persisted-world write with no
    // automatic undo, so it gates exactly like a multi-tick: it must NOT run
    // directly — the operator re-types the world id to confirm.
    harness.state = { ...harness.state, world };
    const singleTickPrompt = await app.handleInteractiveInput(
      ":sim tick 1",
      () => {},
      async () => {},
    );
    expect(singleTickPrompt).toContain("cultivation");
    expect(calls).toEqual(["tick:cultivation:5", "fork:cultivation:"]);
    await app.handleInteractiveInput(
      "cultivation",
      () => {},
      async () => {},
    );
    expect(calls).toEqual(["tick:cultivation:5", "fork:cultivation:", "tick:cultivation:1"]);
  });

  test("model change arms a confirmation before writing user settings", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as {
      client: {
        getSettings: () => Promise<{
          project: Record<string, unknown>;
          user: { defaultModel: string; defaultProvider: string };
        }>;
        updateUserSettings: (input: {
          defaultModel: string;
          defaultProvider: string;
        }) => Promise<{ user: { defaultModel: string; defaultProvider: string } }>;
      };
      state: TuiState;
    };
    let wrote: { defaultModel: string; defaultProvider: string } | undefined;
    harness.client.getSettings = async () => ({
      project: {},
      user: { defaultModel: "default", defaultProvider: "fake" },
    });
    harness.client.updateUserSettings = async (input) => {
      wrote = { defaultModel: input.defaultModel, defaultProvider: input.defaultProvider };
      return { user: { defaultModel: input.defaultModel, defaultProvider: input.defaultProvider } };
    };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [],
      rooms: [],
      worlds: [],
    };

    const prompt = await app.handleInteractiveInput(
      ":model openai gpt-x",
      () => {},
      async () => {},
    );
    expect(prompt).toContain("fake/default");
    expect(prompt).toContain("openai/gpt-x");
    expect(wrote).toBeUndefined();

    const confirmed = await app.handleInteractiveInput(
      "y",
      () => {},
      async () => {},
    );
    expect(wrote).toEqual({ defaultModel: "gpt-x", defaultProvider: "openai" });
    expect(confirmed).toContain("openai/gpt-x");
  });

  test("rollback command calls the SDK and renders restored paths", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as {
      client: {
        getEffectiveConfig: () => Promise<{
          project: { defaultWorldId: string; name: string; root: string };
          roles: TuiState["roles"];
          worlds: NonNullable<TuiState["world"]>[];
        }>;
        getEffectivePolicy: () => Promise<{
          capabilities: [];
          roleWorlds: [];
          trustTier: "run-roles";
          warnings: string[];
        }>;
        getSettings: () => Promise<{
          project: Record<string, unknown>;
          user: { defaultModel: string; defaultProvider: string };
        }>;
        listEvents: () => Promise<{ events: []; lastSeq: number }>;
        rollbackConfig: (
          historyId: string,
        ) => Promise<{ historyId: string; restoredPaths: string[] }>;
      };
      state: TuiState;
    };
    let requested: string | undefined;
    harness.client.rollbackConfig = async (historyId) => {
      requested = historyId;
      return { historyId, restoredPaths: ["roles/leijun.yaml", "worlds/cultivation.yaml"] };
    };
    harness.client.getEffectiveConfig = async () => ({
      project: { defaultWorldId: "cultivation", name: "demo", root: "/tmp/demo" },
      roles: [],
      worlds: [],
    });
    harness.client.listEvents = async () => ({ events: [], lastSeq: 0 });
    harness.client.getSettings = async () => ({
      project: {},
      user: { defaultModel: "default", defaultProvider: "fake" },
    });
    harness.client.getEffectivePolicy = async () => ({
      capabilities: [],
      roleWorlds: [],
      trustTier: "run-roles",
      warnings: [],
    });
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [],
      rooms: [],
      worlds: [],
    };

    const notice = await app.handleInteractiveInput(
      ":rollback history-7",
      () => {},
      async () => {},
    );
    expect(requested).toBe("history-7");
    expect(notice).toContain("roles/leijun.yaml");
    expect(notice).toContain("worlds/cultivation.yaml");
  });
});
