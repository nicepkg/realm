import type { Message, RoleSummary } from "@realm/api-contract";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import {
  existingRoleSpeechFingerprints,
  isSameRoleSpeech,
  type PendingRoleReplyClaim,
  roleSpeechFingerprint,
  roleSpeechPostedTurn,
  type SettleRunTurnResult,
  selectRoleMessagesToFold,
} from "@/state/god-chat-role-turn.ts";

/**
 * Reload triple-render dedup gate (F1, P1) — split out of `god-chat-role-turn.ts` to
 * keep that file under the 500-line budget. These two PURE helpers turn the in-render
 * `existing`-snapshot dedup into a cross-render, id-authoritative gate so a single
 * backend role message folds AT MOST ONCE for a component's lifetime, even through the
 * hydration re-render storm that re-folded it 2-3×.
 */

/**
 * Authoritative cross-render dedup gate for the posted-fold effect.
 *
 * `selectRoleMessagesToFold` dedupes against the in-render `existing` ChatTurn
 * snapshot (sourceMessageId Set + fuzzy text). That snapshot is correct WITHIN one
 * render, but on hydration `events`/`messages`/`turns` settle across several rapid
 * successive re-renders: the fold effect re-runs each time and reads a STALE `turns`
 * snapshot that does NOT yet contain the bubble its own prior pass appended (setTurns
 * is async — the snapshot used to decide predates the commit). So the same backend
 * `message.id` keeps passing the "not already represented" check and gets appended
 * 2-3 times (once correctly in slot, twice re-appended at the bottom).
 *
 * The PRIMARY gate (round-6): a CONTENT-FINGERPRINT (`speaker::foldedText`) Set —
 * `selectRoleMessagesToFold` already vetoes against the in-render `existing` snapshot's
 * fingerprints, and here we ALSO veto against the cross-render fingerprint set the
 * caller carries (every already-rendered bubble's fingerprint, refreshed each render).
 * Because the fingerprint is decoupled from backend message id, room id, and world-load
 * timing, a posted message matching an already-rendered bubble can never re-fold even
 * when its persisted twin settled id-LESS (the reload accumulation loop). `foldedIds`
 * (backend message ids) is kept as an ACCELERATION bypass — a fast id-exact veto for the
 * common case where the bubble bound an id.
 *
 * The caller registers `idsToRegister` AND `fingerprintsToRegister` into its refs
 * SYNCHRONOUSLY in the same tick (not via state), so the decision is independent of
 * `turns` settle timing.
 *
 * Pure + idempotent: re-running with the same `foldedIds` / `foldedFingerprints` (which
 * the caller grows in place) yields an empty `folds` on every pass after the first.
 */
export function selectFoldsWithIdGate(input: {
  messages: Message[];
  roomId: string | undefined;
  roles: RoleSummary[];
  existing: ChatTurn[];
  ownerIds: string[];
  pendingReply?: PendingRoleReplyClaim;
  /** Backend message ids the component has already folded (the acceleration bypass). */
  foldedIds: ReadonlySet<string>;
  /**
   * The AUTHORITATIVE cross-render gate: `speaker::foldedText` fingerprints of every
   * bubble the component has already rendered. Optional so existing call sites that
   * only pass `foldedIds` keep working (the in-render `existing` fingerprint veto in
   * `selectRoleMessagesToFold` still applies); the hook threads a ref-backed set so a
   * re-delivered posted message is vetoed by content even across the hydration storm.
   */
  foldedFingerprints?: ReadonlySet<string>;
}): {
  folds: { message: Message; speakerName: string }[];
  idsToRegister: string[];
  fingerprintsToRegister: string[];
} {
  const { foldedIds, foldedFingerprints, ...selectInput } = input;
  const roleById = new Map(selectInput.roles.map((role) => [role.id, role] as const));
  const candidates = selectRoleMessagesToFold(selectInput);
  const folds = candidates.filter((entry) => {
    if (foldedIds.has(entry.message.id)) {
      return false;
    }
    if (foldedFingerprints) {
      const role = roleById.get(entry.message.authorId);
      const speaker = role?.displayName ?? entry.speakerName;
      if (foldedFingerprints.has(roleSpeechFingerprint(speaker, entry.message.content))) {
        return false;
      }
    }
    return true;
  });
  return {
    fingerprintsToRegister: folds.map((entry) =>
      roleSpeechFingerprint(entry.speakerName, entry.message.content),
    ),
    folds,
    idsToRegister: folds.map((entry) => entry.message.id),
  };
}

/**
 * Seed the cross-render fold gate from the ALREADY-HYDRATED transcript (the reload
 * double-bubble root cause).
 *
 * On mount/reload the `foldedIdsRef` ref starts EMPTY, while persistence has already
 * loaded `turns` with the settled role-speech bubble bound to its backend message id.
 * The posted-fold effect then re-folds that same backend message from fresh
 * `scopedMessages`, because the empty id-gate can't dedup by id and the fuzzy-text
 * backstop can miss (a bubble that settled id-less, its posted twin landing after the
 * stream completed live). Seeding the gate from every `sourceMessageId` the hydrated
 * transcript carries means a persisted bubble's bound id immediately blocks the
 * backend re-fold across the hydration re-render storm.
 *
 * Pure: collects the `sourceMessageId` off every role-speech turn that persisted one
 * (`roleSpeechPostedTurn`/`roleSpeechSettledTurn` both write this field). De-duped.
 */
export function seedFoldedIdsFromTurns(turns: ChatTurn[]): string[] {
  const ids = new Set<string>();
  for (const turn of turns) {
    if (turn.sourceMessageId) {
      ids.add(turn.sourceMessageId);
    }
  }
  return [...ids];
}

/**
 * Seed the AUTHORITATIVE content-fingerprint gate from the hydrated transcript
 * (round-6). The `speaker::foldedText` fingerprint of every persisted role-speech
 * bubble — id-bound OR id-less — blocks its posted twin from re-folding, decoupled
 * from id/room/world timing. This is the structural fix for the reload accumulation
 * loop: an id-less persisted bubble (its twin landed after the live stream finished)
 * carries no `sourceMessageId` for `seedFoldedIdsFromTurns`, but its content
 * fingerprint always vetoes the re-fold. Pure: just reads `existingRoleSpeechFingerprints`.
 */
export function seedFoldedFingerprintsFromTurns(turns: ChatTurn[]): string[] {
  return [...existingRoleSpeechFingerprints(turns)];
}

/**
 * Self-heal the cross-render fingerprint gate from the CURRENT transcript — the
 * fingerprint analogue of `mergeBoundIdsFromTurns`. On reload the lazy/scope seed can
 * snapshot `turns` too early (before persistence swaps in the saved transcript), so we
 * re-merge every rendered bubble's fingerprint on EVERY render: the instant a hydrated
 * bubble lands, its content fingerprint is in the gate BEFORE the posted-fold effect
 * runs, vetoing the re-fold regardless of whether the bubble bound an id. Monotonic +
 * safe: it only ever ADDS fingerprints of bubbles ALREADY rendered, so it can never
 * block a genuinely new utterance. Returns true when at least one new fingerprint was
 * added (caller diagnostics).
 */
export function mergeFingerprintsFromTurns(gate: Set<string>, turns: ChatTurn[]): boolean {
  let added = false;
  for (const fingerprint of existingRoleSpeechFingerprints(turns)) {
    if (!gate.has(fingerprint)) {
      gate.add(fingerprint);
      added = true;
    }
  }
  return added;
}

/**
 * The backend `message.id` a settle outcome BINDS to its rendered bubble, or
 * undefined when it bound none (a `fail`/`none`, or a stream that settled before its
 * posted twin landed). The hook feeds this into the same folded-id ref so a bubble
 * materialized by the active-run-turn settle is never re-folded by the posted-fold
 * effect on a later hydration re-render — closing the reload triple-render even for
 * the stream-settled path. Pure: just reads the id off the settle shape.
 */
export function settleBoundMessageId(settle: SettleRunTurnResult): string | undefined {
  if (settle.kind === "growBubble") {
    return settle.sourceMessageId;
  }
  if (settle.kind === "settleNew") {
    return settle.turn.sourceMessageId;
  }
  return undefined;
}

/**
 * Reconcile every id-LESS persisted role-speech turn against the backend messages —
 * the reload DOUBLE-bubble root cause (round-5 regression).
 *
 * A live-streamed reply settles via `growBubble`/`settleNew` and binds its posted
 * twin's `sourceMessageId` ONLY when that twin has already landed. When the twin posts
 * AFTER the stream settled, the bubble persists to localStorage with
 * `sourceMessageId === undefined`. On reload `seedFoldedIdsFromTurns` collects NO id
 * for it, so the id-gate is blind to it and the posted-fold effect's only remaining
 * defense is the fuzzy-text backstop in `selectRoleMessagesToFold` — which MISSES
 * whenever the persisted streamed text and the backend `message.content` diverge
 * (a dropped final token, re-punctuation), re-folding the message at the transcript
 * TAIL → two bubbles for one backend message.
 *
 * This closes that path at hydration: for each id-less role-speech turn, find its
 * posted backend message (same room, authored by the role whose displayName matches
 * the bubble's `speakerName`, fuzzy-equal text) and BIND that message.id onto the
 * turn's `sourceMessageId`. The hook then seeds those bound ids into `foldedIdsRef`
 * BEFORE the posted-fold effect runs, making the id-gate authoritative even for the
 * post-settle-twin path. Each backend message is claimed by AT MOST one bubble.
 *
 * Pure: returns a fresh `turns` array (the bound turns rewritten, others identity-kept)
 * plus the bound message ids. Returns `changed: false` + the original array reference
 * when nothing matched, so the caller can skip a needless `setTurns`.
 */
export function reconcileIdLessSpeechTurns(input: {
  turns: ChatTurn[];
  messages: Message[];
  roles: RoleSummary[];
  ownerIds: string[];
  roomId: string | undefined;
}): { turns: ChatTurn[]; boundIds: string[]; changed: boolean } {
  const { turns, messages, roles, ownerIds, roomId } = input;
  if (!roomId) {
    return { boundIds: [], changed: false, turns };
  }
  const roleById = new Map(roles.map((role) => [role.id, role] as const));
  const ownerSet = new Set(ownerIds);
  // Ids already bound somewhere in the transcript must never be re-claimed by an
  // id-less bubble — a backend message belongs to exactly one rendered bubble.
  const claimedIds = new Set<string>(
    turns.map((turn) => turn.sourceMessageId).filter((id): id is string => Boolean(id)),
  );
  const boundIds: string[] = [];
  let changed = false;
  const next = turns.map((turn) => {
    const card = turn.card;
    if (card?.variant !== "role-speech" || turn.sourceMessageId) {
      return turn;
    }
    const twin = messages.find((message) => {
      if (message.roomId !== roomId || claimedIds.has(message.id)) {
        return false;
      }
      const role = roleById.get(message.authorId);
      if (!role || ownerSet.has(message.authorId)) {
        return false;
      }
      return (
        role.displayName === card.speakerName && isSameRoleSpeech(card.detail, message.content)
      );
    });
    if (!twin) {
      return turn;
    }
    claimedIds.add(twin.id);
    boundIds.push(twin.id);
    changed = true;
    return { ...turn, sourceMessageId: twin.id };
  });
  return changed ? { boundIds, changed, turns: next } : { boundIds: [], changed: false, turns };
}

/**
 * Union every bound `sourceMessageId` currently in `turns` into the cross-render fold
 * gate — the reload double-bubble fix for an ID-BOUND persisted bubble.
 *
 * The lazy `useRef` seed + the scope-change re-seed both snapshot `turns` at a single
 * instant. On reload that instant is too EARLY: the world id resolves async, so on the
 * `worldId`-flip render the scope-change re-seed reads a STILL-EMPTY `turns` (the
 * persistence scope-load effect that swaps in the saved transcript runs AFTER that
 * render commits). A render later the bound bubble lands in `turns`, but the gate was
 * already sealed empty — so the posted-fold effect re-folds that persisted bubble's
 * backend message into a SECOND bubble (both end up bound to the same message id).
 *
 * This makes the seed SELF-HEALING: on every render we merge the current transcript's
 * bound ids into the gate, so the moment the hydrated bubble lands its id is in the
 * gate BEFORE the posted-fold effect runs. Monotonic + safe: it only ever ADDS ids of
 * bubbles ALREADY rendered in `turns`, so it can only suppress a re-fold of a message
 * already represented — never block a genuinely new message (whose id is not yet in
 * `turns`). Returns true when at least one new id was added (for caller diagnostics).
 */
export function mergeBoundIdsFromTurns(gate: Set<string>, turns: ChatTurn[]): boolean {
  let added = false;
  for (const turn of turns) {
    if (turn.sourceMessageId && !gate.has(turn.sourceMessageId)) {
      gate.add(turn.sourceMessageId);
      added = true;
    }
  }
  return added;
}

/**
 * Does the hydrated transcript still hold an id-LESS role-speech bubble that
 * `reconcileIdLessSpeechTurns` has NOT yet bound to a backend message? — the gating
 * decision for the reload double-bubble fix.
 *
 * On reload `app.state.messages`/`events` hydrate a render or two AFTER the transcript
 * (`turns`) is restored. If the reconcile effect marks its once-per-scope guard done on
 * that first stable render — when `scopedMessages` is still empty so nothing could
 * match — then by the time the backend message finally lands a render later, the effect
 * early-returns and the id-less bubble is NEVER bound. The posted-fold effect (which has
 * no once-per-scope guard) then folds a SECOND bubble at the tail when its fuzzy-text
 * backstop misses (a diverging trailing token).
 *
 * So the hook must DEFER marking the scope reconciled while the messages have not yet
 * arrived AND there is still un-bound id-less role speech to settle the gate against.
 * This pure predicate makes that decision unit-testable: it is `true` exactly when at
 * least one role-speech turn carries no `sourceMessageId` (its posted twin had not
 * landed at settle time, so it persisted id-less). When it is `false` — every bubble
 * already bound, or none is id-less role speech — the reconcile has no work to wait for,
 * so the gate may be marked on the first pass (the common live path and the genuinely
 * empty world both run exactly once and never re-walk).
 */
export function hasUnboundIdLessSpeech(turns: ChatTurn[]): boolean {
  return turns.some((turn) => turn.card?.variant === "role-speech" && !turn.sourceMessageId);
}

/**
 * Build the freshly-folded role-speech turns for `folds`, inserted into the existing
 * transcript by each message's ORIGINAL `createdAt` rather than blindly appended at
 * the tail (the reload regression pushed a re-fold to the very bottom even though its
 * message predates later turns).
 *
 * Chronological slotting: each existing turn that carries a `sourceMessageId` is
 * mapped back to its message's `createdAt` (via the `messages` log), giving a sparse
 * ordered spine of timestamps. A new fold is placed AFTER the last existing turn whose
 * source message is not newer than it, so a re-delivered older message lands in its
 * slot, not at the end. Turns without a known timestamp (operator/system prose, or a
 * bubble whose source message has aged out of the log) are SKIPPED as comparison
 * points but never crossed past a newer-stamped turn, so prior conversation structure
 * is preserved. Multiple new folds keep their own message-order among themselves.
 *
 * When NO existing turn carries a resolvable timestamp the behavior degrades to a
 * stable oldest-first tail append — identical to the prior `[...current, ...folds]`
 * for the common single-fold case, so the live path is never regressed.
 *
 * Pure. `mintId` mints each new turn's stable id (the hook's monotonic source).
 */
export function insertFoldsByTimestamp(input: {
  existing: ChatTurn[];
  folds: { message: Message; speakerName: string }[];
  messages: Message[];
  mintId: () => string;
}): ChatTurn[] {
  const { existing, folds, messages, mintId } = input;
  if (folds.length === 0) {
    return existing;
  }
  const createdAtByMessageId = new Map(
    messages.map((message) => [message.id, message.createdAt] as const),
  );
  // The known `createdAt` of an existing turn, or undefined when it carries none
  // (operator/system prose) or its source message has aged out of the log.
  const turnTimestamp = (turn: ChatTurn): string | undefined =>
    turn.sourceMessageId ? createdAtByMessageId.get(turn.sourceMessageId) : undefined;
  // Slot the new folds oldest-first so they keep stable chronological order.
  const ordered = [...folds].sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt));
  let result = [...existing];
  for (const entry of ordered) {
    const turn: ChatTurn = {
      ...roleSpeechPostedTurn(entry.message, entry.speakerName),
      id: mintId(),
    };
    // Insert AFTER the last existing turn whose source message is not newer than this
    // one; if none qualifies (or no timestamps are known) fall back to the tail.
    let insertAt = result.length;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const ts = turnTimestamp(result[index] as ChatTurn);
      if (ts === undefined) {
        continue;
      }
      if (ts.localeCompare(entry.message.createdAt) <= 0) {
        insertAt = index + 1;
        break;
      }
      insertAt = index;
    }
    result = [...result.slice(0, insertAt), turn, ...result.slice(insertAt)];
  }
  return result;
}
