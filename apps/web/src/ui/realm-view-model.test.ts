import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";
import {
  buildConversationRows,
  describeTraceEvent,
  displayNameForIdentity,
  isTraceEvent,
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
      body: "Model: gpt-5 | Usage: 18 tokens (in 10, out 5, cache 2/1, $0.000033)",
    });
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
