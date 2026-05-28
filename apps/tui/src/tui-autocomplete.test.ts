import { describe, expect, test } from "bun:test";
import { buildTuiSlashCommands } from "./tui-autocomplete.ts";
import type { TuiState } from "./types.ts";

describe("TUI slash autocomplete", () => {
  test("offers commands and context-aware room/role completions", async () => {
    const state: TuiState = {
      events: [],
      identity: "owner",
      messages: [],
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [
        {
          id: "main",
          memberIds: ["owner", "leijun"],
          name: "All Hands",
          type: "world-main",
          worldId: "cultivation",
        },
      ],
      worlds: [
        {
          defaultRoomId: "main",
          id: "cultivation",
          mode: { time: { kind: "manual" }, type: "game" },
          name: "Cultivation",
          roleIds: ["leijun"],
        },
      ],
    };
    const commands = buildTuiSlashCommands(state);

    expect(commands.map((command) => command.name)).toContain("patch");
    expect(commands.map((command) => command.name)).toContain("memory");
    expect(commands.map((command) => command.name)).toContain("create-room");
    expect(commands.map((command) => command.name)).toContain("run-role");
    const asCommand = commands.find((command) => command.name === "as");
    const roomCommand = commands.find((command) => command.name === "room");
    const worldCommand = commands.find((command) => command.name === "world");

    expect(await asCommand?.getArgumentCompletions?.("lei")).toContainEqual({
      description: "default",
      label: "Lei Jun",
      value: "leijun",
    });
    expect(await roomCommand?.getArgumentCompletions?.("main")).toContainEqual({
      description: "world-main",
      label: "All Hands",
      value: "main",
    });
    expect(await worldCommand?.getArgumentCompletions?.("cult")).toContainEqual({
      description: "game",
      label: "Cultivation",
      value: "cultivation",
    });
  });
});
