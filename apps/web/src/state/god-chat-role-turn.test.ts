import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import {
  seedFoldedIdsFromTurns,
  selectFoldsWithIdGate,
  settleBoundMessageId,
} from "@/state/god-chat-fold-id-gate.ts";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import {
  roleSpeechPostedTurn,
  selectRoleMessagesToFold,
  settleRunTurn,
  turnAnchorMessageId,
} from "@/state/god-chat-role-turn.ts";

/**
 * Double-render regression (P1): after a role turn runs, the reply must materialize
 * as EXACTLY ONE `role-speech` bubble — never two identical bubbles stacked. The
 * root cause was a same-render split brain: the active-run-turn SETTLE effect
 * materializes a settled bubble from streamed text, while the posted-fold effect —
 * reading the SAME (pre-update) `turns` snapshot — can't see that bubble yet and
 * folds the same posted message a second time.
 *
 * These tests drive `settleRunTurn` + `selectRoleMessagesToFold` back-to-back the way
 * the two effects fire on ONE SSE batch, asserting the fold defers to the settle via
 * the `pendingReply` claim so only the settle renders the reply. They cover the
 * fake / no-delta paths called out in the brief: streamed ≡ posted, streamed a
 * prefix of posted, and no streamed text (posted only).
 */

const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

function postedMsg(id: string, authorId: string, content: string): Message {
  return {
    authorId,
    content,
    createdAt: new Date().toISOString(),
    displayedAuthorId: authorId,
    id,
    roomId: "main",
    worldId: "cultivation",
  };
}

/** Fold a turn's role-speech bubble into its (speaker, folded-text) identity key. */
function speechKey(turn: ChatTurn): string | undefined {
  if (turn.card?.variant !== "role-speech") {
    return undefined;
  }
  const folded = turn.card.detail.trim().replace(/\s+/g, " ");
  return `${turn.card.speakerName}::${folded}`;
}

/** Count distinct role-speech bubbles in a transcript keyed by speaker + fold text. */
function countDistinctSpeech(turns: ChatTurn[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    const key = speechKey(turn);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Run BOTH transcript-sync effects on a single SSE batch the way the React hook does:
 * the SETTLE effect resolves the terminal turn into one bubble; the POSTED-FOLD
 * effect runs against the SAME pre-settle `existing` snapshot (the committed value
 * has NOT been applied yet), handed the pending reply claim so it can defer. Returns
 * the merged transcript both effects would have produced this render.
 */
function applyBothEffects(args: {
  existing: ChatTurn[];
  messages: Message[];
  streamed: string | undefined;
  bubbleTurnId?: string;
}): ChatTurn[] {
  const { existing, messages, streamed, bubbleTurnId } = args;
  const roleName = "顾辰风";
  const turnId = "t1";

  // 1) Active-run-turn SETTLE effect (terminal completed).
  const settle = settleRunTurn({
    bubbleTurnId,
    denialReason: undefined,
    events: [] as RealmEvent[],
    existing,
    messages,
    ownerIds: ["owner"],
    roleName,
    roles,
    roomId: "main",
    streamed,
    terminal: { kind: "completed" },
    turnId,
  });

  let afterSettle = existing;
  if (settle.kind === "settleNew") {
    afterSettle = [...existing, { ...settle.turn, id: "settled-1" }];
  } else if (settle.kind === "growBubble") {
    afterSettle = existing.map((turn) =>
      turn.id === settle.bubbleTurnId && turn.card?.variant === "role-speech"
        ? {
            ...turn,
            card: { ...turn.card, detail: settle.detail, streaming: false },
            sourceMessageId: settle.sourceMessageId ?? turn.sourceMessageId,
          }
        : turn,
    );
  }

  // 2) Posted-fold effect — runs against the SAME pre-settle snapshot, but with the
  //    pending reply claim (the active turn is terminal this render).
  const folded = selectRoleMessagesToFold({
    existing,
    messages,
    ownerIds: ["owner"],
    pendingReply: { speakerName: roleName, streamed },
    roles,
    roomId: "main",
  });
  const afterFold = folded.map((entry, index) => ({
    card: {
      detail: entry.message.content,
      kind: "run-turn" as const,
      speakerName: entry.speakerName,
      streaming: false,
      variant: "role-speech" as const,
    },
    id: `folded-${index}`,
    role: "system" as const,
    sourceMessageId: entry.message.id,
    text: "",
  }));

  // The hook commits BOTH effects' appends in the same render; merge them.
  return [...afterSettle, ...afterFold];
}

describe("no double role-speech bubble on the fake / no-delta path (P1)", () => {
  test("streamed ≡ posted, same batch → exactly ONE bubble", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日。");
    const transcript = applyBothEffects({
      existing: [],
      messages: [message],
      streamed: "我已闭关三日。",
    });
    const counts = countDistinctSpeech(transcript);
    expect(counts.get("顾辰风::我已闭关三日。")).toBe(1);
    expect(transcript.filter((t) => t.card?.variant === "role-speech")).toHaveLength(1);
  });

  test("streamed is a PREFIX of posted (trailing token dropped) → exactly ONE bubble", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const transcript = applyBothEffects({
      existing: [],
      messages: [message],
      streamed: "我已闭关三日，",
    });
    expect(transcript.filter((t) => t.card?.variant === "role-speech")).toHaveLength(1);
  });

  test("NO streamed text, posted only → exactly ONE bubble (settle owns it)", () => {
    const message = postedMsg("m1", "guchenfeng", "我从室外回来。");
    const transcript = applyBothEffects({
      existing: [],
      messages: [message],
      streamed: undefined,
    });
    const speech = transcript.filter((t) => t.card?.variant === "role-speech");
    expect(speech).toHaveLength(1);
    expect(speech[0]?.card?.variant === "role-speech" && speech[0].card.detail).toBe(
      "我从室外回来。",
    );
  });

  test("growBubble path: a live streaming bubble settles in place + posted twin not re-folded", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日。");
    const streamingBubble: ChatTurn[] = [
      {
        card: {
          detail: "我已闭关",
          kind: "run-turn",
          speakerName: "顾辰风",
          streaming: true,
          variant: "role-speech",
        },
        id: "bubble-1",
        role: "system",
        streamingTurnId: "t1",
        text: "",
      },
    ];
    const transcript = applyBothEffects({
      bubbleTurnId: "bubble-1",
      existing: streamingBubble,
      messages: [message],
      streamed: "我已闭关三日。",
    });
    expect(transcript.filter((t) => t.card?.variant === "role-speech")).toHaveLength(1);
  });
});

describe("fold still works when there is no pending settle (no regression)", () => {
  test("posted role line with no active turn → folds exactly once", () => {
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [postedMsg("m1", "guchenfeng", "我已闭关三日。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
  });

  test("a SECOND distinct line from the same speaker still folds even while one is claimed", () => {
    // The pending claim withholds exactly ONE message; a genuinely different second
    // line of the same speaker must still fold.
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [
        postedMsg("m1", "guchenfeng", "我已闭关三日。"),
        postedMsg("m2", "guchenfeng", "今日天气晴朗，宜远行。"),
      ],
      ownerIds: ["owner"],
      pendingReply: { speakerName: "顾辰风", streamed: "我已闭关三日。" },
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
    expect(folded[0]?.message.id).toBe("m2");
  });

  test("pendingReply for a DIFFERENT speaker does not withhold this speaker's line", () => {
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [postedMsg("m1", "guchenfeng", "我已闭关三日。")],
      ownerIds: ["owner"],
      pendingReply: { speakerName: "云遥", streamed: "另一句话" },
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
  });
});

/**
 * Reload triple-render guard (P1): the ref-backed id Set — NOT the in-render
 * `existing` snapshot — is the authoritative gate so one backend message folds at
 * most once across the hydration re-render storm. `selectFoldsWithIdGate` proves the
 * contract: called TWICE with the SAME message and an `existing` that does NOT yet
 * reflect the first fold (the stale snapshot that caused the bug), the second call
 * must still drop the message because its id is in the caller's set.
 */
describe("id-gate is authoritative across renders (reload P1)", () => {
  const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");

  test("second pass with a STALE `existing` is still deduped by the caller's id set", () => {
    // Pass 1: nothing folded yet; the gate selects the message and reports its id.
    const first = selectFoldsWithIdGate({
      existing: [],
      foldedIds: new Set<string>(),
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(first.folds).toHaveLength(1);
    expect(first.idsToRegister).toEqual(["m1"]);

    // The caller registers the ids synchronously into its ref Set.
    const foldedIds = new Set<string>(first.idsToRegister);

    // Pass 2 simulates the hydration re-render: `existing` is STILL empty (the prior
    // append hasn't committed to `turns` yet — the exact stale-snapshot condition that
    // re-appended the bubble). The id Set must veto it anyway.
    const second = selectFoldsWithIdGate({
      existing: [],
      foldedIds,
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(second.folds).toHaveLength(0);
    expect(second.idsToRegister).toHaveLength(0);
  });

  test("a genuinely NEW message still folds even with prior ids in the set", () => {
    const foldedIds = new Set<string>(["m1"]);
    const result = selectFoldsWithIdGate({
      existing: [],
      foldedIds,
      messages: [message, postedMsg("m2", "guchenfeng", "今日天气晴朗，宜远行。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(result.folds).toHaveLength(1);
    expect(result.idsToRegister).toEqual(["m2"]);
  });

  test("settleBoundMessageId reports the twin a settle bound so the gate can pre-claim it", () => {
    // A stream-settled bubble that bound its posted twin: the hook adds this id to the
    // SAME ref so the posted-fold effect never re-folds it on a later re-render.
    const settle = settleRunTurn({
      bubbleTurnId: undefined,
      denialReason: undefined,
      events: [] as RealmEvent[],
      existing: [],
      messages: [message],
      ownerIds: ["owner"],
      roleName: "顾辰风",
      roles,
      roomId: "main",
      streamed: "我已闭关三日，",
      terminal: { kind: "completed" },
      turnId: "t1",
    });
    expect(settleBoundMessageId(settle)).toBe("m1");

    // Feeding that id into the gate vetoes the posted twin even with empty `existing`.
    const gated = selectFoldsWithIdGate({
      existing: [],
      foldedIds: new Set<string>([settleBoundMessageId(settle) ?? ""]),
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(gated.folds).toHaveLength(0);
  });

  test("seedFoldedIdsFromTurns collects every persisted bubble's sourceMessageId", () => {
    // The hydrated transcript carries settled role-speech bubbles bound to their
    // backend message ids; seeding the gate from them blocks an immediate re-fold.
    const hydrated: ChatTurn[] = [
      { id: "u1", role: "operator", text: "让顾辰风发言" },
      { ...roleSpeechPostedTurn(message, "顾辰风"), id: "b1" }, // sourceMessageId m1
    ];
    expect(seedFoldedIdsFromTurns(hydrated)).toEqual(["m1"]);
  });

  test("seedFoldedIdsFromTurns ignores turns with no sourceMessageId and de-dupes", () => {
    const turns: ChatTurn[] = [
      { id: "sys", role: "system", text: "回合进行中" }, // no sourceMessageId
      { id: "b1", role: "system", sourceMessageId: "m1", text: "" },
      { id: "b2", role: "system", sourceMessageId: "m1", text: "" }, // duplicate id
      { id: "b3", role: "system", sourceMessageId: "m2", text: "" },
    ];
    expect(seedFoldedIdsFromTurns(turns).sort()).toEqual(["m1", "m2"]);
  });

  test("a hydrated bubble's seeded id blocks the posted-fold of its own backend message", () => {
    // The reload double-bubble: persistence loads `turns` WITH the settled bubble
    // (sourceMessageId m1), the gate is seeded from it, and fresh scopedMessages
    // re-delivers the same message.created → the gate vetoes it, zero re-folds.
    const hydrated: ChatTurn[] = [{ ...roleSpeechPostedTurn(message, "顾辰风"), id: "b1" }];
    const foldedIds = new Set<string>(seedFoldedIdsFromTurns(hydrated));
    const gated = selectFoldsWithIdGate({
      existing: hydrated,
      foldedIds,
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(gated.folds).toHaveLength(0);
  });

  test("settleBoundMessageId is undefined for fail / none / unbound settles", () => {
    expect(settleBoundMessageId({ kind: "none" })).toBeUndefined();
    expect(
      settleBoundMessageId({
        card: {
          detail: "x",
          kind: "run-turn",
          title: "回合失败",
          variant: "result",
        },
        kind: "fail",
        text: "x",
        trustRelated: false,
      }),
    ).toBeUndefined();
    expect(
      settleBoundMessageId({ bubbleTurnId: "b1", detail: "我...", kind: "growBubble" }),
    ).toBeUndefined();
  });
});

/**
 * Stable-anchor specs (round-6, reload accumulation loop). A freshly-created NL world
 * runs run-turn while `selectedRoom.id` is still undefined / arriving async, so
 * `findPostedTwinForStream` can't resolve the posted twin and (before the round-6
 * anchor) the streamed reply persisted id-LESS — re-folding at the tail on every
 * reload. The settle now anchors the bubble on a turnId-derived `sourceMessageId` so
 * it is always seed-able across reloads, while the `turn:` prefix guarantees it never
 * collides with a real backend `message.id`.
 */
describe("settleRunTurn anchors the settled bubble when no posted twin exists", () => {
  function settle(args: {
    bubbleTurnId?: string;
    streamed?: string;
    messages?: Message[];
    roomId?: string;
  }) {
    return settleRunTurn({
      bubbleTurnId: args.bubbleTurnId,
      denialReason: undefined,
      events: [] as RealmEvent[],
      existing: [],
      messages: args.messages ?? [],
      ownerIds: ["owner"],
      roleName: "顾辰风",
      roles,
      roomId: args.roomId,
      streamed: args.streamed,
      terminal: { kind: "completed" },
      turnId: "t1",
    });
  }

  test("turnAnchorMessageId prefixes with `turn:` (collision-proof vs real message ids)", () => {
    expect(turnAnchorMessageId("t1")).toBe("turn:t1");
  });

  test("settleNew with NO room → bubble carries the turn anchor, never id-less", () => {
    const result = settle({ roomId: undefined, streamed: "我已闭关三日。" });
    expect(result.kind).toBe("settleNew");
    if (result.kind === "settleNew") {
      expect(result.turn.sourceMessageId).toBe(turnAnchorMessageId("t1"));
    }
  });

  test("settleNew with a room but the twin not landed yet → still anchored, not id-less", () => {
    const result = settle({ messages: [], roomId: "main", streamed: "我已闭关三日。" });
    expect(result.kind).toBe("settleNew");
    if (result.kind === "settleNew") {
      expect(result.turn.sourceMessageId).toBe(turnAnchorMessageId("t1"));
    }
  });

  test("settleNew binds the REAL posted twin id when it HAS landed (acceleration path)", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const result = settle({ messages: [message], roomId: "main", streamed: "我已闭关三日，" });
    expect(result.kind).toBe("settleNew");
    if (result.kind === "settleNew") {
      expect(result.turn.sourceMessageId).toBe("m1");
    }
  });

  test("growBubble (live streaming bubble) with no twin → anchored on the turn id", () => {
    const result = settle({
      bubbleTurnId: "bubble-1",
      roomId: undefined,
      streamed: "我已闭关三日。",
    });
    expect(result.kind).toBe("growBubble");
    if (result.kind === "growBubble") {
      expect(result.sourceMessageId).toBe(turnAnchorMessageId("t1"));
    }
  });
});
