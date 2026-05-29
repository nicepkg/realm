import type { TuiDictionary } from "./i18n.ts";
import type { TuiSimAction, TuiState } from "./types.ts";

/**
 * A simulation action that mutates persisted world truth in a way the runtime
 * cannot automatically undo (any tick advance or a fork). The TUI arms one of
 * these instead of writing immediately, mirroring the God-action / role-turn
 * confirmation gates: the operator must re-type the world id to confirm. Even a
 * single `tick 1` gates — like the Web world-simulation tab, there is no
 * fast-path for `ticks === 1`, because a single tick writes irreversible
 * persisted world truth with no automatic undo.
 */
export type TuiPendingSimAction = {
  /** Every tick (including `ticks === 1`) and every fork reaches a gate. */
  action: { kind: "tick"; ticks: number } | { kind: "fork"; label?: string };
  worldId: string;
  worldName: string;
};

export type SimConfirmationDecision = "confirm" | "cancel" | "pending";

/**
 * Returns a pending confirmation for an action that writes irreversible
 * persisted world truth — any tick advance (`ticks >= 1`, including a single
 * tick) or a `fork` — otherwise `undefined` so the caller executes directly.
 * There is no fast-path for `ticks === 1`: like the Web world-simulation tab, a
 * single tick is an irreversible persisted-world write with no automatic undo,
 * so it must gate too. status/pause/resume/export pass straight through (they
 * are read-only or pause/resume, not state-advancing). There is no active world
 * guard here because the caller already short-circuits on a missing world via
 * `simNoWorld`.
 */
export function createSimConfirmation(
  state: TuiState,
  action: TuiSimAction,
): TuiPendingSimAction | undefined {
  if (!state.world) {
    return undefined;
  }
  if (action.kind === "tick") {
    return {
      action: { kind: "tick", ticks: action.ticks },
      worldId: state.world.id,
      worldName: state.world.name,
    };
  }
  if (action.kind === "fork") {
    return {
      action: action.label ? { kind: "fork", label: action.label } : { kind: "fork" },
      worldId: state.world.id,
      worldName: state.world.name,
    };
  }
  return undefined;
}

/**
 * The composer textbox doubles as chat, so a bare "y" must never advance the
 * world by accidental Enter. Confirm requires re-typing the exact world id;
 * only an explicit n/no/cancel aborts; everything else stays pending so stray
 * chat never commits an irreversible write.
 */
export function decideSimConfirmation(
  input: string,
  pending: TuiPendingSimAction,
): SimConfirmationDecision {
  const normalized = input.trim();
  if (normalized === pending.worldId) {
    return "confirm";
  }
  const lower = normalized.toLowerCase();
  if (lower === "n" || lower === "no" || lower === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatSimConfirmation(pending: TuiPendingSimAction, dict: TuiDictionary): string {
  const body =
    pending.action.kind === "tick"
      ? dict.simTickConfirmPrompt(pending.worldName, pending.action.ticks)
      : dict.simForkConfirmPrompt(pending.worldName, pending.action.label ?? dict.defaultValue);
  return [body, dict.simIrreversibleNote, dict.confirmTypeWorldId(pending.worldId)].join(" ");
}
