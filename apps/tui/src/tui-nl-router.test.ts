import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import {
  buildIntentContext,
  decideStatePatchConfirmation,
  type NlRoute,
  routeNaturalLanguage,
  summarizeOperations,
  type TuiPendingStatePatch,
} from "./tui-nl-router.ts";
import type { TuiState } from "./types.ts";

// --- Fixtures ----------------------------------------------------------------

const ROLE_GU: RoleSummary = {
  id: "gu-chen-feng",
  displayName: "顾辰风",
  model: "default",
  source: "config",
};
const ROLE_YUN: RoleSummary = {
  id: "yun-yao",
  displayName: "云遥",
  model: "default",
  source: "config",
};

const ROOM_MAIN: Room = {
  id: "main",
  memberIds: ["owner", "gu-chen-feng", "yun-yao"],
  name: "全员议事",
  type: "group",
  worldId: "cultivation",
};

const WORLD_CULT: WorldSummary = {
  defaultRoomId: "main",
  id: "cultivation",
  mode: { time: { kind: "manual" }, type: "game" },
  name: "云岭修仙界",
  roleIds: ["gu-chen-feng", "yun-yao"],
};

const WORLD_DEBATE: WorldSummary = {
  defaultRoomId: "hall",
  id: "debate-hall",
  mode: { time: { kind: "manual" }, type: "debate" },
  name: "辩论殿",
  roleIds: [],
};

function makeState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    events: [],
    identity: "owner",
    messages: [],
    projectName: "demo",
    roles: [ROLE_GU, ROLE_YUN],
    room: ROOM_MAIN,
    rooms: [ROOM_MAIN],
    world: WORLD_CULT,
    worlds: [WORLD_CULT, WORLD_DEBATE],
    ...overrides,
  };
}

/** Routes free-form text against the default (deterministic) router. */
function route(input: string, state: TuiState = makeState()): Promise<NlRoute> {
  return routeNaturalLanguage(input, state);
}

// --- Intent → route family mapping ------------------------------------------

describe("routeNaturalLanguage intent families", () => {
  test("create-world request → a createWorld proposal command (review-before-apply)", async () => {
    const result = await route("创建一个有宗门的修真世界");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command.kind).toBe("createWorld");
  });

  test("add-role request → a createRole proposal command", async () => {
    const result = await route("加一个叫云遥的炼丹师");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command.kind).toBe("createRole");
  });

  test("interrogative '现在世界什么状态？' → inspect (read, no gate)", async () => {
    const result = await route("现在世界什么状态？");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command).toEqual({ kind: "state" });
  });

  test("role-memory question → an inspect memory read for that role", async () => {
    const result = await route("云遥知道哪些事？");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command).toEqual({ kind: "memory", roleId: "yun-yao" });
  });

  test("imperative condition '让顾辰风心生退意' → a gated state-patch", async () => {
    const result = await route("让顾辰风心生退意");
    expect(result.kind).toBe("statePatch");
    if (result.kind !== "statePatch") {
      throw new Error("expected statePatch route");
    }
    expect(result.pending.worldId).toBe("cultivation");
    expect(result.pending.operations).toHaveLength(1);
    // The condition lands under the named role's private-state container.
    expect(result.pending.operations[0]?.path).toContain("gu-chen-feng");
  });

  test("'让顾辰风发言一回合' → a gated run-turn for that role", async () => {
    const result = await route("让顾辰风发言一回合");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command).toEqual({ kind: "runRole", roleId: "gu-chen-feng" });
  });

  test("'把顾辰风禁言' → a gated God action", async () => {
    const result = await route("把顾辰风禁言");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command.kind).toBe("god");
    if (result.command.kind !== "god") {
      throw new Error("expected god command");
    }
    expect(result.command.action).toBe("mute");
    expect(result.command.targetRoleId).toBe("gu-chen-feng");
  });

  test("world-switch '切换到辩论殿' → a switch command resolved to the world id", async () => {
    const result = await route("切换到辩论殿");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command).toEqual({ kind: "world", worldId: "debate-hall" });
  });

  test("trust-elevation '提升信任等级，允许运行角色' → a trust route", async () => {
    const result = await route("提升信任等级，允许运行角色");
    expect(result).toEqual({ kind: "trust", tier: "run-roles" });
  });

  test("ambiguous chatter falls back to send (never a silent write)", async () => {
    const result = await route("今天天气真不错啊");
    expect(result.kind).toBe("send");
  });

  test("a question that merely contains a God keyword stays a read, not a mute", async () => {
    const result = await route("顾辰风被禁言了吗？");
    expect(result.kind).toBe("command");
    if (result.kind !== "command") {
      throw new Error("expected command route");
    }
    expect(result.command).toEqual({ kind: "state" });
  });

  test("state-patch with no active world falls back to send (a patch needs a world)", async () => {
    const result = await route("让顾辰风心生退意", makeState({ world: undefined }));
    expect(result.kind).toBe("send");
  });
});

// --- Context builder ---------------------------------------------------------

describe("buildIntentContext", () => {
  test("maps live state to roles / rooms / worlds and the active ids", () => {
    const context = buildIntentContext(makeState());
    expect(context.roles).toEqual([
      { id: "gu-chen-feng", displayName: "顾辰风" },
      { id: "yun-yao", displayName: "云遥" },
    ]);
    expect(context.rooms).toEqual([{ id: "main" }]);
    expect(context.worlds).toEqual([
      { id: "cultivation", name: "云岭修仙界" },
      { id: "debate-hall", name: "辩论殿" },
    ]);
    expect(context.worldId).toBe("cultivation");
    expect(context.defaultRoomId).toBe("main");
  });
});

// --- State-patch gate --------------------------------------------------------

describe("state-patch confirmation gate", () => {
  const pending: TuiPendingStatePatch = {
    worldId: "cultivation",
    worldName: "云岭修仙界",
    operations: [
      { op: "append", path: "/privateState/roles/gu-chen-feng/conditions", value: "心生退意" },
    ],
    reason: "让顾辰风心生退意",
  };

  test("re-typing the exact world id confirms", () => {
    expect(decideStatePatchConfirmation("cultivation", pending)).toBe("confirm");
  });

  test("n / no / cancel cancels; a bare 'y' stays pending (no accidental Enter write)", () => {
    expect(decideStatePatchConfirmation("n", pending)).toBe("cancel");
    expect(decideStatePatchConfirmation("cancel", pending)).toBe("cancel");
    expect(decideStatePatchConfirmation("y", pending)).toBe("pending");
  });

  test("summarizeOperations renders a human-readable write summary", () => {
    expect(summarizeOperations(pending.operations)).toContain("心生退意");
    expect(summarizeOperations([{ op: "increment", path: "/qi", amount: 5 }])).toBe("/qi += 5");
  });
});
