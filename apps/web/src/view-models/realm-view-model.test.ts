import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";
import {
  buildConversationRows,
  describeTraceEvent,
  displayNameForIdentity,
  isTraceEvent,
  latestProjectPatches,
  latestWorkflowApprovals,
  roomTypeLabel,
  turnStatusLabel,
} from "./realm-view-model.ts";

describe("realm web view model", () => {
  test("builds desktop chat conversation rows from rooms and latest messages", () => {
    const roles: RoleSummary[] = [
      { id: "leijun", displayName: "Lei Jun", model: "default", source: "config" },
      { id: "qa", displayName: "QA", model: "cheap", source: "config" },
    ];
    const rooms: Room[] = [
      { id: "main", worldId: "cultivation", type: "world-main", name: "All Hands", memberIds: [] },
      {
        id: "dm-leijun",
        worldId: "cultivation",
        type: "dm",
        name: "Boss / Lei Jun",
        memberIds: ["owner", "leijun"],
      },
    ];
    const messages: Message[] = [
      message("m1", "main", "owner", "older", "2026-05-26T01:00:00.000Z"),
      message("m2", "main", "leijun", "newer", "2026-05-26T01:01:00.000Z"),
    ];

    const rows = buildConversationRows(rooms, messages, roles);

    expect(rows[0]).toMatchObject({
      id: "main",
      title: "All Hands",
      badge: "all",
      lastMessage: "Lei Jun: newer",
    });
    expect(rows[1]).toMatchObject({
      id: "dm-leijun",
      subtitle: "Boss, Lei Jun",
      badge: "dm",
      lastMessage: "",
    });
  });

  test("sorts chat list by latest room activity like a messenger", () => {
    const roles: RoleSummary[] = [
      { id: "mentor", displayName: "Mentor", model: "default", source: "config" },
    ];
    const rooms: Room[] = [
      { id: "main", worldId: "cultivation", type: "world-main", name: "All Hands", memberIds: [] },
      {
        id: "dm-mentor",
        worldId: "cultivation",
        type: "dm",
        name: "Boss / Mentor",
        memberIds: ["owner", "mentor"],
      },
    ];
    const messages: Message[] = [
      message("m1", "main", "owner", "older", "2026-05-26T01:00:00.000Z"),
      message("m2", "dm-mentor", "mentor", "newer", "2026-05-26T01:03:00.000Z"),
    ];

    const rows = buildConversationRows(rooms, messages, roles);

    expect(rows.map((row) => row.id)).toEqual(["dm-mentor", "main"]);
    expect(rows[0]?.lastMessage).toBe("Mentor: newer");
  });

  test("maps identity and room labels for familiar messenger wording", () => {
    const roles: RoleSummary[] = [
      { id: "guchenfeng", displayName: "Gu Chenfeng", model: "default", source: "config" },
    ];

    expect(displayNameForIdentity("owner", roles)).toBe("Boss");
    expect(displayNameForIdentity("god", roles)).toBe("God");
    expect(displayNameForIdentity("guchenfeng", roles)).toBe("Gu Chenfeng");
    expect(roomTypeLabel("god-channel")).toBe("god");
    expect(turnStatusLabel("running")).toBe("role running");
  });

  test("localizes system identity labels in conversation previews", () => {
    const roles: RoleSummary[] = [
      { id: "leijun", displayName: "雷军", model: "default", source: "config" },
    ];
    const room: Room = {
      id: "main",
      memberIds: ["owner", "leijun"],
      name: "全员群",
      type: "world-main",
      worldId: "cultivation",
    };
    const rows = buildConversationRows(
      [room],
      [message("m1", "main", "owner", "你好", "2026-05-28T00:00:00.000Z")],
      roles,
      { god: "上帝", owner: "Boss" },
    );

    expect(rows[0]?.lastMessage).toBe("Boss: 你好");
  });

  test("detects and describes trace events", () => {
    const event: RealmEvent = {
      type: "turn.delta",
      eventId: "event-1",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "turn-1",
      createdAt: "2026-05-26T01:00:00.000Z",
      delta: { turnId: "turn-1", roleId: "leijun", delta: "stream" },
    };

    expect(isTraceEvent(event)).toBe(true);
    expect(describeTraceEvent(event)).toEqual({
      title: "Streaming: leijun",
      body: "stream",
    });
  });

  test("surfaces policy denials in the trace inspector feed", () => {
    const event: RealmEvent = {
      type: "audit.created",
      eventId: "event-policy-denied",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "audit",
      createdAt: "2026-05-26T01:00:00.000Z",
      audit: {
        id: "audit-1",
        actorId: "owner",
        action: "policy.denied",
        target: "network.fetch",
        reason: "network.fetch is not in the allowlist",
        createdAt: "2026-05-26T01:00:00.000Z",
      },
    };

    expect(isTraceEvent(event)).toBe(true);
    expect(describeTraceEvent(event)).toEqual({
      title: "Audit: policy.denied",
      body: "network.fetch: network.fetch is not in the allowlist",
    });
  });

  test("surfaces world events and ticks in the trace inspector feed", () => {
    const event: RealmEvent = {
      type: "world.event.triggered",
      eventId: "event-world-event",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "world-cultivation",
      createdAt: "2026-05-26T01:00:00.000Z",
      event: {
        id: "world-event-1",
        worldId: "cultivation",
        kind: "manual",
        title: "Sudden Storm",
        description: "Weather changes.",
        severity: "minor",
        targetRoleIds: [],
        status: "committed",
        createdAt: "2026-05-26T01:00:00.000Z",
      },
    };
    const tick: RealmEvent = {
      type: "world.tick.triggered",
      eventId: "event-world-tick",
      seq: 2,
      schemaVersion: 1,
      aggregateId: "world-cultivation",
      createdAt: "2026-05-26T01:01:00.000Z",
      tick: {
        id: "world-tick-1",
        worldId: "cultivation",
        tick: 1,
        seed: "day-1",
        eventId: "world-event-1",
        status: "triggered",
        createdAt: "2026-05-26T01:01:00.000Z",
      },
    };

    expect(isTraceEvent(event)).toBe(true);
    expect(describeTraceEvent(event)).toEqual({
      title: "World event: Sudden Storm",
      body: "manual · committed",
    });
    expect(describeTraceEvent(tick)).toEqual({
      title: "Tick 1",
      body: "Triggered world-event-1",
    });
  });

  test("describes turn model usage for trace inspectors", () => {
    const event: RealmEvent = {
      type: "turn.completed",
      eventId: "event-1",
      seq: 1,
      schemaVersion: 1,
      aggregateId: "turn-1",
      createdAt: "2026-05-26T01:00:00.000Z",
      turn: {
        id: "turn-1",
        worldId: "cultivation",
        roomId: "main",
        actorId: "leijun",
        status: "completed",
        model: "gpt-5",
        runtime: {
          adapterKind: "package",
          fallback: { adapterKind: "subprocess", status: "not-used" },
          packageName: "@earendil-works/pi-agent-core",
          packageVersion: "1.2.3",
        },
        usage: {
          input: 10,
          output: 5,
          cacheRead: 2,
          cacheWrite: 1,
          totalTokens: 18,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.000033 },
        },
      },
    };

    expect(describeTraceEvent(event)).toEqual({
      title: "Turn completed: leijun",
      body: "Model: gpt-5 | Runtime: package (@earendil-works/pi-agent-core 1.2.3), fallback not-used | Usage: 18 tokens (in 10, out 5, cache 2/1, $0.000033)",
    });
  });

  test("keeps latest workflow approvals and project patches by id", () => {
    const events: RealmEvent[] = [
      {
        type: "workflow.approval.requested",
        eventId: "event-approval-requested",
        seq: 1,
        schemaVersion: 1,
        aggregateId: "world-software-company",
        createdAt: "2026-05-26T01:00:00.000Z",
        approval: {
          id: "approval-1",
          worldId: "software-company",
          capability: "fs.project.write",
          requestedBy: "engineer",
          reason: "Patch src/title.ts",
          status: "pending",
          createdAt: "2026-05-26T01:00:00.000Z",
        },
      },
      {
        type: "workflow.approval.decided",
        eventId: "event-approval-decided",
        seq: 2,
        schemaVersion: 1,
        aggregateId: "world-software-company",
        createdAt: "2026-05-26T01:01:00.000Z",
        approval: {
          id: "approval-1",
          worldId: "software-company",
          capability: "fs.project.write",
          requestedBy: "engineer",
          reason: "Patch src/title.ts",
          status: "approved",
          decidedBy: "owner",
          decisionReason: "Scoped patch",
          createdAt: "2026-05-26T01:01:00.000Z",
          decidedAt: "2026-05-26T01:01:00.000Z",
        },
      },
      {
        type: "workflow.project_patch.proposed",
        eventId: "event-patch-proposed",
        seq: 3,
        schemaVersion: 1,
        aggregateId: "world-software-company",
        createdAt: "2026-05-26T01:02:00.000Z",
        projectPatch: {
          id: "project-patch-1",
          worldId: "software-company",
          title: "Patch title",
          summary: "",
          requestedBy: "engineer",
          status: "proposed",
          files: [
            {
              path: "src/title.ts",
              action: "update",
              previousHash: "before",
              nextHash: "after",
              nextContent: "next",
            },
          ],
          createdAt: "2026-05-26T01:02:00.000Z",
        },
      },
    ];

    expect(latestWorkflowApprovals(events)).toMatchObject([
      { id: "approval-1", status: "approved" },
    ]);
    expect(latestProjectPatches(events)).toMatchObject([
      { id: "project-patch-1", status: "proposed" },
    ]);
  });
});

function message(
  id: string,
  roomId: string,
  displayedAuthorId: string,
  content: string,
  createdAt: string,
): Message {
  return {
    id,
    worldId: "cultivation",
    roomId,
    authorId: displayedAuthorId,
    displayedAuthorId,
    content,
    createdAt,
  };
}
