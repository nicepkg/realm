import type { ChatTurn } from "@/state/god-chat-model.ts";

/**
 * Durable persistence for the God-chat transcript (F6).
 *
 * The NL chat window's `turns` previously lived only in `useState([])`, so a
 * reload wiped everything the operator had said to 天道 (create / add-role /
 * God / rule / run-turn). This module folds the rendered transcript into
 * `localStorage`, keyed by (world, identity), so "刚才对天道下了哪些指令"
 * survives a reload — operator instructions, system feedback cards, and the
 * preview / result cards all come back.
 *
 * It is a thin, React-free pure module: `load` / `save` / `clear` plus the pure
 * (de)serialization helpers, all guarded so SSR / private-mode / unit tests
 * degrade silently (no `window`, throwing `localStorage`, corrupt JSON).
 *
 * Scope key = (worldId, identity). Switching world OR switching the active
 * account (owner ↔ a role view) loads that scope's own history, so one world's
 * 天道 log never leaks into another's and a role-account view never sees the
 * operator's god-eye transcript.
 *
 * It only OBSERVES + RESTORES `turns`; it never re-derives fold / settle logic
 * (that is `use-god-chat-transcript-sync.ts`'s job). So it cannot create a
 * write race with the sync hook — it is a downstream sink of the already-folded
 * transcript, not a second author of it.
 */

/** Namespace prefix for every persisted transcript scope. */
const STORAGE_PREFIX = "realm:god-chat:";

/**
 * Hard cap on a persisted scope's serialized size (chars ≈ bytes for the ASCII
 * envelope; zh-CN bodies are larger but localStorage budgets per-origin, so a
 * generous-but-bounded cap keeps one chatty world from starving the others). A
 * scope over the cap is trimmed oldest-first until it fits — the most recent
 * turns (what the operator most wants to re-read) are always kept.
 */
const MAX_SERIALIZED_CHARS = 256 * 1024;

/**
 * Absolute floor on retained turns so trimming a pathologically large single
 * turn never empties the transcript entirely — at least the newest turns stay.
 */
const MIN_RETAINED_TURNS = 4;

/** Schema tag so a future shape change can invalidate stale persisted blobs. */
const SCHEMA_VERSION = 1;

type PersistedEnvelope = {
  v: number;
  turns: ChatTurn[];
};

/** True only when a real `localStorage` is reachable (browser, not SSR/tests). */
function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    // Accessing `localStorage` can throw (disabled cookies, sandboxed iframe).
    return false;
  }
}

/**
 * Build the namespaced storage key for a (world, identity) scope. A missing
 * worldId (no world selected yet) folds to a stable `__none__` token so the
 * pre-world transcript still round-trips instead of being silently dropped.
 */
export function transcriptStorageKey(worldId: string | undefined, identity: string): string {
  return `${STORAGE_PREFIX}${worldId ?? "__none__"}::${identity}`;
}

/**
 * Reduce a transcript to the newest turns whose serialized envelope fits under
 * `MAX_SERIALIZED_CHARS`. Pure so the trimming rule is unit-testable without
 * storage. Drops oldest-first (history scrolls off the top, newest kept), never
 * below `MIN_RETAINED_TURNS` so a single oversized turn cannot empty the log.
 * Returns the same array reference when it already fits (no needless copy).
 */
export function trimToBudget(turns: ChatTurn[]): ChatTurn[] {
  if (serializedSize(turns) <= MAX_SERIALIZED_CHARS) {
    return turns;
  }
  let trimmed = turns;
  while (trimmed.length > MIN_RETAINED_TURNS && serializedSize(trimmed) > MAX_SERIALIZED_CHARS) {
    // Drop the oldest turn; the newest (what the operator wants to re-read) stay.
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

/**
 * Append carry-over turns onto a freshly-loaded destination transcript (F2 world-
 * switch continuity), keeping the result under the size budget. The destination's
 * restored history stays at the top and the carry-over (the operator's live-text
 * "切换到…" bubble + the switch result card) lands on the bottom, so the switch
 * reads as one continuous conversation across the scope swap instead of dropping
 * the in-flight turns.
 *
 * Pure, SSR/quota-agnostic (it touches no storage), and id-deduped: any carry-over
 * turn whose id already exists in `base` is skipped, so a base that somehow already
 * holds the bubble never doubles it. `trimToBudget` then drops oldest-first if the
 * merged transcript exceeds the cap — the newest turns (the carry-over) survive.
 */
export function appendCarryOver(base: ChatTurn[], carry: ChatTurn[]): ChatTurn[] {
  if (carry.length === 0) {
    return base;
  }
  const seen = new Set(base.map((entry) => entry.id));
  const fresh = carry.filter((entry) => !seen.has(entry.id));
  if (fresh.length === 0) {
    return base;
  }
  return trimToBudget([...base, ...fresh]);
}

/** Serialized byte-ish size of a transcript's persisted envelope. */
function serializedSize(turns: ChatTurn[]): number {
  return serialize(turns).length;
}

/** Serialize a transcript into its versioned envelope JSON. */
export function serialize(turns: ChatTurn[]): string {
  const envelope: PersistedEnvelope = { turns, v: SCHEMA_VERSION };
  return JSON.stringify(envelope);
}

/**
 * Parse a persisted envelope back into a transcript. Returns `[]` for any
 * unusable input (absent, corrupt JSON, wrong schema version, non-array turns)
 * so a bad blob degrades to a fresh empty transcript instead of throwing.
 */
export function deserialize(raw: string | null | undefined): ChatTurn[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as PersistedEnvelope).v !== SCHEMA_VERSION
    ) {
      return [];
    }
    const turns = (parsed as PersistedEnvelope).turns;
    return Array.isArray(turns) ? turns : [];
  } catch {
    // Corrupt JSON (truncated write, manual tampering) → start fresh, never crash.
    return [];
  }
}

/**
 * Load a (world, identity) scope's persisted transcript. SSR / no-storage /
 * corrupt-blob safe — always returns a usable array (empty on any failure).
 */
export function loadTranscript(worldId: string | undefined, identity: string): ChatTurn[] {
  if (!hasStorage()) {
    return [];
  }
  try {
    return deserialize(localStorage.getItem(transcriptStorageKey(worldId, identity)));
  } catch {
    return [];
  }
}

/**
 * Persist a (world, identity) scope's transcript, trimming oldest-first to the
 * size budget. An empty transcript clears the slot (so a reset world does not
 * keep a stale blob). Silently no-ops without storage; a write failure (quota)
 * never breaks the chat flow.
 */
export function saveTranscript(
  worldId: string | undefined,
  identity: string,
  turns: ChatTurn[],
): void {
  if (!hasStorage()) {
    return;
  }
  const key = transcriptStorageKey(worldId, identity);
  try {
    if (turns.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, serialize(trimToBudget(turns)));
  } catch {
    // Quota or serialization failures must never break the conversation; the
    // in-memory transcript stays authoritative, only durability is lost.
  }
}

/** Clear a single (world, identity) scope's persisted transcript. */
export function clearTranscript(worldId: string | undefined, identity: string): void {
  if (!hasStorage()) {
    return;
  }
  try {
    localStorage.removeItem(transcriptStorageKey(worldId, identity));
  } catch {
    // Losing the ability to clear is harmless — the next save overwrites it.
  }
}
