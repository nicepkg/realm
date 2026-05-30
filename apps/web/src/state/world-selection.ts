import type { WorldSummary } from "@realm/api-contract";

/**
 * Pure, React-free world-selection resolution for `use-realm-app-state.ts`.
 *
 * STALE-SELECTED-WORLD-ROLES root cause lived here, inline in the hook: both the
 * `loadRealm` world resolution and the live `selectedWorld` getter silently fell
 * back to `worlds[0]` whenever the requested world id was not (yet) present in the
 * freshly-loaded roster. For a just-created world that has not landed in the
 * `effective.worlds` snapshot the resolver would snap to `worlds[0]` — the OLD
 * populated world — and then PERSIST that wrong id, so the rail + 高级 sheet showed
 * the old world's roles for a 0-role world and role-targeted NL intents resolved
 * against the wrong roster.
 *
 * The fix splits two distinct intents that the old `?? worlds[0]` chain conflated:
 *   - An EXPLICIT, authoritative selection (the operator/NL just chose this world,
 *     e.g. a freshly created one) MUST win. If it is genuinely absent from the
 *     loaded roster we keep the requested id rather than reverting — a background
 *     reload can never demote a just-made selection to the old world.
 *   - An IMPLICIT restore (boot from a persisted last-world id, or an SSE reload)
 *     MAY self-heal: a stale/removed id falls back to the project default →
 *     `worlds[0]` so the app still opens on a real world.
 *
 * Keeping all of this pure makes every branch unit-testable without rendering the
 * hook, so the resolution can never silently drift back to the buggy fallback.
 */

export type WorldResolutionInput = {
  /** The world id the caller wants opened, or undefined to take the default. */
  preferredWorldId: string | undefined;
  /** The project default world id, used only as an implicit fallback. */
  defaultWorldId: string | undefined;
  /**
   * True when `preferredWorldId` is an authoritative selection (e.g. `selectWorld`
   * for a just-created world). An authoritative id is never demoted to `worlds[0]`
   * when absent — it is treated as not-yet-loaded and reported honestly so the
   * caller keeps the requested selection instead of reverting to the old world.
   */
  authoritative: boolean;
};

export type WorldResolution = {
  /** The world that was actually found in the roster, or undefined when absent. */
  world: WorldSummary | undefined;
  /**
   * The id selection should settle on. For an authoritative-but-absent request
   * this is the REQUESTED id (kept, not reverted); otherwise it is the resolved
   * world's id (self-heal), or undefined when the roster is empty.
   */
  selectedWorldId: string | undefined;
  /** True when an explicit `preferredWorldId` was requested but is not in `worlds`. */
  requestedMissing: boolean;
};

/**
 * Resolve which world a `loadRealm` call should open, separating an authoritative
 * selection (never reverts to `worlds[0]`) from an implicit restore (self-heals).
 */
export function resolveLoadedWorld(
  worlds: WorldSummary[],
  { preferredWorldId, defaultWorldId, authoritative }: WorldResolutionInput,
): WorldResolution {
  const requested = preferredWorldId
    ? worlds.find((candidate) => candidate.id === preferredWorldId)
    : undefined;
  if (requested) {
    return { world: requested, selectedWorldId: requested.id, requestedMissing: false };
  }

  // An explicit id was asked for but is not in the roster.
  if (preferredWorldId) {
    // Authoritative selection (e.g. a just-created world racing a reload): keep the
    // requested id rather than silently snapping to the OLD populated world. The
    // world object is undefined (not yet loaded) but the selection is preserved.
    if (authoritative) {
      return { world: undefined, selectedWorldId: preferredWorldId, requestedMissing: true };
    }
    // Implicit restore of a stale/removed id: fall through to the default chain so
    // the app still opens on a real world instead of getting stuck on a ghost id.
  }

  const fallback =
    worlds.find((candidate) => candidate.id === defaultWorldId) ?? worlds[0] ?? undefined;
  return {
    world: fallback,
    selectedWorldId: fallback?.id,
    requestedMissing: Boolean(preferredWorldId),
  };
}

/**
 * Resolve the live `selectedWorld` value from the loaded roster + the current
 * selected id. NEVER snaps to `worlds[0]` while a concrete id is selected: if the
 * selected world is not in the roster (a just-created world mid-load) we return
 * undefined so the UI reads as "no populated world" rather than impersonating the
 * old world's roster. Only an unset selection (boot before the first load) falls
 * back to the first world so the app is not blank.
 */
export function resolveSelectedWorld(
  worlds: WorldSummary[],
  selectedWorldId: string | undefined,
): WorldSummary | undefined {
  if (selectedWorldId) {
    return worlds.find((world) => world.id === selectedWorldId);
  }
  return worlds[0];
}

/**
 * Decide which world id may be persisted as the last-selected world. Only an id
 * that resolved to a REAL loaded world is persistable, so a not-yet-loaded
 * authoritative selection (or a missing id) never writes a wrong/ghost id that a
 * later reload would restore.
 */
export function persistableWorldId(resolution: WorldResolution): string | undefined {
  return resolution.world?.id;
}

/**
 * App-level (NOT per-world) localStorage key for the operator's last-selected
 * world. Distinct from `viewerStorageKey`, which persists the *viewer identity*
 * scoped to a single world; this remembers *which* world was open so a reload
 * returns to it instead of snapping back to defaultWorldId/worlds[0].
 */
const LAST_WORLD_STORAGE_KEY = "realm:last-world";

/** SSR/private-mode safe read of the persisted last-selected world id. */
export function readLastWorldId(): string | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  try {
    return localStorage.getItem(LAST_WORLD_STORAGE_KEY) ?? undefined;
  } catch {
    // localStorage can throw in locked-down/private contexts; degrade silently.
    return undefined;
  }
}

/** SSR/private-mode safe write of the last-selected world id. */
export function writeLastWorldId(worldId: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(LAST_WORLD_STORAGE_KEY, worldId);
  } catch {
    // Best-effort persistence; a write failure must never break navigation.
  }
}
