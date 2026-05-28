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
          type: "turn.started",
          eventId: "event:turn:1",
          seq: 0,
          schemaVersion: 1,
          aggregateId: "turn:1",
          createdAt: "2026-05-27T00:00:00.000Z",
          turn: {
            actorId: "leijun",
            id: "turn:1",
            roomId: "main",
            status: "running",
            worldId: "cultivation",
          },
        },
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
      providerModel: "openai/gpt-5",
      policySummary: {
        allowedCapabilities: 5,
        deniedCapabilities: 2,
        highRiskAllowed: 1,
        trustTier: "run-roles",
        warnings: ["Network fetch is disabled by project policy."],
      },
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
    expect(rendered).toContain("Provider: openai/gpt-5");
    expect(rendered).toContain("Running: turn running leijun");
    expect(rendered).toContain("Policy: Trust tier: run-roles");
    expect(rendered).toContain("Capabilities: 5 allowed, 2 denied, 1 high-risk allowed");
    expect(rendered).toContain("1 policy warning");
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
    expect(zh).toContain("Provider: openai/gpt-5");
    expect(zh).toContain("运行状态: 回合 running leijun");
    expect(zh).toContain("策略: 信任级别: run-roles");
    expect(zh).toContain("能力：允许 5，拒绝 2，高风险允许 1");
    expect(zh).toContain("1 条策略警告");
    expect(zh).toContain("会话");
    expect(zh).toContain("消息");
    expect(zh).toContain("上下文");
    expect(zh).toContain("设置: openai/gpt-5");
    expect(zh).toContain("配置补丁: Create QA");
    expect(zh).toContain("世界状态: v2");
    expect(zh).toContain("世界事件 Storm");
    expect(zh).toContain("Ctrl+K 命令");
  });

  test("fits rendered rows to narrow terminal widths", () => {
    const state = {
      projectName: "demo with an intentionally long project name",
      identity: "owner",
      worlds: [],
      world: {
        id: "cultivation",
        name: "Cultivation With A Very Long World Name",
        mode: { type: "simulation", time: { kind: "tick" } },
        defaultRoomId: "main",
        roleIds: ["leijun"],
      },
      rooms: [
        {
          id: "main",
          worldId: "cultivation",
          type: "world-main",
          name: "All Hands With A Very Long Room Name",
          memberIds: ["owner", "leijun"],
        },
      ],
      room: {
        id: "main",
        worldId: "cultivation",
        type: "world-main",
        name: "All Hands With A Very Long Room Name",
        memberIds: ["owner", "leijun"],
      },
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      messages: [
        {
          id: "msg:long",
          worldId: "cultivation",
          roomId: "main",
          authorId: "owner",
          displayedAuthorId: "owner",
          content: "this is a very long terminal message that should be truncated",
          createdAt: "2026-05-27T00:00:00.000Z",
        },
      ],
      events: [],
      providerModel: "openai/gpt-5",
    } satisfies TuiState;

    const rendered = renderTui(state, "en", { width: 44 });
    const lines = rendered.split("\n");

    expect(lines.every((line) => line.length <= 44)).toBe(true);
    expect(rendered).toContain("…");
  });
});
