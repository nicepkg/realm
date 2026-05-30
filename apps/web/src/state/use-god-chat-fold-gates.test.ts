import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { selectFoldsWithIdGate } from "@/state/god-chat-fold-id-gate.ts";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import { roleSpeechPostedTurn } from "@/state/god-chat-role-turn.ts";
import { saveTranscript, transcriptStorageKey } from "@/state/god-chat-transcript-store.ts";
import { seedAndHealFoldGates } from "@/state/use-god-chat-fold-gates.ts";
import { transcriptScopeKey } from "@/state/use-god-chat-helpers.ts";
import { postedMsg, roles } from "@/state/use-god-chat-transcript-sync-harness.ts";

/**
 * Reload accumulation root-cause regression (P1, round-6 storage-truth seed).
 *
 * BUG: after running a freshly-created NL world's role turn then RELOADING, the role
 * reply bubble DUPLICATED and accumulated one extra copy per reload (1→2→3→…), each
 * bound to the SAME backend message id. LIVE root cause: on mount the active world
 * resolves ASYNC, so the first render keys the `(undefined → __none__)` scope; `turns`
 * hydrates from the EMPTY `__none__` slot and the fold gate seeds empty. When the
 * worldId finally flips, the persistence scope-load `setTurns(restored)` lands a render
 * LATER — but the posted-fold effect runs in the gap, re-folding the persisted role
 * message because the gate (seeded from the empty `turns` snapshot) is blind to the
 * destination's already-persisted bubbles, which live in localStorage under the
 * real-world key, NOT yet in `turns`.
 *
 * FIX: `seedAndHealFoldGates` seeds BOTH gates from the destination scope's PERSISTED
 * transcript read straight from storage (`loadTranscript`), unioned with the in-render
 * `turns` — so the destination's bound ids + content fingerprints are in the gates
 * SYNCHRONOUSLY before any fold can fire, fully decoupled from React commit timing.
 *
 * This spec installs a `localStorage` stub holding the destination scope's persisted
 * bubble, drives `seedAndHealFoldGates` through the exact reload window (in-render
 * `turns` STILL empty because the scope-load `setTurns` has not committed), and asserts
 * the posted-fold effect's gate now vetoes the re-fold of that persisted message.
 */

const identity = "owner";
const destWorldId = "world-c1ed09f5";
const reply = "稳一手——先听听其他人怎么说，我再补充。";
const message = postedMsg("msg:abc", "guchenfeng", reply);

function installStorageStub(): { teardown: () => void } {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  } satisfies Storage;
  return { teardown: () => delete (globalThis as { localStorage?: Storage }).localStorage };
}

/** The settled role-speech bubble persisted under the destination scope, bound to msg. */
function persistedBubble(): ChatTurn {
  return { ...roleSpeechPostedTurn(message, "顾辰风"), id: "hydrated-1" };
}

describe("seedAndHealFoldGates — storage-truth seed closes the reload accumulation race", () => {
  let storage: { teardown: () => void };

  beforeEach(() => {
    storage = installStorageStub();
    // The destination world's transcript was persisted with the settled bubble (the
    // freshly-created NL world's run-turn reply) BEFORE the reload.
    saveTranscript(destWorldId, identity, [persistedBubble()]);
  });

  afterEach(() => storage.teardown());

  test("the persisted destination bubble is sanity-checked into storage", () => {
    expect(localStorage.getItem(transcriptStorageKey(destWorldId, identity))).toContain(reply);
  });

  test("a scope flip to the destination seeds the gate from STORAGE while `turns` is still empty", () => {
    const foldedIdsRef = { current: undefined as unknown as Set<string> };
    const foldedFingerprintsRef = { current: undefined as unknown as Set<string> };

    // The EXACT reload window: the scope just flipped to the destination world, but the
    // persistence scope-load `setTurns(restored)` has NOT committed yet, so the in-render
    // `turns` the hook reads is STILL the empty `__none__` transcript.
    seedAndHealFoldGates({
      identity,
      refs: { foldedFingerprintsRef, foldedIdsRef },
      scopeChanged: true,
      turns: [],
      worldId: destWorldId,
    });

    // Despite the empty `turns`, the gate carries the persisted bubble's bound id AND its
    // content fingerprint — read straight from storage.
    expect(foldedIdsRef.current.has("msg:abc")).toBe(true);
    expect(foldedFingerprintsRef.current.size).toBeGreaterThan(0);

    // The posted-fold effect now re-encounters the re-delivered backend message: the gate
    // VETOES it, so it is NOT re-folded into a second bubble (the accumulation root cause).
    const { folds } = selectFoldsWithIdGate({
      existing: [], // the stale empty `turns` snapshot the fold pass reads
      foldedFingerprints: foldedFingerprintsRef.current,
      foldedIds: foldedIdsRef.current,
      messages: [message],
      ownerIds: ["owner", identity],
      roomId: "main",
      roles,
    });
    expect(folds).toHaveLength(0);
  });

  test("a re-delivered message with a DIFFERENT id is still vetoed by the storage fingerprint", () => {
    const foldedIdsRef = { current: undefined as unknown as Set<string> };
    const foldedFingerprintsRef = { current: undefined as unknown as Set<string> };
    seedAndHealFoldGates({
      identity,
      refs: { foldedFingerprintsRef, foldedIdsRef },
      scopeChanged: true,
      turns: [],
      worldId: destWorldId,
    });
    // The backend re-stamped the message id on reload, so the id gate can't catch it —
    // but the content fingerprint seeded from storage still blocks the re-fold.
    const redelivered = postedMsg("msg:restamped", "guchenfeng", reply);
    const { folds } = selectFoldsWithIdGate({
      existing: [],
      foldedFingerprints: foldedFingerprintsRef.current,
      foldedIds: foldedIdsRef.current,
      messages: [redelivered],
      ownerIds: ["owner", identity],
      roomId: "main",
      roles,
    });
    expect(folds).toHaveLength(0);
  });

  test("a genuinely NEW utterance from the destination still folds (no over-suppression)", () => {
    const foldedIdsRef = { current: undefined as unknown as Set<string> };
    const foldedFingerprintsRef = { current: undefined as unknown as Set<string> };
    seedAndHealFoldGates({
      identity,
      refs: { foldedFingerprintsRef, foldedIdsRef },
      scopeChanged: true,
      turns: [],
      worldId: destWorldId,
    });
    const fresh = postedMsg("msg:new", "guchenfeng", "我从洞府归来，剑意已成。");
    const { folds } = selectFoldsWithIdGate({
      existing: [],
      foldedFingerprints: foldedFingerprintsRef.current,
      foldedIds: foldedIdsRef.current,
      messages: [fresh],
      ownerIds: ["owner", identity],
      roomId: "main",
      roles,
    });
    expect(folds).toHaveLength(1);
    expect(folds[0]?.message.id).toBe("msg:new");
  });

  test("a fresh (empty-storage) world seeds the gate empty — no phantom suppression", () => {
    const foldedIdsRef = { current: undefined as unknown as Set<string> };
    const foldedFingerprintsRef = { current: undefined as unknown as Set<string> };
    // A world with no persisted transcript: its scope key resolves to a slot storage has
    // never written, so the gate seeds empty and the first genuine reply folds normally.
    const freshWorld = "world-empty";
    expect(localStorage.getItem(transcriptStorageKey(freshWorld, identity))).toBeNull();
    seedAndHealFoldGates({
      identity,
      refs: { foldedFingerprintsRef, foldedIdsRef },
      scopeChanged: true,
      turns: [],
      worldId: freshWorld,
    });
    expect(foldedIdsRef.current.size).toBe(0);
    expect(foldedFingerprintsRef.current.size).toBe(0);
    // Confirm the destination scope key derivation matches what persistence keys against
    // (so the storage seed reads the SAME slot persistence wrote — not a sibling).
    expect(transcriptScopeKey(destWorldId, identity)).not.toBe(
      transcriptScopeKey(freshWorld, identity),
    );
  });
});
