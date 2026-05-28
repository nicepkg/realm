import { describe, expect, test } from "bun:test";
import { renderStatusLine, renderWhereami } from "./interactive-helpers.ts";
import type { TuiState } from "./types.ts";

describe("TUI interactive helpers", () => {
  test("persistent status line includes provider and running state", () => {
    const state = {
      events: [
        {
          aggregateId: "turn-1",
          createdAt: "2026-05-28T00:00:00.000Z",
          eventId: "event-1",
          schemaVersion: 1,
          seq: 1,
          turn: {
            actorId: "leijun",
            id: "turn-1",
            roomId: "main",
            status: "running",
            worldId: "cultivation",
          },
          type: "turn.started",
        },
      ],
      identity: "owner",
      messages: [],
      projectName: "demo",
      providerModel: "google/gemini-2.5-flash",
      roles: [],
      room: { id: "main", memberIds: [], name: "All Hands", type: "world-main", worldId: "w" },
      rooms: [],
      world: {
        defaultRoomId: "main",
        id: "cultivation",
        mode: { time: { kind: "tick" }, type: "simulation" },
        name: "Cultivation",
        roleIds: [],
      },
      worlds: [],
    } satisfies TuiState;

    const rendered = renderStatusLine(state);
    expect(rendered).toContain("Provider:google/gemini-2.5-flash");
    expect(rendered).toContain("Running:turn running leijun");
  });

  test("whereami includes policy and capability summary when loaded", () => {
    const state = {
      events: [],
      identity: "owner",
      messages: [],
      policySummary: {
        allowedCapabilities: 4,
        deniedCapabilities: 3,
        highRiskAllowed: 1,
        trustTier: "run-roles",
        warnings: ["Network fetch is disabled by project policy."],
      },
      projectName: "demo",
      roles: [{ id: "leijun", displayName: "Lei Jun", model: "default", source: "config" }],
      rooms: [],
      worlds: [],
    } satisfies TuiState;

    const rendered = renderWhereami(state);
    expect(rendered).toContain("Trust tier: run-roles");
    expect(rendered).toContain("Capabilities: 4 allowed, 3 denied, 1 high-risk allowed");
    expect(rendered).toContain("1 policy warning");
  });
});
