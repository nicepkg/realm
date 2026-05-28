import { describe, expect, test } from "bun:test";
import {
  createGodActionConfirmation,
  decideGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import type { TuiCommand, TuiState } from "./types.ts";

describe("TUI God action confirmation", () => {
  const state: TuiState = {
    events: [],
    identity: "owner",
    messages: [],
    projectName: "Realm",
    roles: [{ displayName: "Lei Jun", id: "leijun", model: "fake", source: "config" }],
    rooms: [],
    worlds: [],
    world: {
      defaultRoomId: "main",
      id: "cultivation",
      mode: { time: { kind: "manual" }, type: "game" },
      name: "Cultivation",
      roleIds: ["leijun"],
    },
  };

  test("prompts with action, target, world, reason, and typed confirmation", () => {
    const command: Extract<TuiCommand, { kind: "god" }> = {
      action: "mute",
      kind: "god",
      reason: "Out of character spam",
      targetRoleId: "leijun",
    };

    const pending = createGodActionConfirmation(state, command);

    expect(pending).toBeDefined();
    if (!pending) {
      return;
    }
    expect(pending).toEqual({
      action: "mute",
      reason: "Out of character spam",
      targetRoleId: "leijun",
      targetRoleLabel: "Lei Jun",
      worldId: "cultivation",
      worldName: "Cultivation",
    });
    expect(formatGodActionConfirmation(pending)).toContain("Type leijun to confirm");
  });

  test("requires exact role id and allows cancel words", () => {
    const pending = createGodActionConfirmation(state, {
      action: "kill",
      kind: "god",
      reason: "Story adjudication",
      targetRoleId: "leijun",
    });

    expect(pending).toBeDefined();
    if (!pending) {
      return;
    }

    expect(decideGodActionConfirmation("Lei Jun", pending)).toBe("pending");
    expect(decideGodActionConfirmation("leijun", pending)).toBe("confirm");
    expect(decideGodActionConfirmation("cancel", pending)).toBe("cancel");
  });
});
