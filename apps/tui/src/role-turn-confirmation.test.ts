import { describe, expect, test } from "bun:test";
import { tuiDictionaries } from "./i18n.ts";
import { createRoleSendConfirmation } from "./role-send-confirmation.ts";
import {
  createRoleTurnConfirmation,
  decideRoleTurnConfirmation,
  formatRoleTurnConfirmation,
  roleIsMemberOfRoom,
} from "./role-turn-confirmation.ts";
import type { TuiState } from "./types.ts";

const state: TuiState = {
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

describe("TUI role turn confirmation", () => {
  const policyState: TuiState = {
    ...state,
    providerModel: "fake:default",
    policySummary: {
      allowedCapabilities: 3,
      deniedCapabilities: 1,
      highRiskAllowed: 0,
      trustTier: "run-roles",
      warnings: [],
    },
  };

  test("summarizes role, room, world, prompt, model, permissions, and operator (en)", () => {
    const pending = createRoleTurnConfirmation(
      policyState,
      "leijun",
      tuiDictionaries.en,
      "review state",
    );

    expect(pending).toMatchObject({
      model: "default",
      prompt: "review state",
      provider: "fake",
      roleId: "leijun",
      roleLabel: "Lei Jun",
      roomName: "All Hands",
      worldName: "Cultivation",
    });
    if (!pending || "blocked" in pending) {
      throw new Error("Expected role turn confirmation.");
    }
    const summary = formatRoleTurnConfirmation(pending, tuiDictionaries.en);
    expect(summary).toContain("Real operator: Boss");
    expect(summary).toContain("Model: fake / default");
    expect(summary).toContain("trust run-roles");
    expect(summary).toContain("Ctrl+C cancels");
    expect(summary).toContain("Type leijun to confirm");
    // A bare "y" must NOT commit a role turn by accidental Enter — only typing
    // the exact role id confirms; only explicit n/no/cancel aborts.
    expect(decideRoleTurnConfirmation("y", pending)).toBe("pending");
    expect(decideRoleTurnConfirmation("yes", pending)).toBe("pending");
    expect(decideRoleTurnConfirmation("confirm", pending)).toBe("pending");
    expect(decideRoleTurnConfirmation("leijun", pending)).toBe("confirm");
    expect(decideRoleTurnConfirmation("cancel", pending)).toBe("cancel");
    expect(decideRoleTurnConfirmation("n", pending)).toBe("cancel");
  });

  test("renders confirmation in zh-CN from the dictionary", () => {
    const pending = createRoleTurnConfirmation(
      policyState,
      "leijun",
      tuiDictionaries["zh-CN"],
      "review state",
    );
    if (!pending || "blocked" in pending) {
      throw new Error("Expected role turn confirmation.");
    }
    const summary = formatRoleTurnConfirmation(pending, tuiDictionaries["zh-CN"]);
    expect(summary).toContain("真实操作者：Boss");
    expect(summary).toContain("信任 run-roles");
    expect(summary).toContain("输入 leijun 确认");
    expect(summary).not.toContain("Real operator");
  });
});

describe("TUI role-membership gate (mirrors Web roomMembersForAvatar)", () => {
  const roles = [
    { id: "leijun", displayName: "Lei Jun", model: "default", source: "config" as const },
    { id: "musk", displayName: "Elon Musk", model: "default", source: "config" as const },
  ];
  const base: TuiState = { ...state, roles };

  function withRoom(overrides: Partial<TuiState["room"]>): TuiState {
    return {
      ...base,
      room: {
        id: "room",
        memberIds: [],
        name: "Side Channel",
        type: "dm",
        worldId: "cultivation",
        ...overrides,
      },
    };
  }

  test("group / world-main rooms admit every defined role implicitly", () => {
    const group = withRoom({ memberIds: [], name: "All Hands", type: "group" });
    expect(roleIsMemberOfRoom(group, "leijun")).toBe(true);
    expect(roleIsMemberOfRoom(group, "musk")).toBe(true);
    // world-main is a data-layer type outside the api-contract enum; cast to mirror Web.
    const worldMain = withRoom({ name: "All Hands", type: "world-main" as never });
    expect(roleIsMemberOfRoom(worldMain, "musk")).toBe(true);
    // The owner is always a member (audited real operator, never role-gated).
    expect(roleIsMemberOfRoom(group, "owner")).toBe(true);
  });

  test("typed rooms (dm/system) gate membership by explicit memberIds", () => {
    const dm = withRoom({ memberIds: ["leijun"], type: "dm" });
    expect(roleIsMemberOfRoom(dm, "leijun")).toBe(true);
    expect(roleIsMemberOfRoom(dm, "musk")).toBe(false);
  });

  test("non-member role turn returns a blocked signal, never a pending confirmation", () => {
    const dm = withRoom({ memberIds: ["leijun"], type: "dm", name: "DM" });
    const blocked = createRoleTurnConfirmation(dm, "musk", tuiDictionaries.en);
    expect(blocked).toEqual({ blocked: "not-member", roleLabel: "Elon Musk", roomName: "DM" });
    expect(tuiDictionaries.en.roleNotInRoom("Elon Musk", "DM")).toContain("not a member");
    expect(tuiDictionaries["zh-CN"].roleNotInRoom("Elon Musk", "DM")).toContain("不在房间");
  });

  test("member role turn still arms a confirmable pending action", () => {
    const dm = withRoom({ memberIds: ["leijun"], type: "dm" });
    const pending = createRoleTurnConfirmation(dm, "leijun", tuiDictionaries.en);
    expect(pending).toMatchObject({ roleId: "leijun", roleLabel: "Lei Jun" });
    expect(pending && "blocked" in pending).toBe(false);
  });

  test("non-member role send is refused with a blocked signal, never a y/n confirm", () => {
    const dm = withRoom({ memberIds: ["leijun"], type: "dm", name: "DM" });
    const result = createRoleSendConfirmation({ ...dm, identity: "musk" }, "hello");
    expect(result).toEqual({ blocked: "not-member", roleLabel: "Elon Musk", roomName: "DM" });
  });

  test("member role send still arms a confirmable pending action", () => {
    const dm = withRoom({ memberIds: ["leijun"], type: "dm" });
    const result = createRoleSendConfirmation({ ...dm, identity: "leijun" }, "hello");
    expect(result).toMatchObject({ identity: "leijun", content: "hello" });
    expect(result && "blocked" in result).toBe(false);
  });
});
