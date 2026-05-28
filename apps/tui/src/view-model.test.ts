import { describe, expect, test } from "bun:test";
import type { TuiState } from "./types.ts";
import { renderTui } from "./view-model.ts";

describe("TUI view model", () => {
  test("renders terminal messenger status, conversations, messages, context, and shortcuts", () => {
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
      messages: [
        {
          id: "msg:1",
          worldId: "cultivation",
          roomId: "main",
          authorId: "owner",
          displayedAuthorId: "owner",
          content: "hello",
          createdAt: "2026-05-27T00:00:00.000Z",
        },
      ],
      events: [
        {
          type: "world.event.triggered",
          eventId: "event:1",
          seq: 1,
          schemaVersion: 1,
          aggregateId: "world:cultivation",
          createdAt: "2026-05-27T00:00:00.000Z",
          event: {
            id: "world-event:1",
            worldId: "cultivation",
            kind: "manual",
            title: "Storm",
            description: "Weather changes.",
            severity: "minor",
            targetRoleIds: [],
            status: "committed",
            createdAt: "2026-05-27T00:00:00.000Z",
          },
        },
      ],
      worldState: {
        version: 2,
        state: { publicState: { weather: "storm" } },
      },
      stateInspection: 'World state v2\n{"weather":"storm"}',
      memoryInspection: "Memory: leijun\nkeeps launch notes",
      settingsSummary: "openai/gpt-5",
      assistantProposal: {
        id: "config-patch:1",
        title: "Create QA",
        summary: "Add QA role.",
        riskLevel: "low",
        riskReasons: ["Creates new config files only."],
        typedConfirmation: null,
        requiredCapabilities: ["role.create"],
        operations: [
          {
            path: ".agents/roles/qa/role.yaml",
            action: "create",
            previousHash: null,
            nextHash: "next",
            nextContent: "version: 1\n",
          },
        ],
        createdAt: "2026-05-27T00:00:00.000Z",
      },
      lastPatchApply: {
        patchId: "config-patch:old",
        historyId: "history:1",
        changedPaths: [".agents/roles/qa/role.yaml"],
      },
    } satisfies TuiState;
    const rendered = renderTui(state);

    expect(rendered).toContain("World: Cultivation (game)");
    expect(rendered).toContain("Room: All Hands");
    expect(rendered).toContain("Speaking: owner");
    expect(rendered).toContain("Conversations");
    expect(rendered).toContain("Messages");
    expect(rendered).toContain("Boss: hello");
    expect(rendered).toContain("Context");
    expect(rendered).toContain("Settings: openai/gpt-5");
    expect(rendered).toContain("Config patch: Create QA");
    expect(rendered).toContain("World state: v2");
    expect(rendered).toContain("Memory: leijun");
    expect(rendered).toContain("Apply with :patch apply");
    expect(rendered).toContain("Ctrl+K commands");
    expect(rendered).toContain("/send <message>");

    const zh = renderTui(state, "zh-CN");
    expect(zh).toContain("世界: Cultivation (game)");
    expect(zh).toContain("房间: All Hands");
    expect(zh).toContain("发送身份: owner");
    expect(zh).toContain("会话");
    expect(zh).toContain("消息");
    expect(zh).toContain("上下文");
    expect(zh).toContain("设置: openai/gpt-5");
    expect(zh).toContain("配置补丁: Create QA");
    expect(zh).toContain("世界状态: v2");
    expect(zh).toContain("世界事件 Storm");
    expect(zh).toContain("Ctrl+K 命令");
  });
});
