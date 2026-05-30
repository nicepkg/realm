import { describe, expect, test } from "bun:test";
import type { RealmEvent, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { auditKindLabel } from "./world-audit-timeline.tsx";
import {
  AccessAuditTimeline,
  accessDenialsForEvents,
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
    // The state tab now leads with a HUMANIZED key→value table (raw JSON moved
    // behind a sub-tab) — the key segment `season` localizes to 季节; the author
    // value `spring` (not a known enum) stays verbatim.
    expect(html).toContain('data-testid="state-layer-summary"');
    expect(html).toContain('data-testid="state-layer-table"');
    expect(html).toContain("季节");
    expect(html).toContain("spring");
  });

  test("humanizes a role-id state field to its displayName (no guchenfeng / true leak)", () => {
    const app = mockApp();
    app.state.worldState = {
      state: { privateState: { roles: { guchenfeng: { alive: true, muted: false } } } },
      version: 9,
    };
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldInspectorContent app={app} />
      </I18nProvider>,
    );

    // The role-id KEY segment resolves to the display name; the booleans humanize.
    expect(html).toContain("顾辰风");
    expect(html).toContain("禁言");
    expect(html).toContain("存活");
    // Regression guard: the raw role id must NOT leak into the humanized table.
    expect(html).not.toContain("guchenfeng");
    // No bare boolean token in the humanized table.
    expect(html).not.toContain("禁言 · true");
  });

  test("renders recent trace events in the event timeline", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WorldEventTimeline app={mockApp()} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-event-timeline"');
    // I18N-1: the inspector now threads `t`, so the trace title localizes to the
    // default (zh-CN) locale; the event title itself stays verbatim machine data.
    expect(html).toContain("世界事件: Sudden Storm");
    expect(html).toContain("manual");
  });

  test("renders denied tool and policy events with recovery guidance", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <AccessAuditTimeline events={mockDeniedEvents()} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="world-access-audit"');
    expect(html).toContain('data-testid="world-access-denial-row"');
    // zh-CN is the default locale after the rebuild; localized labels render in
    // Chinese. The denial structure and raw reason strings are unchanged.
    expect(html).toContain("工具被拒");
    expect(html).toContain("memory.write");
    expect(html).toContain("memory.write is denied by host policy");
    expect(html).toContain("以 host/runtime 策略为准");
    expect(html).toContain("审计拒绝");
    expect(html).toContain("network.fetch");
  });

  test("classifies extension token denials separately from policy recovery", () => {
    expect(accessDenialsForEvents(mockDeniedEvents()).map((denial) => denial.recoveryKey)).toEqual([
      "policy",
      "policy",
      "token",
    ]);
  });

  test("formats missing world state as an empty JSON object", () => {
    expect(formatStateSnapshot(undefined)).toBe("{}");
  });

  test("labels each audit kind distinctly for the full audit timeline", () => {
    const t = (key: string) => key;
    expect(auditKindLabel("impersonation", t)).toBe("inspector.auditKindImpersonation");
    expect(auditKindLabel("tool", t)).toBe("inspector.auditKindTool");
    expect(auditKindLabel("state-patch", t)).toBe("inspector.auditKindStatePatch");
    expect(auditKindLabel("audit", t)).toBe("inspector.auditKindAudit");
  });
});

function mockDeniedEvents(): Parameters<typeof accessDenialsForEvents>[0] {
  return [
    {
      aggregateId: "trace-tool-denied",
      createdAt: "2026-05-26T01:00:00.000Z",
      eventId: "event-tool-denied",
      schemaVersion: 1,
      seq: 10,
      toolCall: {
        id: "tool-denied-1",
        name: "memory.write",
        reason: "memory.write is denied by host policy",
        status: "denied",
      },
      traceId: "trace-tool-denied",
      type: "tool.called",
    },
    {
      aggregateId: "audit",
      audit: {
        action: "policy.denied",
        actorId: "owner",
        createdAt: "2026-05-26T01:00:00.000Z",
        id: "audit-policy-denied",
        reason: "network.fetch is not in the allowlist",
        target: "network.fetch",
      },
      createdAt: "2026-05-26T01:00:00.000Z",
      eventId: "event-policy-denied",
      schemaVersion: 1,
      seq: 11,
      type: "audit.created",
    },
    {
      aggregateId: "audit",
      audit: {
        action: "extension.denied",
        actorId: "leijun",
        createdAt: "2026-05-26T01:00:00.000Z",
        id: "audit-extension-denied",
        reason: "Missing Realm extension bearer token",
        target: "state.query",
      },
      createdAt: "2026-05-26T01:00:00.000Z",
      eventId: "event-extension-denied",
      schemaVersion: 1,
      seq: 12,
      type: "audit.created",
    },
  ] as Parameters<typeof accessDenialsForEvents>[0];
}

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
      roles: [{ displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" }],
      worldState: {
        state: { publicState: { world: { season: "spring" } } },
        version: 7,
      },
    },
    traceEvents: [event],
  } as unknown as RealmAppController;
}
