import type { RealmEvent } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";

/**
 * In-flight role turn the TUI is currently driving. Tracked so the interactive
 * session can render two-phase running feedback (running -> success / error /
 * cancelled) and so the FIRST Ctrl+C can cancel this turn instead of arming the
 * exit timer. Mirrors the Web `TurnRunState` minus the React-only streamed-text
 * folding (the TUI repaints whole frames rather than diffing tokens).
 */
export type TuiActiveTurn = {
  /** Server turn id from `startRoleTurn`, used as the cancel target. */
  turnId: string;
  /** Display name of the in-flight role, surfaced in the status/footer lines. */
  roleLabel: string;
  roleId: string;
  /** Epoch ms when the turn started, used to tick the elapsed counter. */
  startedAt: number;
};

export type TuiTurnOutcome = "completed" | "failed" | "cancelled";

/**
 * Resolves whether the tracked turn has reached a terminal state by scanning the
 * authoritative event log (the same list `loadTuiState` refreshes on every
 * poll). Returns the terminal outcome, or `undefined` while the turn is still
 * running so the caller keeps polling. Idempotent: re-scanning a replayed event
 * stream yields the same outcome.
 */
export function resolveTurnOutcome(
  events: RealmEvent[],
  turnId: string,
): TuiTurnOutcome | undefined {
  for (const event of events) {
    if (event.type === "turn.completed" && event.turn.id === turnId) {
      return "completed";
    }
    if (event.type === "turn.failed" && event.turn.id === turnId) {
      return "failed";
    }
    if (event.type === "turn.cancelled" && event.turn.id === turnId) {
      return "cancelled";
    }
  }
  return undefined;
}

/** Formats elapsed wall-clock time as `m:ss`, clamped at zero. */
export function formatElapsed(startedAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** One-line running status: `running <role> · m:ss`. */
export function formatActiveTurnStatus(
  active: TuiActiveTurn,
  dict: TuiDictionary,
  now: number,
): string {
  return dict.turnRunning(active.roleLabel, formatElapsed(active.startedAt, now));
}

/** Maps a terminal outcome to the notice the operator should see. */
export function describeTurnOutcome(
  outcome: TuiTurnOutcome,
  active: TuiActiveTurn,
  dict: TuiDictionary,
): string {
  if (outcome === "completed") {
    return dict.turnSucceeded(active.roleLabel);
  }
  if (outcome === "failed") {
    return dict.turnFailed(active.roleLabel);
  }
  return dict.roleTurnCancelled;
}
