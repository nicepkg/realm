import { describe, expect, test } from "bun:test";
import type { TuiState } from "./types.ts";
import { renderTui } from "./view-model.ts";

describe("TUI view model", () => {
  test("renders room list, chat stream, inspector, settings, and assistant panes", () => {
    const rendered = renderTui({
      projectName: "demo",
      identity: "owner",
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
      settingsSummary: "openai/gpt-5",
      assistantProposal: {
        id: "config-patch:1",
        title: "Create QA",
        summary: "Add QA role.",
        riskLevel: "low",
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
    } satisfies TuiState);

    expect(rendered).toContain("Rooms");
    expect(rendered).toContain("Chat");
    expect(rendered).toContain("Boss: hello");
    expect(rendered).toContain("Inspector");
    expect(rendered).toContain("Settings: openai/gpt-5");
    expect(rendered).toContain("Assistant proposal: Create QA");
    expect(rendered).toContain(":send <message>");
    expect(rendered).toContain(":model <provider> <id>");
  });
});
