import { describe, expect, test } from "bun:test";
import type { RealmEvent, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import {
  formatStateSnapshot,
  WorldEventTimeline,
  WorldInspectorContent,
} from "./world-inspector-sheet.tsx";

describe("world inspector sheet", () => {
  test("renders world state and trace evidence as a secondary inspector", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldInspectorContent app={mockApp()} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-inspector-content"');
    expect(html).toContain("Realm Project");
    expect(html).toContain("Cultivation Sim");
    expect(html).toContain("v7");
    expect(html).toContain("&quot;season&quot;");
    expect(html).toContain("&quot;spring&quot;");
  });

  test("renders recent trace events in the event timeline", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldEventTimeline app={mockApp()} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-event-timeline"');
    expect(html).toContain("World event: Sudden Storm");
    expect(html).toContain("manual");
  });

  test("formats missing world state as an empty JSON object", () => {
    expect(formatStateSnapshot(undefined)).toBe("{}");
  });
});

function mockApp(): RealmAppController {
  const room: Room = {
    id: "main",
    memberIds: ["owner", "leijun"],
    name: "All Hands",
    type: "world-main",
    worldId: "cultivation",
  };
  const world: WorldSummary = {
    defaultRoomId: "main",
    id: "cultivation",
    mode: { time: { kind: "tick" }, type: "simulation" },
    name: "Cultivation Sim",
    roleIds: ["leijun"],
  };
  const event: RealmEvent = {
    aggregateId: "world-cultivation",
    createdAt: "2026-05-26T01:00:00.000Z",
    event: {
      createdAt: "2026-05-26T01:00:00.000Z",
      description: "Weather changes.",
      id: "world-event-1",
      kind: "manual",
      severity: "minor",
      status: "committed",
      targetRoleIds: [],
      title: "Sudden Storm",
      worldId: "cultivation",
    },
    eventId: "event-world-event",
    schemaVersion: 1,
    seq: 9,
    type: "world.event.triggered",
  };

  return {
    selectedRoom: room,
    selectedWorld: world,
    state: {
      projectName: "Realm Project",
      worldState: {
        state: { season: "spring" },
        version: 7,
      },
    },
    traceEvents: [event],
  } as unknown as RealmAppController;
}
