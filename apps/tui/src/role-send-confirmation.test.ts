import { describe, expect, test } from "bun:test";
import {
  createRoleSendConfirmation,
  decideRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import type { TuiState } from "./types.ts";

function baseState(identity: string): TuiState {
  return {
    projectName: "demo",
    identity,
    worlds: [
      {
        id: "cultivation",
        name: "Cultivation",
        mode: { type: "game", time: { kind: "manual" } },
        defaultRoomId: "main",
        roleIds: ["leijun"],
      },
    ],
    world: {
      id: "cultivation",
      name: "Cultivation",
      mode: { type: "game", time: { kind: "manual" } },
      defaultRoomId: "main",
      roleIds: ["leijun"],
    },
    rooms: [
      {
        id: "main",
        worldId: "cultivation",
        type: "world-main",
        name: "All Hands",
        memberIds: ["owner", "leijun"],
      },
    ],
    room: {
      id: "main",
      worldId: "cultivation",
      type: "world-main",
      name: "All Hands",
      memberIds: ["owner", "leijun"],
    },
    roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
    messages: [],
    events: [],
  };
}

describe("TUI role send confirmation", () => {
  test("does not prompt when Boss sends", () => {
    expect(createRoleSendConfirmation(baseState("owner"), "hello")).toBeUndefined();
  });

  test("prompts with displayed author, world, room, and real operator", () => {
    const pending = createRoleSendConfirmation(baseState("leijun"), "hello");
    expect(pending).toBeDefined();
    if (!pending) {
      throw new Error("expected pending role send confirmation");
    }
    expect(pending).toMatchObject({
      content: "hello",
      identity: "leijun",
      identityLabel: "Lei Jun",
      roomName: "All Hands",
      worldName: "Cultivation",
    });
    expect(formatRoleSendConfirmation(pending)).toContain("Real operator: Boss");
  });

  test("parses confirmation decisions", () => {
    expect(decideRoleSendConfirmation("y")).toBe("confirm");
    expect(decideRoleSendConfirmation("cancel")).toBe("cancel");
    expect(decideRoleSendConfirmation("maybe")).toBe("pending");
  });
});
