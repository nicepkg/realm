import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary } from "@realm/api-contract";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import {
  existingRoleSpeechFingerprints,
  foldSpeechText,
  isSameRoleSpeech,
  roleSpeechFingerprint,
  selectRoleMessagesToFold,
} from "@/state/god-chat-role-fold.ts";

/**
 * Content-fingerprint dedup specs (round-6 architecture fix for the reload
 * accumulation loop). The AUTHORITATIVE role-speech dedup key is the
 * `speaker::foldedText` content fingerprint — decoupled from backend message id, room
 * id, and world-load timing. A posted message whose speaker + folded content matches
 * an already-rendered bubble must be STRUCTURALLY impossible to re-fold, no matter
 * whether the bubble bound an id or which room/world the message belongs to.
 */

const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

function msg(id: string, authorId: string, content: string, roomId = "main"): Message {
  return {
    authorId,
    content,
    createdAt: new Date().toISOString(),
    displayedAuthorId: authorId,
    id,
    roomId,
    worldId: "cultivation",
  };
}

/** A rendered role-speech bubble; `sourceMessageId` optional (the id-less reload case). */
function speechBubble(
  id: string,
  speakerName: string,
  detail: string,
  sourceMessageId?: string,
): ChatTurn {
  return {
    card: { detail, kind: "run-turn", speakerName, streaming: false, variant: "role-speech" },
    id,
    role: "system",
    sourceMessageId,
    text: "",
  };
}

describe("roleSpeechFingerprint — the authoritative dedup key", () => {
  test("combines speaker + whitespace-folded text", () => {
    expect(roleSpeechFingerprint("顾辰风", "  我已闭关三日。 ")).toBe(
      `顾辰风::${foldSpeechText("我已闭关三日。")}`,
    );
  });

  test("same content, different speaker → distinct fingerprints", () => {
    expect(roleSpeechFingerprint("顾辰风", "同一句话。")).not.toBe(
      roleSpeechFingerprint("云遥", "同一句话。"),
    );
  });

  test("incidental whitespace differences fold to the SAME fingerprint", () => {
    expect(roleSpeechFingerprint("顾辰风", "我已  闭关\n三日。")).toBe(
      roleSpeechFingerprint("顾辰风", "我已 闭关 三日。"),
    );
  });
});

describe("existingRoleSpeechFingerprints — collects every rendered bubble's key", () => {
  test("collects role-speech bubbles, ignores non-speech turns", () => {
    const turns: ChatTurn[] = [
      { id: "op", role: "operator", text: "让顾辰风发言" },
      speechBubble("b1", "顾辰风", "我已闭关三日。", "m1"),
      speechBubble("b2", "云遥", "此界初开。"), // id-less but still fingerprinted
    ];
    const fingerprints = existingRoleSpeechFingerprints(turns);
    expect(fingerprints.has(roleSpeechFingerprint("顾辰风", "我已闭关三日。"))).toBe(true);
    expect(fingerprints.has(roleSpeechFingerprint("云遥", "此界初开。"))).toBe(true);
    expect(fingerprints.size).toBe(2);
  });
});

describe("selectRoleMessagesToFold — content fingerprint vetoes re-fold (round-6)", () => {
  test("a posted message matching a rendered bubble by content is NOT re-folded — even ID-LESS", () => {
    // The reload accumulation root cause: the rendered bubble settled id-less (no
    // sourceMessageId), so the id-gate is blind to it. The fingerprint key must still
    // veto the re-delivered posted message regardless of id.
    const existing: ChatTurn[] = [speechBubble("b1", "顾辰风", "我已闭关三日。")];
    const folded = selectRoleMessagesToFold({
      existing,
      messages: [msg("m-new", "guchenfeng", "我已闭关三日。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(0);
  });

  test("vetoes even when the posted message id DIFFERS from any bound id", () => {
    // The bubble is bound to one id; a posted message with a DIFFERENT id but the SAME
    // content (a re-delivery the backend re-stamped) must still be blocked by content.
    const existing: ChatTurn[] = [speechBubble("b1", "顾辰风", "我已闭关三日。", "m-old")];
    const folded = selectRoleMessagesToFold({
      existing,
      messages: [msg("m-different", "guchenfeng", "我已闭关三日。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(0);
  });

  test("the same posted message folds AT MOST once across repeated select passes", () => {
    // Idempotency: select → render the bubble → select again with that bubble in
    // `existing` must add nothing (the fingerprint of the just-folded line is present).
    const message = msg("m1", "guchenfeng", "我从洞府归来。");
    const first = selectRoleMessagesToFold({
      existing: [],
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(first).toHaveLength(1);
    const rendered: ChatTurn[] = [
      speechBubble("b1", first[0]?.speakerName ?? "顾辰风", message.content, message.id),
    ];
    const second = selectRoleMessagesToFold({
      existing: rendered,
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(second).toHaveLength(0);
  });

  test("a DISTINCT line from the same speaker still folds (no over-suppression)", () => {
    const existing: ChatTurn[] = [speechBubble("b1", "顾辰风", "我已闭关三日。", "m1")];
    const folded = selectRoleMessagesToFold({
      existing,
      messages: [msg("m2", "guchenfeng", "今日天气晴朗，宜远行。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
    expect(folded[0]?.message.id).toBe("m2");
  });

  test("the fingerprint key is speaker-scoped (pure), even though the fuzzy text backstop is not", () => {
    // The fingerprint INCLUDES the speaker, so 顾辰风 and 云遥 saying identical words
    // produce DISTINCT fingerprints — the authoritative key never conflates two
    // speakers. (The legacy fuzzy-text backstop in `selectRoleMessagesToFold` is
    // deliberately speaker-AGNOSTIC and still conservatively collapses identical text
    // regardless of speaker; we keep that existing guard untouched per the brief and
    // assert the fingerprint distinction at the pure-key level here.)
    expect(roleSpeechFingerprint("顾辰风", "我赞同此议。")).not.toBe(
      roleSpeechFingerprint("云遥", "我赞同此议。"),
    );
  });

  test("two identical posted lines in ONE pass fold only ONCE (in-pass fingerprint dedup)", () => {
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [msg("m1", "guchenfeng", "重复的一句。"), msg("m2", "guchenfeng", "重复的一句。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
  });
});

describe("isSameRoleSpeech — fuzzy CONTAINMENT backstop kept intact", () => {
  test("a streamed prefix still matches its fuller posted twin (trailing token dropped)", () => {
    expect(isSameRoleSpeech("我已闭关三日，", "我已闭关三日，今日方出。")).toBe(true);
  });

  test("unrelated short lines do not collide", () => {
    expect(isSameRoleSpeech("好。", "走。")).toBe(false);
  });
});
