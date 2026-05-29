import { describe, expect, test } from "bun:test";
import { tuiDictionaries } from "./i18n.ts";
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
    if (!pending || "blocked" in pending) {
      throw new Error("expected pending role send confirmation");
    }
    expect(pending).toMatchObject({
      content: "hello",
      identity: "leijun",
      identityLabel: "Lei Jun",
      roomName: "All Hands",
      worldName: "Cultivation",
    });
    expect(formatRoleSendConfirmation(pending, tuiDictionaries.en)).toContain(
      "Real operator: Boss",
    );
  });

  test("renders confirmation in zh-CN from the dictionary", () => {
    const pending = createRoleSendConfirmation(baseState("leijun"), "hello");
    if (!pending || "blocked" in pending) {
      throw new Error("expected pending role send confirmation");
    }
    const summary = formatRoleSendConfirmation(pending, tuiDictionaries["zh-CN"]);
    expect(summary).toContain("真实操作者：Boss");
    expect(summary).toContain("输入 y 确认");
    expect(summary).not.toContain("Real operator");
  });

  test("parses confirmation decisions", () => {
    expect(decideRoleSendConfirmation("y")).toBe("confirm");
    expect(decideRoleSendConfirmation("cancel")).toBe("cancel");
    expect(decideRoleSendConfirmation("maybe")).toBe("pending");
  });
});
