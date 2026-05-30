import type { MutableRefObject } from "react";
import {
  mergeBoundIdsFromTurns,
  mergeFingerprintsFromTurns,
  seedFoldedFingerprintsFromTurns,
  seedFoldedIdsFromTurns,
} from "@/state/god-chat-fold-id-gate.ts";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { loadTranscript } from "@/state/god-chat-transcript-store.ts";

/**
 * The two AUTHORITATIVE cross-render dedup gates for `useGodChatTranscriptSync`,
 * extracted into a co-located helper so the sync hook stays under the 500-line budget.
 * Both are ref-backed Sets that survive the hydration re-render storm and are mutated
 * SYNCHRONOUSLY (not via state) so a fold decision is independent of `turns` settle
 * timing:
 *
 *  - `foldedIdsRef` — backend `message.id`s already folded. The ACCELERATION bypass: a
 *    fast id-exact veto for the common case where a bubble bound a real message id.
 *  - `foldedFingerprintsRef` — every rendered role-speech bubble's `speaker::foldedText`
 *    content fingerprint. The PRIMARY gate (round-6): decoupled from id/room/world
 *    timing, so a posted message matching any rendered bubble can NEVER re-fold — even
 *    when its persisted twin settled id-LESS (the freshly-created NL world reload
 *    accumulation loop where `selectedRoom.id` was undefined at settle time).
 *
 * Both gates are seeded from the hydrated transcript on mount, RE-seeded on every
 * (worldId, identity) scope change (so a departing world's keys never suppress the
 * destination's speech — F2 anti-bleed), and SELF-HEALED on every render from the
 * current transcript (so a late-hydrated bubble's keys enter the gate before the
 * posted-fold effect runs). All seed/merge logic lives in `god-chat-fold-id-gate.ts`;
 * this helper owns only the seed/merge ORCHESTRATION.
 *
 * The two refs are CREATED by the consuming component via `useRef` (kept there so React
 * lint correctly treats `.current` as a stable, non-reactive dependency) and threaded
 * in here. This helper mutates them in place on render — it is invoked unconditionally
 * once per render of `useGodChatTranscriptSync`, so it never violates rules-of-hooks.
 */
export type FoldGateRefs = {
  foldedIdsRef: MutableRefObject<Set<string>>;
  foldedFingerprintsRef: MutableRefObject<Set<string>>;
};

export function seedAndHealFoldGates(input: {
  refs: FoldGateRefs;
  turns: ChatTurn[];
  /** True on the render the (worldId, identity) scope just changed (an NL world-switch). */
  scopeChanged: boolean;
  /** The CURRENT (destination) scope's worldId — the storage-truth seed source. */
  worldId: string | undefined;
  /** The active identity — the other half of the persisted-transcript scope key. */
  identity: string;
}): void {
  const { refs, turns, scopeChanged, worldId, identity } = input;
  const { foldedIdsRef, foldedFingerprintsRef } = refs;

  // The AUTHORITATIVE seed source is the destination scope's PERSISTED transcript read
  // straight from storage (`loadTranscript`), NOT the in-render `turns` prop. The reload
  // accumulation root cause: on mount/reload the active world resolves ASYNC, so the
  // first render keys the (undefined → `__none__`) scope; `turns` then hydrates from the
  // EMPTY `__none__` slot, and when the worldId finally flips, the persistence scope-load
  // `setTurns(restored)` lands a render LATER. During that gap the posted-fold effect
  // re-folds the persisted role message because the gate — seeded from the empty `turns`
  // snapshot — is blind to the destination's already-persisted bubbles (which live in
  // storage under the real-world key, not yet in `turns`). Reading storage directly seeds
  // both gates with the destination's bound ids + content fingerprints SYNCHRONOUSLY,
  // before any fold can fire, fully decoupled from React's commit timing.
  const storageTurns = loadTranscript(worldId, identity);
  // Union storage truth with the in-render `turns` so a just-folded (not-yet-persisted)
  // bubble's keys are covered too — neither source alone is complete during the window.
  const seedTurns = unionTranscripts(storageTurns, turns);

  // Lazy seed (refs start undefined): persistence loads the INITIAL scope synchronously
  // via `useState(() => loadTranscript())`, and storage carries the same bubbles, so on
  // render 1 the persisted bubble's id / fingerprint already block a backend re-fold.
  if (foldedIdsRef.current === undefined) {
    foldedIdsRef.current = new Set<string>(seedFoldedIdsFromTurns(seedTurns));
  }
  if (foldedFingerprintsRef.current === undefined) {
    foldedFingerprintsRef.current = new Set<string>(seedFoldedFingerprintsFromTurns(seedTurns));
  }

  if (scopeChanged) {
    // Re-seed BOTH gates from the destination's PERSISTED transcript (storage truth) so a
    // departing world's keys never suppress the new world's speech AND the destination's
    // own already-persisted bubbles immediately veto a re-fold across the post-switch
    // hydration storm — even though `turns` has not yet been swapped to the destination
    // this render (the exact race that defeated the prior `turns`-seeded re-seed). A fresh
    // world's storage slot is empty, so it correctly seeds to empty.
    foldedIdsRef.current = new Set<string>(seedFoldedIdsFromTurns(seedTurns));
    foldedFingerprintsRef.current = new Set<string>(seedFoldedFingerprintsFromTurns(seedTurns));
  }

  // SELF-HEAL on every render from BOTH storage truth and the in-render `turns`: the
  // lazy/scope seed can still snapshot too early (on reload `worldId` resolves async, so
  // persistence swaps the saved transcript a render LATER). Merging the destination's
  // persisted keys (storage) AND any just-folded bubble's keys (`turns`) into the gates
  // every render means the instant a hydrated/folded bubble exists, its keys are in the
  // gates BEFORE the posted-fold effect runs — vetoing the re-fold even when the bubble
  // settled id-LESS. Monotonic + safe: only ever ADDS keys of bubbles ALREADY persisted
  // or rendered, so it can never block a genuinely new message.
  mergeBoundIdsFromTurns(foldedIdsRef.current, seedTurns);
  mergeFingerprintsFromTurns(foldedFingerprintsRef.current, seedTurns);
}

/**
 * Union two transcripts by turn id (storage-truth ∪ in-render `turns`), preferring the
 * first source's turn on an id collision. During the reload scope-transition window the
 * destination's persisted bubbles live in `storageTurns` (read straight from
 * localStorage) but have NOT yet been swapped into the in-render `turns`, while a
 * just-folded bubble lives in `turns` but is not yet persisted — neither source alone is
 * complete, so the fold gate must seed from their union. Pure; returns `base` unchanged
 * when `extra` adds nothing so the common single-source case allocates nothing extra.
 */
function unionTranscripts(base: ChatTurn[], extra: ChatTurn[]): ChatTurn[] {
  if (extra.length === 0) {
    return base;
  }
  if (base.length === 0) {
    return extra;
  }
  const seen = new Set(base.map((turn) => turn.id));
  const fresh = extra.filter((turn) => !seen.has(turn.id));
  return fresh.length === 0 ? base : [...base, ...fresh];
}
