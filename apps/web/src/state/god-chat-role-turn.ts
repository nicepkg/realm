import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import type { ChatCard, ChatTurn, StagedWrite } from "@/state/god-chat-model.ts";
import {
  findPostedTwinForStream,
  roleSpeechPostedTurn,
  selectRoleMessagesToFold,
} from "@/state/god-chat-role-fold.ts";
import { classifyBackendError } from "@/state/god-chat-runtime.ts";

/**
 * God-chat ROLE-TURN streaming + lifecycle settle (F1) — split across this file and
 * `god-chat-role-fold.ts` to keep both under the 500-line budget. This owns the pure
 * brain that folds a role's `turn.delta` stream (and any posted role message) back
 * into the NL conversation as exactly ONE `role-speech` bubble, killing both the
 * delta+completed same-batch race (a dropped reply) and the double-bubble race (the
 * streamed bubble and its posted twin both rendered). The fuzzy dedup / message-fold
 * helpers live in `god-chat-role-fold.ts` and are re-exported below so existing
 * import sites keep working. Everything here is pure and deterministically
 * unit-testable; `god-chat-runtime.ts` re-exports it too.
 */

// Re-export the fold/dedup reconciliation surface so every existing import site that
// pulls these from `@/state/god-chat-role-turn.ts` keeps working unchanged.
export {
  findPostedTwinForStream,
  foldSpeechText,
  isSameRoleSpeech,
  type PendingRoleReplyClaim,
  roleSpeechPostedTurn,
  selectRoleMessagesToFold,
} from "@/state/god-chat-role-fold.ts";

/**
 * zh-CN feedback turn after a role turn is ACCEPTED by the backend (202). This is
 * an HONEST "回合已开始" status — NOT a fake success: the actual speech is folded
 * back into the conversation as a streaming `role` bubble by the hook's turn-event
 * effect, and a `turn.failed` later replaces this with a real failure card (F1).
 */
export function runTurnAcceptedFeedback(proposal: Extract<StagedWrite, { kind: "run-turn" }>): {
  text: string;
  card: ChatCard;
} {
  return {
    card: {
      detail: `已请「${proposal.roleName}」发言，回应稍后出现在下方。`,
      kind: "run-turn",
      title: "回合进行中",
      variant: "result",
    },
    text: `正在等「${proposal.roleName}」开口…`,
  };
}

/** A terminal turn event for the bound turn, or undefined while still running. */
export type TurnTerminal =
  | { kind: "completed" }
  | { kind: "failed"; reason: string | undefined }
  | { kind: "cancelled" };

/**
 * Find the terminal lifecycle event for `turnId` in the event log. Mirrors
 * `use-turn-actions.ts`' reconcile so the God-chat stream finalizes on exactly the
 * same authoritative signal. Returns undefined while the turn is still running.
 */
export function findTurnTerminal(
  events: RealmEvent[],
  turnId: string | undefined,
): TurnTerminal | undefined {
  if (!turnId) {
    return undefined;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    if (event.type === "turn.completed" && event.turn.id === turnId) {
      return { kind: "completed" };
    }
    if (event.type === "turn.cancelled" && event.turn.id === turnId) {
      return { kind: "cancelled" };
    }
    if (event.type === "turn.failed" && event.turn.id === turnId) {
      return { kind: "failed", reason: undefined };
    }
  }
  return undefined;
}

/**
 * zh-CN failure feedback for a role turn that the backend reported as failed
 * (F1 + F3). `reason` is the raw denial reason from the event log; it is mapped
 * to Chinese copy. `trustRelated` is surfaced so the hook can append the inline
 * trust-elevation CTA when a read-only project blocked the run.
 */
export function runTurnFailureFeedback(
  roleName: string,
  reason: string | undefined,
): { text: string; card: ChatCard; trustRelated: boolean } {
  const info = classifyBackendError(reason);
  return {
    card: {
      detail: `「${roleName}」未能发言：${info.text}`,
      kind: "run-turn",
      title: "回合失败",
      variant: "result",
    },
    text: `「${roleName}」这次没能开口：${info.text}`,
    trustRelated: info.trustRelated,
  };
}

/**
 * Build (or update) the streaming role-speech turn for an active role turn. The
 * speech is carried on a `role-speech` card (named speaker bubble) inside a
 * `system` turn so the existing OperatorMessage variant contract is untouched; the
 * hook keeps a single turn keyed by `streamingTurnId` and replaces the card's
 * detail as more `turn.delta` tokens land.
 */
export function roleSpeechStreamingTurn(
  turnId: string,
  speakerName: string,
  streamedText: string,
): Omit<ChatTurn, "id"> {
  return {
    card: {
      detail: streamedText,
      kind: "run-turn",
      speakerName,
      streaming: true,
      variant: "role-speech",
    },
    role: "system",
    streamingTurnId: turnId,
    text: "",
  };
}

/**
 * Resolve a TERMINAL role turn into the exact change the conversation needs — pure
 * so the race (`turn.delta` + `turn.completed` arriving in the SAME SSE-fed reload
 * batch) is settled deterministically and unit-tested without React.
 *
 * The completion RACE this kills: when both events land before the effect's first
 * run, the streaming branch is skipped (`bubbleTurnId` is still undefined) AND the
 * naive "finalize the streamed bubble" branch is skipped (it required a bubble),
 * so the reply was dropped from the NL transcript. Here, completion ALWAYS yields a
 * settled bubble:
 *  - `growBubble`  — a streaming bubble already exists: settle it in place.
 *  - `settleNew`   — no bubble yet but we have streamed text or a posted room
 *                    message: materialize exactly ONE settled role-speech bubble.
 *  - `fail`        — the turn failed: replace with an honest failure card.
 *  - `none`        — completed with nothing to show (already folded elsewhere):
 *                    drop the status turn without minting an empty bubble.
 * Every terminal outcome carries `statusTurnId` so the caller removes the leaked
 * "回合进行中" spinner in the same pass.
 */
export type SettleRunTurnInput = {
  events: RealmEvent[];
  turnId: string;
  roleName: string;
  bubbleTurnId: string | undefined;
  /** Streamed text accumulated from `turn.delta` (undefined when no token landed). */
  streamed: string | undefined;
  terminal: TurnTerminal;
  /** Already-rendered turns, used to dedupe a posted message against a streamed one. */
  existing: ChatTurn[];
  /** Selected-room context so a no-delta completion can recover the posted reply. */
  messages: Message[];
  roomId: string | undefined;
  roles: RoleSummary[];
  ownerIds: string[];
};

export type SettleRunTurnResult =
  | { kind: "growBubble"; bubbleTurnId: string; detail: string; sourceMessageId?: string }
  | { kind: "settleNew"; turn: Omit<ChatTurn, "id"> }
  | { kind: "fail"; card: ChatCard; text: string; trustRelated: boolean }
  | { kind: "none" };

export function settleRunTurn(input: SettleRunTurnResolve): SettleRunTurnResult {
  const { terminal } = input;
  if (terminal.kind === "failed") {
    const failure = runTurnFailureFeedback(input.roleName, terminal.reason ?? input.denialReason);
    return {
      card: failure.card,
      kind: "fail",
      text: failure.text,
      trustRelated: failure.trustRelated,
    };
  }
  // `cancelled` and `completed` both just settle the bubble (a cancel simply shows
  // whatever was said before stopping); neither should leave a spinner. Bind the
  // posted twin's id (when it has landed) so the posted-message effect skips it.
  if (input.bubbleTurnId && input.streamed !== undefined) {
    const twin = findPostedTwinForStream({
      existing: input.existing,
      messages: input.messages,
      ownerIds: input.ownerIds,
      roles: input.roles,
      roomId: input.roomId,
      speakerName: input.roleName,
      streamed: input.streamed,
    });
    return {
      bubbleTurnId: input.bubbleTurnId,
      detail: input.streamed,
      kind: "growBubble",
      sourceMessageId: twin?.id,
    };
  }
  // No live streamed bubble: materialize ONE settled bubble from the streamed text,
  // falling back to the posted room message `selectRoleMessagesToFold` would pick so
  // the trusted no-delta path still shows the reply (and is deduped to exactly one).
  if (input.streamed !== undefined && input.streamed.trim().length > 0) {
    // Bind the posted twin's message id (when it has already landed) so the
    // posted-message effect's `seenMessageIds` dedup hits this bubble and never
    // appends a second copy — the double-bubble root cause.
    const twin = findPostedTwinForStream({
      existing: input.existing,
      messages: input.messages,
      ownerIds: input.ownerIds,
      roles: input.roles,
      roomId: input.roomId,
      speakerName: input.roleName,
      streamed: input.streamed,
    });
    return {
      kind: "settleNew",
      turn: roleSpeechSettledTurn(input.turnId, input.roleName, input.streamed, twin?.id),
    };
  }
  const posted = selectRoleMessagesToFold({
    existing: input.existing,
    messages: input.messages,
    ownerIds: input.ownerIds,
    roles: input.roles,
    roomId: input.roomId,
  })[0];
  if (posted) {
    return { kind: "settleNew", turn: roleSpeechPostedTurn(posted.message, posted.speakerName) };
  }
  // Completed with nothing left to render here (already folded, or an empty reply):
  // drop the status turn rather than minting an empty bubble.
  return { kind: "none" };
}

/** Resolved input for `settleRunTurn` (terminal + a recovered denial reason). */
type SettleRunTurnResolve = Omit<SettleRunTurnInput, "streamed"> & {
  streamed: string | undefined;
  denialReason: string | undefined;
};

/**
 * A settled (non-streaming) role-speech turn keyed by the backend turn id — the
 * materialized bubble for a completion that never grew a streaming bubble (the
 * delta+completed same-batch race). Mirrors `roleSpeechStreamingTurn` but settled.
 *
 * When the posted twin of this streamed reply has already landed, its id is bound
 * as `sourceMessageId` so the posted-message effect's dedup skips it (preventing a
 * second identical bubble). `streamingTurnId` is always kept so the posted-message
 * effect also recognizes this bubble as owning that run turn's reply.
 */
export function roleSpeechSettledTurn(
  turnId: string,
  speakerName: string,
  detail: string,
  sourceMessageId?: string,
): Omit<ChatTurn, "id"> {
  return {
    card: { detail, kind: "run-turn", speakerName, streaming: false, variant: "role-speech" },
    role: "system",
    sourceMessageId,
    streamingTurnId: turnId,
    text: "",
  };
}
