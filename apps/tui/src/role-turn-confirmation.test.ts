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
  test("summarizes role, room, world, prompt, and real operator", () => {
    const pending = createRoleTurnConfirmation(state, "leijun", "review state");

    expect(pending).toMatchObject({
      prompt: "review state",
      roleId: "leijun",
      roleLabel: "Lei Jun",
      roomName: "All Hands",
      worldName: "Cultivation",
    });
    if (!pending) {
      throw new Error("Expected role turn confirmation.");
    }
    expect(formatRoleTurnConfirmation(pending)).toContain("Real operator: Boss");
    expect(decideRoleTurnConfirmation("y")).toBe("confirm");
    expect(decideRoleTurnConfirmation("cancel")).toBe("cancel");
  });
});
