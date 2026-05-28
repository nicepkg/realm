import { describe, expect, test } from "bun:test";
import {
  buildCommandItems,
  buildRoleItems,
  buildRoomItems,
  buildWorldItems,
} from "./interactive-items.ts";
import type { TuiState } from "./types.ts";

describe("TUI interactive picker items", () => {
  test("builds world, room, role, settings, god, and whereami actions", () => {
    const state = {
      projectName: "demo",
      identity: "owner",
      worlds: [
        {
          id: "cultivation",
          name: "Cultivation",
          mode: { type: "game", time: { kind: "manual" } },
          defaultRoomId: "main",
          roleIds: ["leijun"],
        },
      ],
      rooms: [
        {
          id: "main",
          worldId: "cultivation",
          type: "world-main",
          name: "All Hands",
          memberIds: ["owner", "leijun"],
        },
      ],
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      messages: [],
      events: [],
    } satisfies TuiState;

    expect(buildWorldItems(state).map((item) => item.value)).toEqual(["world:cultivation"]);
    expect(buildRoomItems(state).map((item) => item.value)).toEqual(["room:main"]);
    expect(buildRoleItems(state).map((item) => item.value)).toEqual(["role:leijun"]);
    expect(buildCommandItems(state).map((item) => item.value)).toContain("settings");
    expect(buildCommandItems(state).map((item) => item.value)).toContain("god");
    expect(buildCommandItems(state).map((item) => item.value)).toContain("whereami");

    const zhCommandLabels = buildCommandItems(state, "zh-CN").map((item) => item.label);
    expect(zhCommandLabels).toContain("设置");
    expect(zhCommandLabels).toContain("上帝控制台");
    expect(zhCommandLabels).toContain("我在哪");
    expect(buildRoleItems(state, "zh-CN")[0]?.label).toBe("切换为 Lei Jun");
  });
});
