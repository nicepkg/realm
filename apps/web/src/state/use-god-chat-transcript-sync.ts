import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef } from "react";
// The authoritative folded-id gate lives in its own co-located helper so this effect
// owns the reload-dedup concern without widening the runtime API or its budget.
import {
  hasUnboundIdLessSpeech,
  insertFoldsByTimestamp,
  reconcileIdLessSpeechTurns,
  selectFoldsWithIdGate,
  settleBoundMessageId,
} from "@/state/god-chat-fold-id-gate.ts";
import {
  type ChatTurn,
  findTurnTerminal,
  type PendingProposal,
  previewCard,
  previewIntroText,
  roleSpeechStreamingTurn,
  settleRunTurn,
} from "@/state/god-chat-model.ts";
// The content-fingerprint dedup key (round-6) — the AUTHORITATIVE role-speech dedup,
// decoupled from id/room/world timing. Imported from the owned role-turn module
// (which re-exports it) so the hook registers a just-settled bubble's fingerprint into
// the same cross-render gate the posted-fold effect vetoes against.
import { roleSpeechFingerprint } from "@/state/god-chat-role-turn.ts";
import { accumulateStreamedText, latestDenialReason } from "@/state/realm-app-state-model.ts";
import { seedAndHealFoldGates } from "@/state/use-god-chat-fold-gates.ts";
// Reuse the SAME scope-key derivation persistence uses so the sync hook's
// scope-change detection stays in lockstep with the transcript reload it must not race.
import { transcriptScopeKey } from "@/state/use-god-chat-helpers.ts";

/**
 * Transcript-sync effects for the God-chat brain (F1) — split out of
 * `use-god-chat.ts` so that file stays under the 500-line budget. This owns the two
 * SSE-fed effects that fold in-world role speech into the NL conversation:
 *
 *  1. The ACTIVE run-turn lifecycle: while running, `turn.delta` grows one role
 *     bubble in place; on TERMINAL, the pure `settleRunTurn` helper decides the
 *     single settled bubble (or failure card) and the leaked "回合进行中" status
 *     spinner is removed in the same pass. This kills the delta+completed
 *     same-batch race that previously dropped the reply.
 *  2. Posted room messages: a role's line that posted to the selected room (the
 *     trusted no-stream path) is folded in as a settled bubble, deduped against
 *     anything already rendered AND against a ref-backed Set of already-folded
 *     backend message ids — the authoritative gate that survives the hydration
 *     re-render storm (the reload triple-render P1: a single backend reply otherwise
 *     re-folded 2-3× because the in-render `turns` snapshot lags its own appends).
 *
 * It is a thin React orchestrator over the pure runtime helpers; all decisions
 * live in `god-chat-runtime.ts` so the contract is unit-tested without React.
 */

/** The active role turn being streamed back into the conversation. */
export type ActiveRunTurn = {
  turnId: string;
  roleName: string;
  /** The chat turn id of the streaming `role` bubble, once the first token lands. */
  bubbleTurnId?: string;
  /** The original run-turn proposal, kept for a one-tap elevate-and-retry on failure. */
  proposal: PendingProposal;
};

export type TranscriptSyncInput = {
  /** SSE-fed event log + selected-room context shared by both effects. */
  events: RealmEvent[];
  messages: Message[];
  roles: RoleSummary[];
  selectedRoomId: string | undefined;
  identity: string;
  /**
   * The active world's id (F2). The sync hook keys its cross-render fold gate to the
   * (worldId, identity) scope: when the scope changes — e.g. an NL world-switch —
   * persistence has already reloaded `turns` to the destination's saved transcript,
   * but `app.state.messages`/`events` still describe the DEPARTING world for one
   * transitional render. The hook resets the fold gate and skips its fold/settle
   * effects that render so the prior world's stale role speech can never bleed into
   * the just-reloaded (often empty) destination transcript.
   */
  worldId: string | undefined;
  /** Current rendered transcript + its state setter. */
  turns: ChatTurn[];
  setTurns: Dispatch<SetStateAction<ChatTurn[]>>;
  /** The active run-turn handle + its setter (cleared on terminal). */
  activeRunTurn: ActiveRunTurn | undefined;
  setActiveRunTurn: Dispatch<SetStateAction<ActiveRunTurn | undefined>>;
  /** Append a turn (used for failure cards + the trust recovery card). */
  pushTurn: (turn: Omit<ChatTurn, "id">) => void;
  /** Stage a fresh pending proposal (the failure-path trust recovery card). */
  setPendingProposal: Dispatch<SetStateAction<PendingProposal | undefined>>;
  /** Mint a fresh chat-turn id (shared monotonic source with the hook). */
  nextTurnId: () => string;
};

export function useGodChatTranscriptSync(input: TranscriptSyncInput): void {
  const {
    events,
    messages,
    roles,
    selectedRoomId,
    identity,
    turns,
    setTurns,
    activeRunTurn,
    setActiveRunTurn,
    pushTurn,
    setPendingProposal,
    nextTurnId,
    worldId,
  } = input;

  // F2 — the (worldId, identity) scope this hook last folded against. When it
  // changes (an NL world-switch), persistence has already replaced `turns` with the
  // destination's saved transcript, but `messages`/`events` still reflect the
  // DEPARTING world for one transitional render. We detect that change SYNCHRONOUSLY
  // during render — not in an effect — so the same render's fold/settle effects can
  // read `scopeChanged` and bail, instead of folding the prior world's stale role
  // speech into the just-reloaded destination transcript. `useRef` here mirrors the
  // persistence hook's `scopeRef`, keeping the two reload-coupled hooks in lockstep.
  const prevWorldScopeRef = useRef<string>(transcriptScopeKey(worldId, identity));
  const currentScope = transcriptScopeKey(worldId, identity);
  const scopeChanged = prevWorldScopeRef.current !== currentScope;
  // The (worldId, identity) scope the id-less reload reconciliation last ran for. The
  // reconcile effect below binds a persisted id-LESS role bubble to its posted twin
  // exactly ONCE per scope (mount + each world-switch), so a re-render storm does not
  // re-walk the transcript. `null` until the first reconcile lands for a scope.
  const reconciledScopeRef = useRef<string | null>(null);
  if (scopeChanged) {
    // A new scope must reconcile afresh: clear the marker so the effect re-binds the
    // destination world's own id-less bubbles (and never reuses the departing scope's).
    reconciledScopeRef.current = null;
  }
  if (scopeChanged) {
    prevWorldScopeRef.current = currentScope;
    // Drop any in-flight run-turn — it could only have been started under the departing
    // world (a switch and a fresh run-turn cannot co-occur in one render), so settling
    // it now would leak the departing world's role bubble into the new world.
    // Persistence owns `turns`; we only clear the leaking active handle. (The two fold
    // gates are re-seeded for the destination scope inside `useGodChatFoldGates`.)
    setActiveRunTurn((prev) => (prev ? undefined : prev));
  }

  // The two AUTHORITATIVE cross-render dedup gates. `foldedIdsRef` is the ACCELERATION
  // bypass (id-exact veto); `foldedFingerprintsRef` is the PRIMARY content-fingerprint
  // gate (round-6) — decoupled from id/room/world timing so a posted message matching
  // any rendered bubble can never re-fold, even when its persisted twin settled id-LESS
  // (the freshly-created NL world reload accumulation loop). The refs are declared here
  // (so React lint sees `.current` as stable) and seeded / per-scope re-seeded / per-
  // render self-healed by the co-located helper. See `use-god-chat-fold-gates.ts`.
  const foldedIdsRef = useRef<Set<string>>(undefined as unknown as Set<string>);
  const foldedFingerprintsRef = useRef<Set<string>>(undefined as unknown as Set<string>);
  seedAndHealFoldGates({
    identity,
    refs: { foldedFingerprintsRef, foldedIdsRef },
    scopeChanged,
    turns,
    worldId,
  });

  // F2 (authoritative anti-bleed) — fold ONLY messages that belong to the active
  // world. After an NL world-switch `worldId` flips immediately, but the controller
  // reloads `app.state.messages`/`events` ASYNCHRONOUSLY (an awaited `loadRealm`), so
  // for SEVERAL transitional renders `messages` still describes the DEPARTING world
  // while `turns` already hold the destination's reloaded transcript. The single
  // scope-change bail above only covers the FIRST such render; this filter closes the
  // remaining window race-proof: every `Message` carries its own `worldId`, so a
  // departing-world line is structurally excluded from the fold candidates no matter
  // how many renders the reload spans. When `worldId` is undefined (manager view, no
  // world selected) there is nothing to fold against, so the scoped list is empty.
  const scopedMessages = useMemo<Message[]>(
    () => (worldId ? messages.filter((message) => message.worldId === worldId) : []),
    [messages, worldId],
  );

  // Drop the live "回合进行中" status card bound to `turnId` — shared by terminal
  // branches so the spinner is always cleared in the same pass.
  const removeStatusTurn = useCallback(
    (turnId: string) => {
      setTurns((current) => current.filter((turn) => turn.statusTurnId !== turnId));
    },
    [setTurns],
  );

  // Reload id-less reconciliation (reload DOUBLE-bubble, round-5 regression). Declared
  // FIRST so it runs BEFORE the posted-fold effect in the same commit: a persisted
  // role-speech bubble that settled id-LESS (its posted twin landed after the live
  // stream finished) carries `sourceMessageId === undefined`, so the mount/scope seed
  // collected NO id for it and the id-gate is blind to it. Here we match it to its
  // posted backend message (speaker + the fuzzy `isSameRoleSpeech`), BIND that id onto
  // the persisted turn in place AND seed it into `foldedIdsRef` — making the id-gate
  // authoritative for the post-settle-twin path too, so the posted-fold effect below
  // can no longer re-fold it to the tail. Runs once per scope (the ref guard); the
  // worldId-scoped `scopedMessages` keeps it from binding a departing world's line.
  useEffect(() => {
    if (scopeChanged) {
      // The scope just flipped; persistence is still settling `turns`/`messages` for
      // the destination. Reconcile on the NEXT, stable render for this scope.
      return;
    }
    if (reconciledScopeRef.current === currentScope) {
      return;
    }
    const result = reconcileIdLessSpeechTurns({
      messages: scopedMessages,
      ownerIds: ["owner", identity],
      roles,
      roomId: selectedRoomId,
      turns,
    });
    // Mark the scope reconciled — but ONLY once reconcile has had a FAIR chance to run
    // (the reload double-bubble guard). On reload `scopedMessages` hydrates a render or
    // two AFTER `turns`, so on the first stable render the messages are still empty: if
    // we burned the once-per-scope guard here, the id-less bubble whose backend message
    // lands a render later would NEVER be bound, and the un-guarded posted-fold effect
    // would stack a second bubble at the tail. So while messages are absent AND an
    // un-bound id-less role-speech bubble is still waiting for its twin, DEFER marking —
    // letting the next render re-run reconcile once the message arrives. When messages
    // are present, or there is nothing id-less left to bind, mark as before so the
    // common live path and the genuinely-empty world run exactly once and never re-walk.
    const deferMark = scopedMessages.length === 0 && hasUnboundIdLessSpeech(turns);
    if (!deferMark) {
      reconciledScopeRef.current = currentScope;
    }
    if (!result.changed) {
      return;
    }
    // A successful bind settles the gate for this scope regardless of the defer guard —
    // the work is done, so a later render must not re-walk and re-bind.
    reconciledScopeRef.current = currentScope;
    // Seed the bound ids into the AUTHORITATIVE gate synchronously this tick, BEFORE
    // the posted-fold effect runs in this same commit — so the re-delivered backend
    // message is vetoed by id even though `turns` has not yet committed the rewrite.
    for (const id of result.boundIds) {
      foldedIdsRef.current.add(id);
    }
    // Persist the in-place id binding so a SUBSEQUENT reload seeds the gate by id (no
    // reconcile needed) — the bubble is now a normal bound bubble.
    setTurns(() => result.turns);
  }, [
    scopeChanged,
    currentScope,
    scopedMessages,
    roles,
    selectedRoomId,
    identity,
    turns,
    setTurns,
  ]);

  // F1 — active run-turn lifecycle.
  useEffect(() => {
    // F2 — secondary hygiene bail on the transitional render where the scope just
    // flipped: the scope-change block above already cleared `activeRunTurn` and reset
    // the fold gate, so there is nothing to settle this render. (The race-proof
    // anti-bleed is the `scopedMessages` worldId filter below; this bail just avoids
    // a wasted pass against the freshly-reset state.)
    if (scopeChanged) {
      return;
    }
    if (!activeRunTurn) {
      return;
    }
    const { turnId, roleName, bubbleTurnId, proposal } = activeRunTurn;
    const terminal = findTurnTerminal(events, turnId);
    const streamed = accumulateStreamedText(events, turnId);

    // While running: fold the live deltas into one growing `role` bubble; the status
    // card is dropped the moment the first token lands (the bubble replaces it).
    if (!terminal) {
      if (streamed === undefined) {
        return;
      }
      if (bubbleTurnId) {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === bubbleTurnId && turn.card?.variant === "role-speech"
              ? { ...turn, card: { ...turn.card, detail: streamed } }
              : turn,
          ),
        );
        return;
      }
      const id = nextTurnId();
      setTurns((current) => [
        ...current.filter((turn) => turn.statusTurnId !== turnId),
        { ...roleSpeechStreamingTurn(turnId, roleName, streamed), id },
      ]);
      setActiveRunTurn((prev) =>
        prev && prev.turnId === turnId ? { ...prev, bubbleTurnId: id } : prev,
      );
      return;
    }

    // Terminal — settle deterministically (kills the delta+completed same-batch race).
    const settle = settleRunTurn({
      bubbleTurnId,
      denialReason: latestDenialReason(events),
      events,
      existing: turns,
      // Active-world messages only: a no-delta completion recovers its reply from a
      // posted room message, which must never resolve to a DEPARTING world's line
      // while the reload is still in flight (F2).
      messages: scopedMessages,
      ownerIds: ["owner", identity],
      roleName,
      roles,
      roomId: selectedRoomId,
      streamed,
      terminal,
      turnId,
    });
    // Register the posted twin this settle bound (when any) into the SAME fold gate,
    // synchronously this tick — so a stream-settled bubble's posted message is never
    // re-folded by the posted-fold effect on a later hydration re-render.
    const boundId = settleBoundMessageId(settle);
    if (boundId) {
      foldedIdsRef.current.add(boundId);
    }
    // Register the just-settled bubble's CONTENT FINGERPRINT into the authoritative gate
    // this same tick (round-6) — so the posted-fold effect, which reads the same
    // pre-commit `turns` snapshot, vetoes this reply's posted twin by content even
    // before the settled bubble lands in `turns`. Decoupled from id/room timing, so a
    // freshly-created NL world (roomId undefined at settle) is covered too.
    const settledDetail =
      settle.kind === "growBubble"
        ? settle.detail
        : settle.kind === "settleNew" && settle.turn.card?.variant === "role-speech"
          ? settle.turn.card.detail
          : undefined;
    if (settledDetail !== undefined) {
      foldedFingerprintsRef.current.add(roleSpeechFingerprint(roleName, settledDetail));
    }
    if (settle.kind === "growBubble") {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === settle.bubbleTurnId && turn.card?.variant === "role-speech"
            ? {
                ...turn,
                card: { ...turn.card, detail: settle.detail, streaming: false },
                // Keep `streamingTurnId` so the posted-message effect still
                // recognizes this bubble as owning the run turn's reply, and bind
                // the posted twin's id (when it landed) so id-level dedup also hits.
                sourceMessageId: settle.sourceMessageId ?? turn.sourceMessageId,
              }
            : turn,
        ),
      );
    } else if (settle.kind === "settleNew") {
      // No live bubble (the same-batch race or a no-delta posted reply): replace the
      // status card with the single materialized settled bubble.
      const id = nextTurnId();
      setTurns((current) => [
        ...current.filter((turn) => turn.statusTurnId !== turnId),
        { ...settle.turn, id },
      ]);
    } else if (settle.kind === "fail") {
      removeStatusTurn(turnId);
      pushTurn({ card: settle.card, role: "system", text: settle.text });
      if (settle.trustRelated) {
        // Read-only blocked the run — offer a one-tap elevate that re-runs this exact
        // turn after lifting trust (F2 fallback for the async path).
        const trustRetry: PendingProposal = { kind: "trust", retry: proposal };
        setPendingProposal(trustRetry);
        pushTurn({
          card: previewCard(trustRetry),
          role: "system",
          text: previewIntroText(trustRetry),
        });
      }
    } else {
      removeStatusTurn(turnId);
    }
    setActiveRunTurn(undefined);
  }, [
    scopeChanged,
    activeRunTurn,
    events,
    scopedMessages,
    roles,
    selectedRoomId,
    identity,
    turns,
    setTurns,
    setActiveRunTurn,
    setPendingProposal,
    pushTurn,
    removeStatusTurn,
    nextTurnId,
  ]);

  // F1 — fold posted role messages from the selected room into the transcript.
  useEffect(() => {
    // F2 — secondary hygiene bail on the scope-flip render (the fold gate was just
    // reset above, nothing to do this pass). The race-proof anti-bleed across the
    // whole async-reload window is the `scopedMessages` worldId filter below: the
    // departing world's posted role lines (顾辰风 / 雷军) are filtered out as fold
    // candidates until `loadRealm` lands the destination world's own messages.
    if (scopeChanged) {
      return;
    }
    // When an active run-turn is mid-settle this render, its just-settled bubble is
    // not yet committed to `turns` (both effects read the same snapshot), so the
    // fold would re-render its posted twin → two identical bubbles. Hand that one
    // message to `selectRoleMessagesToFold` as a pending claim so the SETTLE effect
    // owns it uniquely. Only claim once the turn is TERMINAL — while still streaming,
    // the active effect grows its bubble in place and posts haven't been authored.
    const pendingReply =
      activeRunTurn && findTurnTerminal(events, activeRunTurn.turnId)
        ? {
            speakerName: activeRunTurn.roleName,
            streamed: accumulateStreamedText(events, activeRunTurn.turnId),
          }
        : undefined;
    // `selectFoldsWithIdGate` keeps the existing `existing`/text dedup as a secondary
    // guard but makes the ref's id Set the AUTHORITATIVE gate: any message whose id is
    // already folded is dropped regardless of the (possibly stale) `turns` snapshot.
    const { folds, idsToRegister, fingerprintsToRegister } = selectFoldsWithIdGate({
      existing: turns,
      foldedIds: foldedIdsRef.current,
      // The AUTHORITATIVE cross-render gate (round-6): a posted message matching any
      // already-rendered bubble's `speaker::foldedText` fingerprint can never re-fold,
      // independent of id/room/world timing — the structural fix for the reload loop.
      foldedFingerprints: foldedFingerprintsRef.current,
      // Active-world messages ONLY — the authoritative anti-bleed gate. While the
      // post-switch `loadRealm` is in flight, `messages` still carries the departing
      // world's role lines (顾辰风 / 雷军); filtering by `message.worldId` here means
      // they are never folding candidates for the destination transcript, no matter
      // how many transitional renders the async reload spans (F2).
      messages: scopedMessages,
      ownerIds: ["owner", identity],
      pendingReply,
      roles,
      roomId: selectedRoomId,
    });
    if (folds.length === 0) {
      return;
    }
    // Claim the ids AND content fingerprints SYNCHRONOUSLY (not via state) so the next
    // hydration re-render of this effect — which still reads a pre-commit `turns` —
    // already sees them folded by BOTH the acceleration id-bypass and the authoritative
    // fingerprint gate.
    for (const id of idsToRegister) {
      foldedIdsRef.current.add(id);
    }
    for (const fingerprint of fingerprintsToRegister) {
      foldedFingerprintsRef.current.add(fingerprint);
    }
    // Insert by each message's ORIGINAL `createdAt`, never blindly at the tail: a
    // re-delivered older message (the reload regression) must land in its chronological
    // slot, not stray-appended at the very bottom. For the common live single-fold of
    // the newest message this degrades to a stable tail append.
    setTurns((current) =>
      insertFoldsByTimestamp({
        existing: current,
        folds,
        messages: scopedMessages,
        mintId: nextTurnId,
      }),
    );
  }, [
    scopeChanged,
    activeRunTurn,
    events,
    scopedMessages,
    roles,
    selectedRoomId,
    identity,
    turns,
    setTurns,
    nextTurnId,
  ]);
}
