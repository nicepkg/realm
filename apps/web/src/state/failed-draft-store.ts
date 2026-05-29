import type { SendError } from "@/state/realm-app-state-model.ts";

/**
 * Recovery store for unsent user text after a failed send (EP-1, recovery rule).
 *
 * On a failed send the only surviving copy of the typed text lives in
 * `sendError.draft`, and the composer was already cleared. Navigation
 * (world / room / identity switch) clears the pending send state, which would
 * otherwise discard that draft permanently. This store folds the draft back
 * into a recoverable, per-destination slot keyed by (world, room, identity) so
 * returning to that exact room/identity rehydrates the composer.
 *
 * The in-memory map is a fast read-through cache; the durable copy lives in
 * `localStorage` so a draft survives a full reload or crash — matching the TUI
 * on-disk contract (`apps/tui/src/draft-store.ts`), which persists each failed
 * draft to a file keyed per destination. Keys are scoped tightly so a draft
 * authored as one role in one room never leaks into a different room or a
 * different account's composer. All persistence is guarded by a
 * `typeof localStorage !== "undefined"` check so SSR and unit tests stay safe.
 */
export type FailedDraftStore = ReadonlyMap<string, string>;

/** Namespace prefix for every persisted failed-draft slot. */
const STORAGE_PREFIX = "realm:failed-draft:";

/** Build the per-destination key a failed draft is filed under (in-memory map). */
export function failedDraftKey(worldId: string, roomId: string, identity: string): string {
  return `${worldId}::${roomId}::${identity}`;
}

/**
 * Build the namespaced `localStorage` key for a destination, mirroring the TUI's
 * per-id file naming: `realm:failed-draft:<worldId>:<roomId>:<identity>`.
 */
function storageKey(worldId: string, roomId: string, identity: string): string {
  return `${STORAGE_PREFIX}${worldId}:${roomId}:${identity}`;
}

/** True only when a real `localStorage` is available (browser, not SSR/tests). */
function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    // Accessing `localStorage` can throw (disabled cookies, sandboxed iframe).
    return false;
  }
}

/** Persist a single destination's draft; silently no-ops without storage. */
function writeSlot(worldId: string, roomId: string, identity: string, draft: string): void {
  if (!hasStorage()) {
    return;
  }
  try {
    localStorage.setItem(storageKey(worldId, roomId, identity), draft);
  } catch {
    // Quota or serialization failures must never break the send/recover flow.
  }
}

/** Clear a single destination's persisted draft; silently no-ops without storage. */
function clearSlot(worldId: string, roomId: string, identity: string): void {
  if (!hasStorage()) {
    return;
  }
  try {
    localStorage.removeItem(storageKey(worldId, roomId, identity));
  } catch {
    // Ignore — losing the ability to clear is harmless (next stash overwrites).
  }
}

/** Read a single destination's persisted draft, or undefined when absent. */
function readSlot(worldId: string, roomId: string, identity: string): string | undefined {
  if (!hasStorage()) {
    return undefined;
  }
  try {
    return localStorage.getItem(storageKey(worldId, roomId, identity)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fold a failed send's draft into the store before its pending state is cleared,
 * writing it through to `localStorage` so it survives a reload or crash.
 *
 * Returns the same map reference when there is nothing to preserve (no error, no
 * draft, or only whitespace) so callers can skip a needless state update.
 */
export function stashFailedDraft(
  store: FailedDraftStore,
  sendError: SendError | undefined,
): FailedDraftStore {
  const draft = sendError?.draft ?? "";
  if (!sendError || !draft.trim()) {
    return store;
  }
  const { worldId, roomId, displayedAuthorId } = sendError;
  writeSlot(worldId, roomId, displayedAuthorId, draft);
  const next = new Map(store);
  next.set(failedDraftKey(worldId, roomId, displayedAuthorId), draft);
  return next;
}

export type RehydrateResult = {
  /** The draft to seed the composer with, if a recoverable one was found. */
  draft?: string;
  /** The store with the consumed entry removed (same reference when unchanged). */
  store: FailedDraftStore;
};

/**
 * Pull back a stashed draft when a room/identity becomes active again.
 *
 * Reads through to `localStorage` when the in-memory cache misses, so a draft
 * authored before a reload (the in-memory map starts empty after a fresh mount)
 * is still recovered. Only rehydrates when the composer is empty so an
 * in-progress edit is never clobbered, and consumes the entry — both in memory
 * and on disk — so the same draft is not re-applied on a later visit (the user
 * can still type and fail again to re-stash it).
 */
export function rehydrateFailedDraft(
  store: FailedDraftStore,
  params: { worldId: string; roomId: string; identity: string; currentDraft: string },
): RehydrateResult {
  if (params.currentDraft.trim()) {
    return { store };
  }
  const { worldId, roomId, identity } = params;
  const key = failedDraftKey(worldId, roomId, identity);
  // Read-through: prefer the hot in-memory copy, fall back to the durable slot
  // so a reload/crash (empty in-memory map) still recovers the typed text.
  const draft = store.get(key) ?? readSlot(worldId, roomId, identity);
  if (draft === undefined) {
    return { store };
  }
  clearSlot(worldId, roomId, identity);
  if (!store.has(key)) {
    // Persisted-only hit (post-reload): nothing to remove from the cache, but
    // still hand the recovered draft back to the composer.
    return { draft, store };
  }
  const next = new Map(store);
  next.delete(key);
  return { draft, store: next };
}
