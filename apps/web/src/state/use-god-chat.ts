import { useCallback, useMemo, useRef, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import type { ChatTurn, GodChatContext, PendingProposal } from "@/state/god-chat-model.ts";
import { loadTranscript } from "@/state/god-chat-transcript-store.ts";
import { routeIntentPrimary } from "@/state/route-intent-primary.ts";
import { useGodChatActions } from "@/state/use-god-chat-actions.ts";
import {
  resolveSubmitSource,
  type WorldSwitchCarryOver,
  worldScopedRoles,
} from "@/state/use-god-chat-helpers.ts";
import { useGodChatTranscriptPersistence } from "@/state/use-god-chat-transcript-persistence.ts";
import {
  type ActiveRunTurn,
  useGodChatTranscriptSync,
} from "@/state/use-god-chat-transcript-sync.ts";

/**
 * God-chat controller — the brain that wires the natural-language chat window to
 * the REAL backend without duplicating any action logic. It classifies operator
 * text into the five intent families, answers read-only inspects immediately,
 * and stages every write as a preview-before-confirm card (Don Norman: error
 * prevention). Confirming performs the actual write through the EXISTING SDK /
 * controller methods, reloads the world, and reports what happened.
 *
 * It consumes `RealmAppController` read/method-only and never touches
 * `use-realm-app-state.ts` internals. Pure routing / shaping / answer / feedback
 * logic lives in `god-chat-model.ts`; the action callbacks (inspect / stage /
 * confirm) live in `use-god-chat-actions.ts` so this file stays a thin
 * orchestrator that owns only state + submit + composition.
 */

export type UseGodChat = {
  turns: ChatTurn[];
  draft: string;
  setDraft: (value: string) => void;
  submit: () => Promise<void>;
  /**
   * Route + run an EXPLICIT text immediately, bypassing the `draft` state. This
   * exists because `setDraft(text)` + `submit()` in the same tick cannot work:
   * React batches the state update, so `submit`'s closure still reads the OLD
   * (empty) draft. A read-class suggestion chip ("现在世界什么状态？") therefore must
   * send its prompt directly via `submitText`, not through the composer — landing
   * the NL-first "one tap, one answer" without a second send press. It reuses the
   * EXACT same routing/dispatch pipeline as `submit` (`routeIntentPrimary` →
   * inspect/stage/config/…), so a write typed here still stages a preview and is
   * never auto-committed.
   */
  submitText: (text: string) => Promise<void>;
  pendingProposal: PendingProposal | undefined;
  confirmProposal: (typedConfirmation?: string) => Promise<void>;
  cancelProposal: () => void;
  busy: boolean;
  error: string | undefined;
};

let turnSeq = 0;

function nextTurnId(): string {
  turnSeq += 1;
  return `god-chat-${turnSeq}`;
}

export function useGodChat(app: RealmAppController): UseGodChat {
  const worldId = app.selectedWorld?.id;
  const identity = app.identity;
  // F6 — restore the INITIAL (world, identity) scope so a reload comes back
  // showing "刚才对天道下了哪些指令" instead of an empty window. Later scope
  // changes are handled by the reload effect below.
  const [turns, setTurns] = useState<ChatTurn[]>(() => loadTranscript(worldId, identity));
  // Always-current mirror of `turns` so the scope-switch flush reads the latest
  // transcript without depending on `turns` (which would reload on every append).
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const [draft, setDraft] = useState("");
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [activeRunTurn, setActiveRunTurn] = useState<ActiveRunTurn | undefined>();
  // Guard against double-submit / double-confirm while a network write is in
  // flight, without forcing the public `busy` flag to gate pure-sync routing.
  const inFlightRef = useRef(false);
  // When a config PROPOSAL itself is rejected by the read-only / trust gate we
  // never obtained a `ConfigPatchProposal`, so there is no staged write to carry
  // on the trust card's `retry`. Instead we stash the original config GOAL here:
  // confirming the trust card lifts trust and RE-RUNS `stageConfig(goal)` (F2),
  // landing the operator on a fresh, now-permitted proposal in one tap. Cleared
  // whenever any other proposal is staged or the trust card is cancelled.
  const pendingConfigGoalRef = useRef<string | undefined>(undefined);
  // F2 (world-switch continuity) — a chat-initiated world switch flips `worldId`,
  // which makes the persistence scope-switch effect REPLACE `turns` with the
  // destination world's saved history, dropping the operator's just-typed "切换到…"
  // bubble + the switch result card. We stash those live turns here on submit so the
  // scope-switch effect APPENDS them onto the destination's restored transcript
  // (one continuous conversation across worlds). Carrying the LIVE typed text
  // guarantees the post-switch green bubble reads exactly what was typed, never a
  // stale destination-scope label. Cleared by the effect once consumed.
  const pendingSwitchCarryOverRef = useRef<WorldSwitchCarryOver | undefined>(undefined);

  // The RAW "a concrete world is selected" signal, distinct from the RESOLVED
  // `app.selectedWorld` (which is undefined both when nothing is selected AND when a
  // just-created world's summary has not yet landed in the roster). The controller
  // does not surface its internal `selectedWorldId`, so we reconstruct the
  // distinction structurally: `resolveSelectedWorld` only returns undefined while a
  // concrete id is selected-but-unresolved OR when the roster is genuinely empty —
  // with NO selection it falls back to `worlds[0]` (a defined world). Hence a
  // resolved world means we know its real id; an unresolved world WITH worlds in the
  // roster means one is selected but not yet loaded (a present id we cannot name),
  // which we mark with the resolved id when known and a non-empty sentinel otherwise
  // so `worldScopedRoles` reads it purely as a presence flag (see its doc). Only a
  // truly empty roster yields no selection (the manager-level full-pool view).
  const SELECTED_BUT_UNRESOLVED = "__selected-unresolved__";
  const selectedWorldId =
    app.selectedWorld?.id ?? (app.state.worlds.length > 0 ? SELECTED_BUT_UNRESOLVED : undefined);

  // F3 — the NL context's role list means the active world's MEMBERS (its
  // `roleIds`), not the whole project pool, so the chat's "现在世界里有谁" answer +
  // the right rail stay in lockstep with the state panel's "当前世界为空" (see
  // `worldScopedRoles`). Selected-but-unresolved → empty (loading), never the pool;
  // no world selected at all → full pool.
  const scopedRoles = useMemo(
    () => worldScopedRoles(app.state.roles, app.selectedWorld, selectedWorldId),
    [app.state.roles, app.selectedWorld, selectedWorldId],
  );

  const context = useMemo<GodChatContext>(
    () => ({
      roles: scopedRoles,
      roomId: app.selectedRoom?.id,
      rooms: app.state.rooms,
      // The REAL selected world id (undefined while a just-created world is still
      // loading) so write routing only ever targets a fully-resolved world — never
      // the unresolved sentinel above, which exists purely to scope the roster.
      worldId: app.selectedWorld?.id,
      worlds: app.state.worlds,
      worldState: app.state.worldState,
    }),
    [
      scopedRoles,
      app.state.rooms,
      app.state.worlds,
      app.state.worldState,
      app.selectedRoom?.id,
      app.selectedWorld?.id,
    ],
  );

  const pushTurn = useCallback((turn: Omit<ChatTurn, "id">) => {
    setTurns((current) => [...current, { ...turn, id: nextTurnId() }]);
  }, []);

  // All action callbacks (inspect / world-switch / stage / confirm / cancel)
  // own the writes against the EXISTING SDK; this hook owns only state.
  // Drop the in-flight world-switch carry-over (used by `switchWorld`'s failure
  // path) — stable so it never re-creates the actions object.
  const clearSwitchCarryOver = useCallback(() => {
    pendingSwitchCarryOverRef.current = undefined;
  }, []);

  const { runInspect, switchWorld, stageConfig, stageWrite, confirmProposal, cancelProposal } =
    useGodChatActions({
      app,
      clearSwitchCarryOver,
      context,
      inFlightRef,
      pendingConfigGoalRef,
      pendingProposal,
      pushTurn,
      setActiveRunTurn,
      setBusy,
      setDraft,
      setError,
      setPendingProposal,
    });

  // The SHARED route + dispatch core. Both `submit` (draft-backed) and
  // `submitText` (explicit-text, draft-bypassing) funnel an already-trimmed line
  // through here, so there is exactly ONE routing/dispatch pipeline. Every branch
  // is byte-identical to the old inline `submit` body — it is purely a parameter
  // extraction so a direct-send chip can supply its prompt without the
  // setDraft+submit same-tick batching trap. Declared AFTER its routing callbacks
  // (runInspect / stageConfig / stageWrite) so they are real, stable deps.
  const runRouted = useCallback(
    async (text: string) => {
      if (text.length === 0 || inFlightRef.current) {
        return;
      }
      setError(undefined);
      pushTurn({ role: "operator", text });

      // PRIMARY model-backed routing (server `/api/assistant/intent`), with the
      // synchronous deterministic router as a guaranteed fallback inside
      // `routeIntentPrimary` on any network/parse/timeout failure. The returned
      // RouteResult is the SAME shape the deterministic router produced, so every
      // downstream branch below is unchanged.
      const route = await routeIntentPrimary(text, context, app.client);

      // Read-only + no-op paths resolve immediately; the draft is cleared because
      // there is nothing to retry. (For a `submitText` direct-send the draft was
      // already empty, so this is a harmless no-op there.)
      if (route.mode === "noop") {
        setDraft("");
        pushTurn({ role: "system", text: route.text });
        return;
      }
      if (route.mode === "inspect") {
        setDraft("");
        await runInspect(route.intent);
        return;
      }
      if (route.mode === "world-switch") {
        setDraft("");
        // Stash the LIVE operator line + destination name so the persistence
        // scope-switch effect carries them into the destination scope instead of
        // dropping them when it restores that world's saved transcript (F2). The
        // operator bubble pushed above lives in the SOURCE scope and is discarded by
        // the scope swap; the carry-over re-materializes it (with the live text) on
        // top of the destination's history, so the switch is one continuous turn.
        pendingSwitchCarryOverRef.current = { liveText: text, worldName: route.worldName };
        await switchWorld(route.worldId, route.worldName);
        return;
      }

      // Write paths: clear the composer optimistically, then either fetch the
      // config proposal (network — restore the draft on failure so it is
      // retryable) or stage the locally-shaped write for confirm. A write reaching
      // here via `submitText` is STILL staged as a preview, never auto-committed.
      setDraft("");
      if (route.mode === "config") {
        await stageConfig(route.goal, text);
        return;
      }
      stageWrite(route.proposal);
    },
    [context, app.client, pushTurn, runInspect, stageConfig, stageWrite, switchWorld],
  );

  // Draft-backed submit (composer Enter / send button): route the trimmed draft.
  const submit = useCallback(
    () => runRouted(resolveSubmitSource({ draft, from: "draft" })),
    [runRouted, draft],
  );

  // Explicit-text submit (read-class suggestion direct-send): route the supplied
  // text WITHOUT touching `draft`, sidestepping the same-tick setDraft batching
  // that would make a setDraft+submit pair read the stale empty draft.
  const submitText = useCallback(
    (text: string) => runRouted(resolveSubmitSource({ from: "text", text })),
    [runRouted],
  );

  // F6 — durable transcript persistence (scope-load on switch + debounced
  // write-back). Co-located hook so this file stays under the 500-line guard; it
  // only observes/restores `turns`, never racing the append-only sync hook.
  useGodChatTranscriptPersistence({
    identity,
    nextTurnId,
    setTurns,
    switchCarryOverRef: pendingSwitchCarryOverRef,
    turns,
    turnsRef,
    worldId,
  });

  // F1 — fold in-world role speech (streamed run-turn replies + posted room
  // messages) back into the NL conversation (co-located hook, pure decisions).
  useGodChatTranscriptSync({
    activeRunTurn,
    events: app.state.events,
    identity: app.identity,
    messages: app.state.messages,
    nextTurnId,
    pushTurn,
    roles: app.state.roles,
    selectedRoomId: app.selectedRoom?.id,
    setActiveRunTurn,
    setPendingProposal,
    setTurns,
    turns,
    // F2 — the active (world, identity) scope. On an NL world-switch this flips and
    // the sync hook must reset its cross-render fold gate + skip one transitional
    // fold pass, so the PRIOR world's still-stale `messages`/`events` are never
    // folded into the destination world's freshly-reloaded (empty) `turns`.
    worldId,
  });

  return {
    busy,
    cancelProposal,
    confirmProposal,
    draft,
    error,
    pendingProposal,
    setDraft,
    submit,
    submitText,
    turns,
  };
}

// Re-export the pure helpers (now in `use-god-chat-helpers.ts`) so the hook's
// unit tests keep importing them from `@/state/use-god-chat.ts`.
export {
  composeStructureFollowUp,
  resolveCreatedWorldId,
  resolveSubmitSource,
  shouldRestoreDraftOnProposalError,
  worldScopedRoles,
} from "@/state/use-god-chat-helpers.ts";
