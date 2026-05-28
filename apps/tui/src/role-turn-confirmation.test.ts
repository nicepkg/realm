import { describe, expect, test } from "bun:test";
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
  test("summarizes role, room, world, prompt, model, permissions, and operator", () => {
    const pending = createRoleTurnConfirmation(
      {
        ...state,
        providerModel: "fake:default",
        policySummary: {
          allowedCapabilities: 3,
          deniedCapabilities: 1,
          highRiskAllowed: 0,
          trustTier: "run-roles",
          warnings: [],
        },
      },
      "leijun",
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
    const summary = formatRoleTurnConfirmation(pending);
    expect(summary).toContain("Real operator: Boss");
    expect(summary).toContain("Model: fake / default");
    expect(summary).toContain("trust run-roles");
    expect(summary).toContain("Ctrl+C cancels");
    expect(decideRoleTurnConfirmation("y")).toBe("confirm");
    expect(decideRoleTurnConfirmation("cancel")).toBe("cancel");
  });
});
