import { describe, expect, test } from "bun:test";
import { RealmTuiApp } from "./realm-tui-app.ts";
import type { TuiState } from "./types.ts";

const ROLE_GU = {
  id: "gu-chen-feng",
  displayName: "顾辰风",
  model: "default",
  source: "config" as const,
};
const ROOM_MAIN = {
  id: "main",
  memberIds: ["owner", "gu-chen-feng"],
  name: "全员议事",
  type: "group" as const,
  worldId: "cultivation",
};
const WORLD_CULT = {
  defaultRoomId: "main",
  id: "cultivation",
  mode: { time: { kind: "manual" as const }, type: "game" as const },
  name: "云岭修仙界",
  roleIds: ["gu-chen-feng"],
};

/** State with one world, one room, and 顾辰风 as a member — enough for the NL gates. */
function nlState(): TuiState {
  return {
    events: [],
    identity: "owner",
    messages: [],
    projectName: "demo",
    roles: [ROLE_GU],
    room: ROOM_MAIN,
    rooms: [ROOM_MAIN],
    world: WORLD_CULT,
    worlds: [WORLD_CULT],
  };
}

const noop = () => {};
const noopAsync = async () => {};

describe("RealmTuiApp interactive safety", () => {
  test("role picker selection prompts instead of switching identity directly", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as { state: TuiState };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      worlds: [],
    };

    const notice = await app.applyPaletteItem("role:leijun");
    expect(notice).toContain("Switch composer identity");
    expect(harness.state.identity).toBe("owner");

    // A bare "y" must NOT commit a dangerous identity takeover by accidental
    // Enter — it stays pending until the operator types the exact role id.
    const stillPending = await app.handleInteractiveInput(
      "y",
      () => {},
      async () => {},
    );
    expect(stillPending).toContain("Switch composer identity");
    expect(harness.state.identity).toBe("owner");

    const confirmed = await app.handleInteractiveInput(
      "leijun",
      () => {},
      async () => {},
    );
    expect(confirmed).toContain("Lei Jun");
    expect(harness.state.identity).toBe("leijun");
  });

  test("God is not available as a casual chat identity", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as { state: TuiState };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      worlds: [],
    };

    const notice = await app.handleInteractiveInput(
      ":id god",
      () => {},
      async () => {},
    );

    expect(notice).toContain("ignored");
    expect(harness.state.identity).toBe("owner");
  });

  test("role picker ignores God because God actions use the protected command", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as { state: TuiState };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      worlds: [],
    };

    const notice = await app.applyPaletteItem("role:god");

    expect(notice).toContain("ignored");
    expect(harness.state.identity).toBe("owner");
  });

  test("memory command uses the operator role memory endpoint", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as {
      client: { readRoleMemory: (worldId: string, roleId: string) => Promise<{ content: string }> };
      state: TuiState;
    };
    let request: [string, string] | undefined;
    harness.client.readRoleMemory = async (worldId, roleId) => {
      request = [worldId, roleId];
      return { content: "remember launch plan" };
    };
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      world: {
        defaultRoomId: "main",
        id: "cultivation",
        mode: { time: { kind: "manual" }, type: "game" },
        name: "Cultivation",
        roleIds: ["leijun"],
      },
      worlds: [],
    };

    const notice = await app.handleInteractiveInput(
      ":memory leijun",
      () => {},
      async () => {},
    );

    expect(request).toEqual(["cultivation", "leijun"]);
    expect(notice).toContain("leijun");
    expect(harness.state.memoryInspection).toContain("remember launch plan");
  });

  test("run-role command requires confirmation before calling the SDK", async () => {
    const app = new RealmTuiApp();
    const harness = app as unknown as {
      client: {
        getEffectiveConfig: () => Promise<{
          project: { defaultWorldId: string; name: string; root: string };
          roles: TuiState["roles"];
          worlds: NonNullable<TuiState["world"]>[];
        }>;
        getEffectivePolicy: () => Promise<{
          capabilities: {
            allow: boolean;
            capability: "filesystem";
            highRisk: boolean;
            reason: string;
          }[];
          roleWorlds: [];
          trustTier: "run-roles";
          warnings: string[];
        }>;
        getSettings: () => Promise<{
          project: Record<string, unknown>;
          user: { defaultModel: string; defaultProvider: string };
        }>;
        getWorldState: (worldId: string) => Promise<{
          state: Record<string, unknown>;
          version: number;
          worldId: string;
        }>;
        listEvents: () => Promise<{ events: []; lastSeq: number }>;
        listMessages: (roomId: string) => Promise<{ messages: TuiState["messages"] }>;
        listRooms: (worldId: string) => Promise<{ rooms: NonNullable<TuiState["room"]>[] }>;
        runRoleTurn: (
          roomId: string,
          input: { prompt?: string; roleId: string; worldId: string },
        ) => Promise<{ message: { id: string } }>;
      };
      state: TuiState;
    };
    let request: [string, { prompt?: string; roleId: string; worldId: string }] | undefined;
    harness.client.runRoleTurn = async (roomId, input) => {
      request = [roomId, input];
      return { message: { id: "message-1" } };
    };
    harness.client.getEffectiveConfig = async () => ({
      project: { defaultWorldId: "cultivation", name: "demo", root: "/tmp/demo" },
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      worlds: [
        {
          defaultRoomId: "main",
          id: "cultivation",
          mode: { time: { kind: "manual" }, type: "game" },
          name: "Cultivation",
          roleIds: ["leijun"],
        },
      ],
    });
    harness.client.listRooms = async () => ({
      rooms: [
        {
          id: "main",
          memberIds: ["owner", "leijun"],
          name: "All Hands",
          type: "group",
          worldId: "cultivation",
        },
      ],
    });
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
    harness.client.getWorldState = async (worldId) => ({
      state: {},
      version: 0,
      worldId,
    });
    harness.state = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      room: {
        id: "main",
        memberIds: ["owner", "leijun"],
        name: "All Hands",
        type: "group",
        worldId: "cultivation",
      },
      rooms: [],
      world: {
        defaultRoomId: "main",
        id: "cultivation",
        mode: { time: { kind: "manual" }, type: "game" },
        name: "Cultivation",
        roleIds: ["leijun"],
      },
      worlds: [],
    };

    const prompt = await app.handleInteractiveInput(
      ":run-role leijun inspect state",
      () => {},
      async () => {},
    );
    expect(prompt).toContain("Run Lei Jun");
    expect(request).toBeUndefined();

    // A bare "y" must NOT trigger the turn by accidental Enter — the SDK stays
    // untouched until the operator types the exact role id.
    const stillPending = await app.handleInteractiveInput(
      "y",
      () => {},
      async () => {},
    );
    expect(stillPending).toContain("Run Lei Jun");
    expect(request).toBeUndefined();

    const confirmed = await app.handleInteractiveInput(
      "leijun",
      () => {},
      async () => {},
    );
    expect(request).toEqual([
      "main",
      { prompt: "inspect state", roleId: "leijun", worldId: "cultivation" },
    ]);
    expect(confirmed).toContain("Role turn completed");
  });
});

describe("RealmTuiApp natural-language commander", () => {
  /**
   * Builds an app pinned to a fixed NL state, with optional client stubs. `reload`
   * is stubbed to keep the pinned state (these unit tests assert gate arming and
   * the write call, not the post-write refetch, which would hit the network).
   */
  function nlApp(clientStubs: Record<string, unknown> = {}): RealmTuiApp {
    const app = new RealmTuiApp({ locale: "zh-CN" });
    const harness = app as unknown as {
      state: TuiState;
      client: Record<string, unknown>;
      reload: () => Promise<void>;
    };
    harness.state = nlState();
    harness.reload = async () => {
      harness.state = nlState();
    };
    Object.assign(harness.client, clientStubs);
    return app;
  }

  test("free-form God instruction arms the God typed-confirm gate (no auto-write)", async () => {
    let called = false;
    const app = nlApp({
      applyGodRoleAction: async () => {
        called = true;
        return {};
      },
    });

    const notice = await app.handleInteractiveInput("把顾辰风禁言", noop, noopAsync);
    // Arms the gate — the write does NOT fire until the world id is re-typed.
    expect(notice).toContain("顾辰风");
    expect(called).toBe(false);

    const stillPending = await app.handleInteractiveInput("y", noop, noopAsync);
    expect(stillPending).toContain("顾辰风");
    expect(called).toBe(false);

    // The God gate confirms by re-typing the target role id (not a bare "y").
    const confirmed = await app.handleInteractiveInput("gu-chen-feng", noop, noopAsync);
    expect(called).toBe(true);
    expect(confirmed).toContain("顾辰风");
  });

  test("imperative condition arms the state-patch gate and writes only after confirm", async () => {
    let patched: unknown;
    const app = nlApp({
      adminPatchState: async (input: unknown) => {
        patched = input;
        return { patch: {}, result: {} };
      },
      // reload() re-reads state; stub the loaders it touches to no-op the cached state.
      getEffectiveConfig: async () => ({
        project: { defaultWorldId: "cultivation", name: "demo", root: "/tmp" },
        roles: [ROLE_GU],
        worlds: [WORLD_CULT],
      }),
    });

    const armed = await app.handleInteractiveInput("让顾辰风心生退意", noop, noopAsync);
    expect(armed).toContain("云岭修仙界");
    expect(patched).toBeUndefined();

    // A bare "y" must NOT write — only re-typing the world id applies the patch.
    const stillPending = await app.handleInteractiveInput("y", noop, noopAsync);
    expect(stillPending).toContain("云岭修仙界");
    expect(patched).toBeUndefined();

    const cancelled = await app.handleInteractiveInput("n", noop, noopAsync);
    expect(cancelled).toContain("取消");
    expect(patched).toBeUndefined();
  });

  test("free-form run-turn arms the role-turn gate", async () => {
    const app = nlApp();
    const notice = await app.handleInteractiveInput("让顾辰风发言一回合", noop, noopAsync);
    // Role-turn confirmation surfaces the role + the cancel hint; no SDK call yet.
    expect(notice).toContain("顾辰风");
  });

  test("free-form create-world stages a config-patch proposal", async () => {
    let proposed = false;
    const app = nlApp({
      proposeWorld: async () => {
        proposed = true;
        return { patch: { id: "patch-1", summary: "创建世界", changes: [] } };
      },
    });

    const notice = await app.handleInteractiveInput("创建一个有宗门的修真世界", noop, noopAsync);
    expect(proposed).toBe(true);
    expect(notice).toBeTruthy();
  });

  test("ambiguous chatter is sent as a chat message, not a silent write", async () => {
    let sent: string | undefined;
    const app = nlApp();
    const harness = app as unknown as {
      handleSend: (content: string) => Promise<string>;
    };
    // Spy on the send fallback to prove ambiguous text takes the message path.
    harness.handleSend = async (content: string) => {
      sent = content;
      return "sent";
    };

    await app.handleInteractiveInput("今天天气真不错啊", noop, noopAsync);
    expect(sent).toBe("今天天气真不错啊");
  });

  test("explicit :send bypasses the NL router and posts verbatim", async () => {
    let sent: string | undefined;
    const app = nlApp();
    const harness = app as unknown as {
      handleSend: (content: string) => Promise<string>;
    };
    harness.handleSend = async (content: string) => {
      sent = content;
      return "sent";
    };

    // "把顾辰风禁言" would be a God action as free-form, but :send forces a message.
    await app.handleInteractiveInput(":send 把顾辰风禁言", noop, noopAsync);
    expect(sent).toBe("把顾辰风禁言");
  });
});
