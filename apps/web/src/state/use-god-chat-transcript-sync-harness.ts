import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import {
  hasUnboundIdLessSpeech,
  insertFoldsByTimestamp,
  mergeBoundIdsFromTurns,
  reconcileIdLessSpeechTurns,
  seedFoldedIdsFromTurns,
  selectFoldsWithIdGate,
  settleBoundMessageId,
} from "@/state/god-chat-fold-id-gate.ts";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { roleSpeechPostedTurn, settleRunTurn } from "@/state/god-chat-role-turn.ts";

/**
 * Test harnesses + shared fixtures for `useGodChatTranscriptSync` regression specs.
 *
 * These faithfully drive the EXACT effect bodies the hook runs — `settleRunTurn` +
 * `settleBoundMessageId` (active-run-turn effect) and `selectFoldsWithIdGate` (posted-
 * fold effect) — through a re-render harness that models React's commit timing WITHOUT
 * a DOM renderer, so reload/world-switch re-render storms are reproducible. Kept in a
 * sibling module (not the spec) so the test file stays under the file-size gate while
 * harness infra and assertions remain cohesive.
 */

export const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
];

export function postedMsg(id: string, authorId: string, content: string): Message {
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

/** Count role-speech bubbles that carry the given backend message id. */
export function bubblesForMessage(turns: ChatTurn[], messageId: string): ChatTurn[] {
  return turns.filter(
    (turn) => turn.card?.variant === "role-speech" && turn.sourceMessageId === messageId,
  );
}

/**
 * A faithful harness for the two transcript-sync effects, modeling React's commit
 * timing so the reload re-render storm is reproducible WITHOUT a DOM renderer:
 *  - `foldedIdsRef` is a STABLE Set surviving every re-render (React `useRef`).
 *  - `committedTurns` is the value the effects READ; `applyTurns` is the pending
 *    `setTurns` result. We deliberately let the read LAG one render behind the write
 *    (`commit()` is called by the harness between renders, not synchronously inside
 *    the effect) — this is the exact stale-snapshot condition that caused the bug.
 */
export function makeHarness(args: {
  messages: Message[];
  /** When set, the active-run-turn settle path also runs (stream-settled bubble). */
  streamed?: string;
  /**
   * Models a RELOAD: persistence has already hydrated `turns` (via the synchronous
   * `useState(() => loadTranscript(...))` initializer) with the settled role-speech
   * bubble BEFORE this hook's first render. The harness seeds the gate from them the
   * way the hook's lazy `useRef` initializer does, and starts `committedTurns` with
   * them so the posted-fold effect re-encounters the persisted bubble's backend
   * message — exactly the double-bubble precondition.
   */
  hydratedTurns?: ChatTurn[];
  /**
   * Models the RELOAD message-hydration LAG (the live double-bubble path): on reload
   * `app.state.messages`/`events` settle a render or two AFTER the transcript is
   * restored. When set, the harness's message log starts EMPTY and only exposes
   * `args.messages` once `deliverMessages()` is called — so the effects read a mutable,
   * render-varying log (not a static snapshot), reproducing the window where reconcile
   * fires against zero messages on the first stable render.
   */
  deliverMessagesLate?: boolean;
  /**
   * Models the RELOAD TRANSCRIPT-hydration LAG (the ID-BOUND double-bubble path). On
   * reload the world id resolves async, so when the scope settles the persistence
   * scope-load effect has NOT yet swapped the saved transcript into `turns` — the bound
   * persisted bubble lands a render LATER. When set, the gate is sealed EMPTY at
   * construction (the lazy seed sees no turns) and `committedTurns` starts EMPTY; the
   * caller injects `hydratedTurns` later via `deliverTurns()`. The per-render
   * `mergeBoundIdsFromTurns` (the fix) must then heal the gate the instant they land.
   */
  hydrateTurnsLate?: boolean;
}) {
  const startTurns = args.hydrateTurnsLate ? [] : (args.hydratedTurns ?? []);
  // The hook's lazy `useRef` seed: foldedIdsRef starts seeded from the hydrated
  // transcript's sourceMessageIds. When the transcript hydrates LATE (the ID-bound
  // path) the seed sees NOTHING — exactly the sealed-empty gate the fix must heal.
  const foldedIdsRef = {
    current: new Set<string>(seedFoldedIdsFromTurns(startTurns)),
  };
  let committedTurns: ChatTurn[] = [...startTurns];
  // The snapshot the POSTED-FOLD effect reads — deliberately lagged one render behind
  // `committedTurns` (reads lag writes), so a transcript that hydrates THIS render is
  // still invisible to the fold's `existing`-dedup until next render. This is the exact
  // stale-snapshot window the live ID-bound double-bubble exploited: the bound bubble
  // was swapped into state, but the fold pass that re-folded its message still read the
  // pre-hydration (empty) snapshot — so only the render-body gate re-seed (which reads
  // CURRENT state) can veto it.
  let foldReadTurns: ChatTurn[] = [...startTurns];
  let pending: ChatTurn[] | undefined;
  let idSeq = 0;
  const nextTurnId = () => {
    idSeq += 1;
    return `turn-${idSeq}`;
  };
  // The MUTABLE, render-varying message log the effects read — the faithful model of
  // `app.state.messages`, which on reload hydrates a render or two AFTER `turns`. When
  // `deliverMessagesLate` is set we start EMPTY and reveal `args.messages` only on
  // `deliverMessages()`; otherwise the messages are present from the first render.
  let messages: Message[] = args.deliverMessagesLate ? [] : args.messages;
  // The active-run-turn settle runs at most ONCE per turn in the real hook (it clears
  // `activeRunTurn` afterwards). Model that so the settle storm doesn't mint a bubble
  // per render — only the posted-fold dedup is under test across the storm.
  let activeRunTurnSettled = false;
  // The id-less reload reconciliation is gated ONCE PER SCOPE by `reconciledScopeRef`,
  // but the gate is DEFERRED while messages are absent AND an un-bound id-less bubble is
  // still waiting (the fix). We model that exact guard so the storm re-renders re-run
  // reconcile only until the message lands or the work is settled.
  let reconciledScope: string | null = null;
  const scope = "world:identity"; // single fixed scope for the reload harness

  function setTurns(next: (current: ChatTurn[]) => ChatTurn[]) {
    pending = next(pending ?? committedTurns);
  }

  /**
   * Reload id-less reconciliation effect body (one pass) — declared FIRST in the hook
   * so it seeds the gate BEFORE the posted-fold effect. Binds a persisted id-LESS
   * role-speech bubble to its posted twin's id and seeds that id into the gate. Mirrors
   * the hook's DEFERRED once-per-scope marking: it only burns the guard once reconcile
   * has had a fair chance (messages present, or nothing id-less left to bind).
   */
  function reconcileEffect() {
    if (reconciledScope === scope) {
      return;
    }
    const turns = pending ?? committedTurns;
    const result = reconcileIdLessSpeechTurns({
      messages,
      ownerIds: ["owner"],
      roles,
      roomId: "main",
      turns,
    });
    const deferMark = messages.length === 0 && hasUnboundIdLessSpeech(turns);
    if (!deferMark) {
      reconciledScope = scope;
    }
    if (!result.changed) {
      return;
    }
    reconciledScope = scope;
    for (const id of result.boundIds) {
      foldedIdsRef.current.add(id);
    }
    setTurns(() => result.turns);
  }

  /** Active-run-turn SETTLE effect body (one pass), terminal completed. */
  function settleEffect() {
    const settle = settleRunTurn({
      bubbleTurnId: undefined,
      denialReason: undefined,
      events: [] as RealmEvent[],
      existing: pending ?? committedTurns,
      messages,
      ownerIds: ["owner"],
      roleName: "顾辰风",
      roles,
      roomId: "main",
      streamed: args.streamed,
      terminal: { kind: "completed" },
      turnId: "t1",
    });
    const boundId = settleBoundMessageId(settle);
    if (boundId) {
      foldedIdsRef.current.add(boundId);
    }
    if (settle.kind === "settleNew") {
      setTurns((current) => [...current, { ...settle.turn, id: nextTurnId() }]);
    }
    // growBubble / fail / none don't append a fresh posted bubble here.
  }

  /** Posted-fold effect body (one pass) — the buggy path, now id-gated. */
  function foldEffect() {
    const { folds, idsToRegister } = selectFoldsWithIdGate({
      existing: foldReadTurns, // reads the one-render-LAGGED snapshot (the bug's cause)
      foldedIds: foldedIdsRef.current,
      messages,
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    if (folds.length === 0) {
      return;
    }
    for (const id of idsToRegister) {
      foldedIdsRef.current.add(id);
    }
    setTurns((current) =>
      insertFoldsByTimestamp({
        existing: current,
        folds,
        messages,
        mintId: nextTurnId,
      }),
    );
  }

  /** One render: run the effects in hook order, THEN commit (reads lag writes). */
  function render() {
    // The hook's per-render SELF-HEALING gate re-seed reads CURRENT `turns` (with any
    // just-hydrated bubble), so a late-hydrated transcript's bound ids enter the gate
    // BEFORE the posted-fold pass — even while that pass still reads its lagged snapshot.
    mergeBoundIdsFromTurns(foldedIdsRef.current, committedTurns);
    reconcileEffect();
    if (args.streamed !== undefined && !activeRunTurnSettled) {
      activeRunTurnSettled = true;
      settleEffect();
    }
    foldEffect();
    // The fold effect's snapshot lags one render behind committed state (reads lag
    // writes): advance it to what was committed at the START of this render.
    foldReadTurns = committedTurns;
    if (pending) {
      committedTurns = pending;
      pending = undefined;
    }
  }

  return {
    render,
    /** Reveal `args.messages` to the effects — the late reload hydration landing. */
    deliverMessages() {
      messages = args.messages;
    },
    /**
     * Inject the persisted transcript LATE — the persistence scope-load effect swapping
     * the saved transcript into `turns` a render after the scope settled (ID-bound path).
     */
    deliverTurns() {
      // Persistence's scope-load `setTurns(restored)` REPLACES state with the saved
      // transcript (the bound bubble). The posted-fold effect's decision, however, still
      // reads the pre-hydration (empty) `turns` closure for one more render, and
      // `insertFoldsByTimestamp` blindly appends a fold decided from that stale snapshot
      // regardless of the now-committed bound bubble — so reset the lagged fold-read
      // snapshot to the empty baseline to reproduce that exact window.
      committedTurns = [...(args.hydratedTurns ?? [])];
      foldReadTurns = [];
      pending = undefined;
    },
    get turns() {
      return committedTurns;
    },
  };
}

/**
 * Harness for F2 — cross-world transcript bleed after an NL world-switch.
 *
 * Applies the SAME `scopedMessages` filter the hook does and lets the caller hold the
 * departing world's `messages` stale for MULTIPLE post-switch renders, proving the
 * filter — not just the one-render bail — kills the bleed.
 */
export function makeWorldScopedHarness(initial: { messages: Message[]; worldId: string }) {
  const foldedIdsRef = { current: new Set<string>() };
  // The destination scope reloads to an EMPTY transcript (persistence owns the reload;
  // the sync hook never re-authors `turns`). The harness starts already-populated to
  // model a world whose exchange was folded, then swaps to a fresh empty scope.
  let committedTurns: ChatTurn[] = [];
  let pending: ChatTurn[] | undefined;
  let idSeq = 0;
  const nextTurnId = () => {
    idSeq += 1;
    return `turn-${idSeq}`;
  };
  let messages = initial.messages;
  let activeRunTurn: { roleName: string; streamed: string } | undefined;
  // The scope-change ref the hook keys its gate-reset to (identity is constant here,
  // so the world id IS the scope key for this harness).
  const prevWorldScopeRef = { current: initial.worldId };
  let worldId = initial.worldId;

  function setTurns(next: (current: ChatTurn[]) => ChatTurn[]) {
    pending = next(pending ?? committedTurns);
  }

  /** The hook's authoritative anti-bleed filter: active-world messages ONLY. */
  function scopedMessages(): Message[] {
    return messages.filter((message) => message.worldId === worldId);
  }

  function foldEffect() {
    const { folds, idsToRegister } = selectFoldsWithIdGate({
      existing: committedTurns,
      foldedIds: foldedIdsRef.current,
      messages: scopedMessages(),
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    if (folds.length === 0) {
      return;
    }
    for (const id of idsToRegister) {
      foldedIdsRef.current.add(id);
    }
    setTurns((current) => [
      ...current,
      ...folds.map((entry) => ({
        ...roleSpeechPostedTurn(entry.message, entry.speakerName),
        id: nextTurnId(),
      })),
    ]);
  }

  function settleEffect() {
    if (!activeRunTurn) {
      return;
    }
    const settle = settleRunTurn({
      bubbleTurnId: undefined,
      denialReason: undefined,
      events: [] as RealmEvent[],
      existing: pending ?? committedTurns,
      messages: scopedMessages(),
      ownerIds: ["owner"],
      roleName: activeRunTurn.roleName,
      roles,
      roomId: "main",
      streamed: activeRunTurn.streamed,
      terminal: { kind: "completed" },
      turnId: "t1",
    });
    const boundId = settleBoundMessageId(settle);
    if (boundId) {
      foldedIdsRef.current.add(boundId);
    }
    if (settle.kind === "settleNew") {
      setTurns((current) => [...current, { ...settle.turn, id: nextTurnId() }]);
    }
    activeRunTurn = undefined;
  }

  /** One render: detect a scope change FIRST (reset gate + clear active + bail). */
  function render() {
    const scopeChanged = prevWorldScopeRef.current !== worldId;
    if (scopeChanged) {
      prevWorldScopeRef.current = worldId;
      foldedIdsRef.current = new Set<string>();
      activeRunTurn = undefined;
    }
    if (!scopeChanged) {
      settleEffect();
      foldEffect();
    }
    if (pending) {
      committedTurns = pending;
      pending = undefined;
    }
  }

  return {
    render,
    /**
     * Switch worlds the way the live app does: `worldId` flips immediately and
     * persistence reloads `turns` to the destination's saved transcript (empty for a
     * fresh world), but `messages` STAY stale (the departing world's) until the async
     * `loadRealm` resolves — the caller drives that with `setMessages` later.
     */
    switchWorld(nextWorldId: string, restoredTurns: ChatTurn[]) {
      worldId = nextWorldId;
      committedTurns = restoredTurns;
      pending = undefined;
    },
    startRunTurn(roleName: string, streamed: string) {
      activeRunTurn = { roleName, streamed };
    },
    setMessages(next: Message[]) {
      messages = next;
    },
    get turns() {
      return committedTurns;
    },
  };
}
