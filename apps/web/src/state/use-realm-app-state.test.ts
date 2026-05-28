import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent } from "@realm/api-contract";
import {
  appendSentMessage,
  classifyTurnFailure,
  latestDenialReason,
  resolveIdentityAfterRealmLoad,
} from "./realm-app-state-model.ts";

const fakeT = (key: string) => key;

function baseState() {
  return {
    conversationMessages: [],
    events: [],
    messages: [],
    projectName: "Realm",
    roles: [],
    rooms: [],
    status: "ready" as const,
    worlds: [],
  };
}

function message(id: string, roomId = "main"): Message {
  return {
    id,
    worldId: "cultivation",
    roomId,
    authorId: "owner",
    displayedAuthorId: "owner",
    content: "hi",
    createdAt: "2026-05-29T00:00:00.000Z",
  };
}

describe("realm app state identity safety", () => {
  test("forces Boss identity after an explicit world switch", () => {
    expect(resolveIdentityAfterRealmLoad("leijun", ["owner", "leijun"], true)).toBe("owner");
  });

  test("preserves an in-world takeover when reloading the same world", () => {
    expect(resolveIdentityAfterRealmLoad("leijun", ["owner", "leijun"], false)).toBe("leijun");
  });

  test("falls back to Boss when a stale identity is no longer configured", () => {
    expect(resolveIdentityAfterRealmLoad("removed-role", ["owner", "leijun"], false)).toBe("owner");
  });

  test("does not keep God as a normal composer identity", () => {
    expect(resolveIdentityAfterRealmLoad("god", ["owner", "leijun"], false)).toBe("owner");
  });
});

describe("appendSentMessage optimistic send", () => {
  test("appends to the active room timeline and the conversation list", () => {
    const next = appendSentMessage(baseState(), message("message:1"), { isActiveRoom: true });
    expect(next.messages.map((entry) => entry.id)).toEqual(["message:1"]);
    expect(next.conversationMessages.map((entry) => entry.id)).toEqual(["message:1"]);
  });

  test("leaves the visible timeline untouched when the room is not active", () => {
    const next = appendSentMessage(baseState(), message("message:1", "side"), {
      isActiveRoom: false,
    });
    expect(next.messages).toHaveLength(0);
    expect(next.conversationMessages.map((entry) => entry.id)).toEqual(["message:1"]);
  });

  test("is idempotent when the same message id arrives twice", () => {
    const once = appendSentMessage(baseState(), message("message:1"), { isActiveRoom: true });
    const twice = appendSentMessage(once, message("message:1"), { isActiveRoom: true });
    expect(twice).toBe(once);
    expect(twice.conversationMessages).toHaveLength(1);
  });
});

describe("role-turn failure localization", () => {
  test("routes read-only failures to the trust banner with a localized message", () => {
    const result = classifyTurnFailure(
      "message.send is not available in read-only mode. Raise trust to run-roles.",
      fakeT,
    );
    expect(result.trustRelated).toBe(true);
    expect(result.error).toBe("roleTurn.failedReadOnly");
  });

  test("routes policy denials to the trust banner", () => {
    const result = classifyTurnFailure("network.fetch is not in the allowlist", fakeT);
    expect(result.trustRelated).toBe(true);
    expect(result.error).toBe("roleTurn.failedPolicy");
  });

  test("keeps generic failures off the trust banner and preserves the raw reason", () => {
    const result = classifyTurnFailure("Provider timed out", fakeT);
    expect(result.trustRelated).toBe(false);
    expect(result.error).toContain("Provider timed out");
  });

  test("finds the most recent denial reason in the event log", () => {
    const events = [
      {
        type: "audit.created",
        eventId: "e1",
        seq: 1,
        schemaVersion: 1,
        aggregateId: "audit",
        createdAt: "2026-05-29T00:00:00.000Z",
        audit: {
          id: "a1",
          actorId: "owner",
          action: "policy.denied",
          target: "message.send",
          reason: "message.send is not available in read-only mode",
          createdAt: "2026-05-29T00:00:00.000Z",
        },
      },
    ] as unknown as RealmEvent[];
    expect(latestDenialReason(events)).toContain("read-only");
  });
});
