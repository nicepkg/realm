import type { Message, RoleSummary } from "@realm/api-contract";
import type { ChatTurn } from "@/state/god-chat-model.ts";

/**
 * God-chat role-speech FOLD + dedup reconciliation (F1) — split out of
 * `god-chat-role-turn.ts` to keep both files under the 500-line budget. This owns the
 * pure "is a posted room message the SAME utterance as an already-rendered bubble"
 * logic and the message-selection that folds genuine role speech back into the NL
 * transcript as exactly ONE bubble. Everything here is pure and deterministically
 * unit-testable; `god-chat-role-turn.ts` re-exports it so existing import sites keep
 * working.
 */

/**
 * Whitespace-fold a string for fuzzy role-speech matching: trim, collapse runs of
 * internal whitespace to a single space. A streamed reply (assembled token by
 * token) and its posted twin (the persisted `message.content`) frequently differ
 * only by trailing tokens or incidental whitespace, so exact equality is too
 * brittle to dedupe them — folding makes the common case compare equal.
 */
export function foldSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * True when a posted message's content and an already-rendered role-speech bubble
 * are the SAME utterance modulo streaming jitter. Streaming assembles the reply
 * incrementally, so the settled stream may be a prefix of the posted content (or
 * vice-versa) when the final token / trailing whitespace differs. We treat a
 * containment relationship on the folded text (above a small floor, so two short
 * unrelated lines don't collide) as a match. Pure + symmetric. Exported so the reload
 * reconciliation gate binds id-less bubbles with the EXACT same "same utterance" rule.
 */
export function isSameRoleSpeech(a: string, b: string): boolean {
  const fa = foldSpeechText(a);
  const fb = foldSpeechText(b);
  if (fa.length === 0 || fb.length === 0) {
    return fa === fb;
  }
  if (fa === fb) {
    return true;
  }
  // Prefix/containment guard: only trust containment for non-trivial overlaps so a
  // one-character streamed fragment can't swallow an unrelated short message.
  const [shorter, longer] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * The already-rendered role-speech bubbles, reduced to the two keys
 * `selectRoleMessagesToFold` / `findPostedTwinForStream` dedupe against:
 *  - `seenMessageIds`: ids a bubble was reconciled / settled from
 *    (`sourceMessageId`), so a posted message is matched id-exactly. A
 *    stream-settled bubble now binds its posted twin's id, so a reply rendered by
 *    the active-run-turn effect is hit here even though it was never "posted-folded".
 *  - `texts`: folded display texts of every role-speech bubble (streamed, settled,
 *    or posted) — the fuzzy-text backstop for when the stream finished before its
 *    posted twin landed (no id to bind yet) and the two differ by trailing tokens.
 */
function existingRoleSpeechKeys(existing: ChatTurn[]): {
  seenMessageIds: Set<string>;
  texts: string[];
} {
  const seenMessageIds = new Set<string>();
  const texts: string[] = [];
  for (const turn of existing) {
    if (turn.sourceMessageId) {
      seenMessageIds.add(turn.sourceMessageId);
    }
    if (turn.card?.variant !== "role-speech") {
      continue;
    }
    const folded = foldSpeechText(turn.card.detail);
    if (folded.length > 0) {
      texts.push(folded);
    }
  }
  return { seenMessageIds, texts };
}

/**
 * An in-flight role reply the active-run-turn effect is about to (or has just)
 * settled, but whose settled bubble is NOT YET committed to `existing` because both
 * the settle effect and the posted-fold effect read the SAME `turns` snapshot in one
 * render. Passing this to `selectRoleMessagesToFold` lets the fold effect "see" the
 * claim and skip the posted twin, so a single reply never renders twice (the
 * double-bubble root cause: the freshly-settled bubble isn't in `existing` yet, so
 * `sourceMessageId` / `existingRoleSpeechKeys` can't dedupe against it).
 */
export type PendingRoleReplyClaim = {
  /** Display name of the role whose reply is being settled. */
  speakerName: string;
  /** Streamed text accumulated for the active turn (undefined when no token landed). */
  streamed: string | undefined;
};

/**
 * True when a posted message is the SAME reply a pending active-run-turn settle is
 * about to claim. Matched by speaker AND fuzzy text so the fold defers to the settle
 * for that one message. With NO streamed text (the no-delta trusted path), settle
 * resolves from the FIRST eligible posted message of that speaker, so the speaker
 * match alone claims it.
 */
function isClaimedByPendingReply(
  message: Message,
  speakerName: string,
  claim: PendingRoleReplyClaim,
): boolean {
  if (claim.speakerName !== speakerName) {
    return false;
  }
  // No streamed text: settle will fold the first eligible posted line of this
  // speaker, so the speaker match is enough to defer.
  if (claim.streamed === undefined || foldSpeechText(claim.streamed).length === 0) {
    return true;
  }
  return isSameRoleSpeech(claim.streamed, message.content);
}

/**
 * Decide which posted room messages should be folded into the NL transcript as
 * role-speech bubbles (F1). The trusted path makes the backend really generate
 * role speech (e.g. a guchenfeng line) that posts to the room but never reaches
 * the NL conversation. We pull in messages authored by a ROLE (not the
 * operator/owner), in the selected room, that are not already represented.
 *
 * Dedup is layered so the same reply is never rendered twice when both the
 * active-run-turn effect (streamed bubble) and this posted-message effect see it
 * in the same SSE batch:
 *  1. `pendingReply` — the active-run-turn settle is about to materialize this exact
 *     reply but its bubble isn't committed to `existing` yet (same-render split
 *     brain); we yield ownership to the settle effect so it renders the ONE bubble;
 *  2. by `sourceMessageId` — a settled stream binds the posted message id, so a
 *     LATER pass's `seenMessageIds` hits it exactly;
 *  3. by fuzzy text containment against any existing role-speech bubble — covers a
 *     streamed detail / posted content differing by trailing tokens / whitespace.
 * Pure + idempotent: re-running with the same inputs adds nothing.
 */
export function selectRoleMessagesToFold(input: {
  messages: Message[];
  roomId: string | undefined;
  roles: RoleSummary[];
  existing: ChatTurn[];
  ownerIds: string[];
  /** A reply the active-run-turn settle is claiming this render (not yet in `existing`). */
  pendingReply?: PendingRoleReplyClaim;
}): { message: Message; speakerName: string }[] {
  const { messages, roomId, roles, existing, ownerIds, pendingReply } = input;
  if (!roomId) {
    return [];
  }
  const roleById = new Map(roles.map((role) => [role.id, role] as const));
  const ownerSet = new Set(ownerIds);
  const { seenMessageIds, texts } = existingRoleSpeechKeys(existing);
  // Mutable so each newly folded message also dedupes the rest of this same pass
  // (two roles posting identical-looking lines stay distinct; a single line never
  // doubles).
  const seenRoleTexts = [...texts];
  const folded: { message: Message; speakerName: string }[] = [];
  // The pending settle claims at most ONE posted message; once claimed, later
  // identical-looking lines of the same speaker fold normally (only the settle's
  // single reply is withheld).
  let pendingClaimed = false;
  for (const message of messages) {
    if (message.roomId !== roomId) {
      continue;
    }
    if (seenMessageIds.has(message.id)) {
      continue;
    }
    // Only fold genuine role speech: authored by a known role, not the operator.
    const role = roleById.get(message.authorId);
    if (!role || ownerSet.has(message.authorId)) {
      continue;
    }
    // Defer the ONE message the active settle is about to claim (its bubble isn't in
    // `existing` yet this render): the settle effect renders it uniquely.
    if (
      pendingReply &&
      !pendingClaimed &&
      isClaimedByPendingReply(message, role.displayName, pendingReply)
    ) {
      pendingClaimed = true;
      continue;
    }
    // Skip a posted message already represented by a streamed/settled bubble even
    // when the text differs by trailing tokens (the double-bubble root cause).
    if (seenRoleTexts.some((seen) => isSameRoleSpeech(seen, message.content))) {
      continue;
    }
    folded.push({ message, speakerName: role.displayName });
    seenRoleTexts.push(foldSpeechText(message.content));
  }
  return folded;
}

/**
 * Find the posted room message that a streamed role reply corresponds to, so a
 * settled streaming bubble can bind its `sourceMessageId` (F1). The streamed text
 * and the persisted `message.content` may differ by trailing tokens / whitespace,
 * so we match on the same fuzzy containment used to dedupe, restricted to messages
 * authored by the role that ran the turn, in the selected room, not already bound
 * to another rendered bubble. Returns undefined when the posted twin hasn't landed
 * yet (the bubble settles id-less and the later posted-message effect dedupes it
 * by text instead).
 */
export function findPostedTwinForStream(input: {
  streamed: string;
  speakerName: string;
  messages: Message[];
  roomId: string | undefined;
  roles: RoleSummary[];
  existing: ChatTurn[];
  ownerIds: string[];
}): Message | undefined {
  const { streamed, speakerName, messages, roomId, roles, existing, ownerIds } = input;
  if (!roomId || foldSpeechText(streamed).length === 0) {
    return undefined;
  }
  const ownerSet = new Set(ownerIds);
  const roleById = new Map(roles.map((role) => [role.id, role] as const));
  const { seenMessageIds } = existingRoleSpeechKeys(existing);
  for (const message of messages) {
    if (message.roomId !== roomId || seenMessageIds.has(message.id)) {
      continue;
    }
    const role = roleById.get(message.authorId);
    if (!role || ownerSet.has(message.authorId) || role.displayName !== speakerName) {
      continue;
    }
    if (isSameRoleSpeech(streamed, message.content)) {
      return message;
    }
  }
  return undefined;
}

/** Build the settled role-speech bubble for a posted (non-streamed) room message. */
export function roleSpeechPostedTurn(message: Message, speakerName: string): Omit<ChatTurn, "id"> {
  return {
    card: {
      detail: message.content,
      kind: "run-turn",
      speakerName,
      streaming: false,
      variant: "role-speech",
    },
    role: "system",
    sourceMessageId: message.id,
    text: "",
  };
}
