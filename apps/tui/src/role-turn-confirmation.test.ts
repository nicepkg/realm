import { describe, expect, test } from "bun:test";
import { tuiDictionaries } from "./i18n.ts";
import {
  createRoleTurnConfirmation,
  decideRoleTurnConfirmation,
  formatRoleTurnConfirmation,
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
    if (!pending) {
      throw new Error("Expected role turn confirmation.");
    }
    const summary = formatRoleTurnConfirmation(pending, tuiDictionaries.en);
    expect(summary).toContain("Real operator: Boss");
    expect(summary).toContain("Model: fake / default");
    expect(summary).toContain("trust run-roles");
    expect(summary).toContain("Ctrl+C cancels");
    expect(decideRoleTurnConfirmation("y")).toBe("confirm");
    expect(decideRoleTurnConfirmation("cancel")).toBe("cancel");
  });

  test("renders confirmation in zh-CN from the dictionary", () => {
    const pending = createRoleTurnConfirmation(
      policyState,
      "leijun",
      tuiDictionaries["zh-CN"],
      "review state",
    );
    if (!pending) {
      throw new Error("Expected role turn confirmation.");
    }
    const summary = formatRoleTurnConfirmation(pending, tuiDictionaries["zh-CN"]);
    expect(summary).toContain("真实操作者：Boss");
    expect(summary).toContain("信任 run-roles");
    expect(summary).toContain("输入 y 确认");
    expect(summary).not.toContain("Real operator");
  });
});
