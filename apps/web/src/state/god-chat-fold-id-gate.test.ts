import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary } from "@realm/api-contract";
import {
  insertFoldsByTimestamp,
  mergeFingerprintsFromTurns,
  reconcileIdLessSpeechTurns,
  seedFoldedFingerprintsFromTurns,
  selectFoldsWithIdGate,
} from "@/state/god-chat-fold-id-gate.ts";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { roleSpeechFingerprint, roleSpeechPostedTurn } from "@/state/god-chat-role-turn.ts";

/**
 * Pure-helper specs for the reload DOUBLE-bubble fix (round-5 regression): a persisted
 * role-speech bubble that settled id-LESS (its posted twin landed after the live stream
 * finished) must be reconciled to its backend message id at hydration, and any
 * genuinely-new fold must slot by the message's original timestamp — never blindly at
 * the transcript tail.
 */

const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

function msg(id: string, authorId: string, content: string, createdAt: string): Message {
  return {
    authorId,
    content,
    createdAt,
    displayedAuthorId: authorId,
    id,
    roomId: "main",
    worldId: "cultivation",
  };
}

/** An id-LESS persisted role-speech bubble (the post-settle-twin path). */
function idLessBubble(id: string, speakerName: string, detail: string): ChatTurn {
  return {
    card: { detail, kind: "run-turn", speakerName, streaming: false, variant: "role-speech" },
    id,
    role: "system",
    text: "",
  };
}

describe("reconcileIdLessSpeechTurns — bind a persisted id-less bubble to its twin", () => {
  test("binds the backend message id onto an id-less bubble (exact text)", () => {
    const message = msg("m1", "guchenfeng", "我已闭关三日。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [idLessBubble("b1", "顾辰风", "我已闭关三日。")];
    const result = reconcileIdLessSpeechTurns({
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    expect(result.changed).toBe(true);
    expect(result.boundIds).toEqual(["m1"]);
    expect(result.turns[0]?.sourceMessageId).toBe("m1");
  });

  test("binds when the persisted streamed text is a PREFIX of the posted content", () => {
    // The realistic divergence: the live stream finished a token early, the posted twin
    // carries the full line. The fuzzy prefix match still binds the id authoritatively.
    const message = msg("m1", "guchenfeng", "我已闭关三日，今日方出。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [idLessBubble("b1", "顾辰风", "我已闭关三日，")];
    const result = reconcileIdLessSpeechTurns({
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    expect(result.boundIds).toEqual(["m1"]);
    expect(result.turns[0]?.sourceMessageId).toBe("m1");
  });

  test("leaves an already-bound bubble untouched (changed=false, original ref kept)", () => {
    const message = msg("m1", "guchenfeng", "我已闭关三日。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [{ ...roleSpeechPostedTurn(message, "顾辰风"), id: "b1" }];
    const result = reconcileIdLessSpeechTurns({
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    expect(result.changed).toBe(false);
    expect(result.turns).toBe(turns);
    expect(result.boundIds).toHaveLength(0);
  });

  test("never claims a backend message already bound to another bubble", () => {
    const message = msg("m1", "guchenfeng", "我已闭关三日。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [
      { ...roleSpeechPostedTurn(message, "顾辰风"), id: "bound" }, // already owns m1
      idLessBubble("idless", "顾辰风", "我已闭关三日。"),
    ];
    const result = reconcileIdLessSpeechTurns({
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    // m1 is taken; the id-less bubble finds no free twin and stays id-less.
    expect(result.changed).toBe(false);
    expect(result.turns[1]?.sourceMessageId).toBeUndefined();
  });

  test("does not bind across speakers (a different role's line is not a twin)", () => {
    const message = msg("m1", "yunyao", "我已闭关三日。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [idLessBubble("b1", "顾辰风", "我已闭关三日。")];
    const result = reconcileIdLessSpeechTurns({
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    expect(result.changed).toBe(false);
  });

  test("ignores messages from another room and operator-authored lines", () => {
    const otherRoom: Message = {
      ...msg("m1", "guchenfeng", "我已闭关三日。", "2026-01-01T00:00:00.000Z"),
      roomId: "dm",
    };
    const operatorLine = msg("m2", "owner", "我已闭关三日。", "2026-01-01T00:00:00.000Z");
    const turns: ChatTurn[] = [idLessBubble("b1", "顾辰风", "我已闭关三日。")];
    const result = reconcileIdLessSpeechTurns({
      messages: [otherRoom, operatorLine],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    expect(result.changed).toBe(false);
  });

  test("no roomId → no-op", () => {
    const result = reconcileIdLessSpeechTurns({
      messages: [msg("m1", "guchenfeng", "x", "2026-01-01T00:00:00.000Z")],
      ownerIds: ["owner"],
      roles,
      roomId: undefined,
      turns: [idLessBubble("b1", "顾辰风", "x")],
    });
    expect(result.changed).toBe(false);
  });
});

describe("insertFoldsByTimestamp — chronological slot, never blind tail", () => {
  const mintSeq = () => {
    let n = 0;
    return () => {
      n += 1;
      return `new-${n}`;
    };
  };

  test("an older re-delivered message lands in its slot, not at the tail", () => {
    // Transcript: an OLD bound bubble (t0), then a NEWER bound bubble (t2). A fold for
    // a message stamped between them (t1) must land BETWEEN, not after the newer one.
    const oldMsg = msg("a", "guchenfeng", "最早一句。", "2026-01-01T00:00:00.000Z");
    const newMsg = msg("c", "guchenfeng", "最后一句。", "2026-01-01T00:00:02.000Z");
    const midMsg = msg("b", "guchenfeng", "中间一句。", "2026-01-01T00:00:01.000Z");
    const existing: ChatTurn[] = [
      { ...roleSpeechPostedTurn(oldMsg, "顾辰风"), id: "t0" },
      { ...roleSpeechPostedTurn(newMsg, "顾辰风"), id: "t2" },
    ];
    const result = insertFoldsByTimestamp({
      existing,
      folds: [{ message: midMsg, speakerName: "顾辰风" }],
      messages: [oldMsg, newMsg, midMsg],
      mintId: mintSeq(),
    });
    expect(result.map((turn) => turn.sourceMessageId)).toEqual(["a", "b", "c"]);
  });

  test("the newest message tail-appends (live single-fold path unchanged)", () => {
    const oldMsg = msg("a", "guchenfeng", "旧句。", "2026-01-01T00:00:00.000Z");
    const newMsg = msg("b", "guchenfeng", "新句。", "2026-01-01T00:00:05.000Z");
    const existing: ChatTurn[] = [{ ...roleSpeechPostedTurn(oldMsg, "顾辰风"), id: "t0" }];
    const result = insertFoldsByTimestamp({
      existing,
      folds: [{ message: newMsg, speakerName: "顾辰风" }],
      messages: [oldMsg, newMsg],
      mintId: mintSeq(),
    });
    expect(result.map((turn) => turn.sourceMessageId)).toEqual(["a", "b"]);
  });

  test("with no resolvable timestamps the fold degrades to a stable tail append", () => {
    const existing: ChatTurn[] = [
      { id: "op", role: "operator", text: "让顾辰风发言" }, // no sourceMessageId
    ];
    const newMsg = msg("b", "guchenfeng", "新句。", "2026-01-01T00:00:05.000Z");
    const result = insertFoldsByTimestamp({
      existing,
      folds: [{ message: newMsg, speakerName: "顾辰风" }],
      messages: [newMsg],
      mintId: mintSeq(),
    });
    expect(result).toHaveLength(2);
    expect(result[1]?.sourceMessageId).toBe("b");
  });

  test("multiple folds keep oldest-first order among themselves", () => {
    const m1 = msg("a", "guchenfeng", "一。", "2026-01-01T00:00:01.000Z");
    const m2 = msg("b", "guchenfeng", "二。", "2026-01-01T00:00:02.000Z");
    const result = insertFoldsByTimestamp({
      existing: [],
      folds: [
        { message: m2, speakerName: "顾辰风" },
        { message: m1, speakerName: "顾辰风" },
      ],
      messages: [m1, m2],
      mintId: mintSeq(),
    });
    expect(result.map((turn) => turn.sourceMessageId)).toEqual(["a", "b"]);
  });

  test("empty folds returns the existing array unchanged", () => {
    const existing: ChatTurn[] = [{ id: "op", role: "operator", text: "x" }];
    expect(insertFoldsByTimestamp({ existing, folds: [], messages: [], mintId: mintSeq() })).toBe(
      existing,
    );
  });
});

/**
 * Content-fingerprint gate (round-6) — the AUTHORITATIVE re-fold veto. A posted message
 * whose `speaker::foldedText` fingerprint is already in the cross-render gate is
 * dropped regardless of its backend message id, room id, or world-load timing. This
 * closes the reload accumulation loop the id-gate alone could not: an id-less persisted
 * bubble (its twin landed after the live stream) carries no `sourceMessageId` to seed
 * the id-gate, but its content fingerprint always vetoes the re-delivered message.
 */
describe("content-fingerprint gate vetoes re-fold independent of id (round-6)", () => {
  function msg(id: string, authorId: string, content: string): Message {
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

  test("a fingerprint hit vetoes the message even when its id is NOT in the id set", () => {
    // The id-less reload case: the gate's id Set is EMPTY (the persisted bubble had no
    // sourceMessageId), but the fingerprint set holds the rendered bubble's content key.
    const message = msg("m-redelivered", "guchenfeng", "我已闭关三日，今日方出。");
    const foldedFingerprints = new Set<string>([
      roleSpeechFingerprint("顾辰风", "我已闭关三日，今日方出。"),
    ]);
    const result = selectFoldsWithIdGate({
      existing: [], // STALE snapshot: the rendered bubble is invisible here
      foldedFingerprints,
      foldedIds: new Set<string>(), // id-gate is blind to the id-less bubble
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(result.folds).toHaveLength(0);
    expect(result.fingerprintsToRegister).toHaveLength(0);
  });

  test("reports fingerprintsToRegister for a genuinely new fold so the caller can grow the gate", () => {
    const message = msg("m1", "guchenfeng", "我从洞府归来。");
    const result = selectFoldsWithIdGate({
      existing: [],
      foldedFingerprints: new Set<string>(),
      foldedIds: new Set<string>(),
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(result.folds).toHaveLength(1);
    expect(result.fingerprintsToRegister).toEqual([
      roleSpeechFingerprint("顾辰风", "我从洞府归来。"),
    ]);
  });

  test("a DIFFERENT speaker's identical line still folds (speaker is part of the key)", () => {
    const message = msg("m2", "yunyao", "我赞同此议。");
    const foldedFingerprints = new Set<string>([roleSpeechFingerprint("顾辰风", "我赞同此议。")]);
    const result = selectFoldsWithIdGate({
      existing: [],
      foldedFingerprints,
      foldedIds: new Set<string>(),
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(result.folds).toHaveLength(1);
  });

  test("seedFoldedFingerprintsFromTurns collects EVERY rendered bubble's fingerprint, id-bound or not", () => {
    const message = msg("m1", "guchenfeng", "我已闭关三日。");
    const turns: ChatTurn[] = [
      { id: "op", role: "operator", text: "让顾辰风发言" },
      { ...roleSpeechPostedTurn(message, "顾辰风"), id: "b1" }, // id-bound
      {
        // id-less persisted bubble (the reload accumulation root cause)
        card: {
          detail: "云遥说：此界初开。",
          kind: "run-turn",
          speakerName: "云遥",
          streaming: false,
          variant: "role-speech",
        },
        id: "b2",
        role: "system",
        text: "",
      },
    ];
    const fingerprints = seedFoldedFingerprintsFromTurns(turns);
    expect(fingerprints).toContain(roleSpeechFingerprint("顾辰风", "我已闭关三日。"));
    expect(fingerprints).toContain(roleSpeechFingerprint("云遥", "云遥说：此界初开。"));
    expect(fingerprints).toHaveLength(2);
  });

  test("mergeFingerprintsFromTurns self-heals the gate from a late-hydrated bubble", () => {
    const gate = new Set<string>();
    const message = msg("m1", "guchenfeng", "我已闭关三日。");
    const turns: ChatTurn[] = [{ ...roleSpeechPostedTurn(message, "顾辰风"), id: "b1" }];
    // First merge adds the fingerprint; the gate now vetoes its message.
    expect(mergeFingerprintsFromTurns(gate, turns)).toBe(true);
    expect(gate.has(roleSpeechFingerprint("顾辰风", "我已闭关三日。"))).toBe(true);
    // Idempotent: a second merge of the same turns adds nothing.
    expect(mergeFingerprintsFromTurns(gate, turns)).toBe(false);

    const result = selectFoldsWithIdGate({
      existing: [],
      foldedFingerprints: gate,
      foldedIds: new Set<string>(),
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(result.folds).toHaveLength(0);
  });
});
