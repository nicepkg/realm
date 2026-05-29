import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent } from "@realm/api-contract";
import {
  type FailedDraftStore,
  failedDraftKey,
  rehydrateFailedDraft,
  stashFailedDraft,
} from "./failed-draft-store.ts";
import {
  accumulateStreamedText,
  appendSentMessage,
  classifyTurnFailure,
  latestDenialReason,
  pendingResumeFromStoredIdentity,
  resolveIdentityAfterRealmLoad,
  resolveRoomRunRoleId,
  type SendError,
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

describe("persisted-identity resume gating (L4-01)", () => {
  test("offers a persisted role as a resume suggestion instead of auto-activating it", () => {
    // selectWorld restores owner as the ACTIVE send identity and only stashes the
    // stored role for confirmation, so a persisted viewer never silently takes over.
    expect(pendingResumeFromStoredIdentity("leijun")).toBe("leijun");
  });

  test("never offers a resume suggestion for owner (returning to yourself is silent and safe)", () => {
    expect(pendingResumeFromStoredIdentity("owner")).toBeUndefined();
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

describe("failed-send draft recovery across navigation (EP-1)", () => {
  function failure(overrides: Partial<SendError> = {}): SendError {
    return {
      displayedAuthorId: "leijun",
      draft: "未发出的消息",
      message: "network down",
      pendingId: "pending-1",
      roomId: "main",
      worldId: "cultivation",
      ...overrides,
    };
  }

  test("a failed send + selectRoom away + return rehydrates the draft", () => {
    // Authored as leijun in cultivation/main, then navigated away (which stashes
    // the draft before clearing pending send state).
    const stashed = stashFailedDraft(new Map(), failure());
    expect(stashed.get(failedDraftKey("cultivation", "main", "leijun"))).toBe("未发出的消息");

    // Returning to a different room does NOT leak the draft.
    const elsewhere = rehydrateFailedDraft(stashed, {
      currentDraft: "",
      identity: "leijun",
      roomId: "side",
      worldId: "cultivation",
    });
    expect(elsewhere.draft).toBeUndefined();

    // Returning to the exact room + identity rehydrates the composer once.
    const returned = rehydrateFailedDraft(stashed, {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(returned.draft).toBe("未发出的消息");
    // The entry is consumed so a later visit does not re-apply it.
    const again = rehydrateFailedDraft(returned.store, {
      currentDraft: "",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(again.draft).toBeUndefined();
  });

  test("does not leak a draft into another account's composer for the same room", () => {
    const stashed = stashFailedDraft(new Map(), failure());
    const asOwner = rehydrateFailedDraft(stashed, {
      currentDraft: "",
      identity: "owner",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(asOwner.draft).toBeUndefined();
  });

  test("never clobbers an in-progress edit already in the composer", () => {
    const stashed = stashFailedDraft(new Map(), failure());
    const result = rehydrateFailedDraft(stashed, {
      currentDraft: "typing something new",
      identity: "leijun",
      roomId: "main",
      worldId: "cultivation",
    });
    expect(result.draft).toBeUndefined();
    expect(result.store).toBe(stashed);
  });

  test("ignores empty / whitespace-only drafts and missing errors", () => {
    const empty: FailedDraftStore = new Map();
    expect(stashFailedDraft(empty, undefined)).toBe(empty);
    expect(stashFailedDraft(empty, failure({ draft: "   " }))).toBe(empty);
    expect(stashFailedDraft(empty, failure({ draft: "" }))).toBe(empty);
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

describe("live turn streaming accumulation (FB-401)", () => {
  function delta(turnId: string, text: string, eventId: string): RealmEvent {
    return {
      type: "turn.delta",
      eventId,
      seq: 1,
      schemaVersion: 1,
      aggregateId: `turn:${turnId}`,
      createdAt: "2026-05-29T00:00:00.000Z",
      delta: { turnId, roleId: "leijun", delta: text },
    } as unknown as RealmEvent;
  }

  test("concatenates turn.delta token text for the active turn in stream order", () => {
    const events = [
      delta("t1", "道友，", "e1"),
      delta("t2", "无关回合", "e2"),
      delta("t1", "请看", "e3"),
    ];
    expect(accumulateStreamedText(events, "t1")).toBe("道友，请看");
  });

  test("returns undefined before the first token so the bubble keeps its shimmer", () => {
    expect(accumulateStreamedText([], "t1")).toBeUndefined();
    expect(accumulateStreamedText([delta("t2", "其他", "e1")], "t1")).toBeUndefined();
  });

  test("returns undefined when there is no active turn (cleared on terminal)", () => {
    expect(accumulateStreamedText([delta("t1", "tokens", "e1")], undefined)).toBeUndefined();
  });

  test("is idempotent when the same deltas are replayed (no double-count)", () => {
    const events = [delta("t1", "abc", "e1"), delta("t1", "def", "e2")];
    expect(accumulateStreamedText(events, "t1")).toBe("abcdef");
    // Replaying the identical authoritative log yields the same string.
    expect(accumulateStreamedText([...events], "t1")).toBe("abcdef");
  });
});

describe("run-target room membership (MC-R4-1)", () => {
  test("defaults the run role to a ROOM MEMBER, not roles[0]", () => {
    // leijun is configured first, but only guchenfeng is a member of this room.
    expect(resolveRoomRunRoleId(["owner", "guchenfeng"], ["leijun", "guchenfeng"], "")).toBe(
      "guchenfeng",
    );
  });

  test("keeps the current selection when it is already a room member", () => {
    expect(
      resolveRoomRunRoleId(["leijun", "guchenfeng"], ["leijun", "guchenfeng"], "guchenfeng"),
    ).toBe("guchenfeng");
  });

  test("clamps a stale non-member selection back to the first room member", () => {
    expect(resolveRoomRunRoleId(["guchenfeng"], ["leijun", "guchenfeng"], "leijun")).toBe(
      "guchenfeng",
    );
  });

  test("falls back to the first role when the room has no role members", () => {
    expect(resolveRoomRunRoleId(["owner"], ["leijun", "guchenfeng"], "")).toBe("leijun");
  });
});
