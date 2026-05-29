import type { RealmHttpClient } from "@realm/client-sdk";
import { rollbackConfigFromTui } from "./config-rollback-actions.ts";
import type { TuiDictionary } from "./i18n.ts";
import {
  createModelChangeConfirmation,
  decideModelChangeConfirmation,
  formatModelChangeConfirmation,
  type TuiPendingModelChange,
} from "./model-confirmation.ts";
import { loadDefaultModel } from "./settings-actions.ts";
import {
  createSimConfirmation,
  decideSimConfirmation,
  formatSimConfirmation,
  type TuiPendingSimAction,
} from "./sim-confirmation.ts";
import { controlSimulationFromTui } from "./tui-world-actions.ts";
import type { TuiSimAction, TuiState } from "./types.ts";

/**
 * Mutable bag for the two extra gates the shared {@link TuiPendingConfirmations}
 * record does not cover: an irreversible simulation action (multi-tick / fork)
 * and a default-model change. Held separately so the role-send/identity/God/
 * role-turn record stays untouched, while keeping the resolve/arm logic out of
 * the app body (which must stay under the file-size budget).
 */
export type TuiExtendedPending = {
  sim?: TuiPendingSimAction;
  modelChange?: TuiPendingModelChange;
};

/**
 * Collaborator the app provides so this module can drive its load/reload
 * lifecycle and default-model write without owning the app's private state.
 */
export type ExtendedConfirmationContext = {
  readonly client: RealmHttpClient;
  readonly dictionary: TuiDictionary;
  readonly pending: TuiExtendedPending;
  load(): Promise<TuiState>;
  reload(): Promise<void>;
  updateDefaultModel(provider: string, model: string): Promise<void>;
  /** Clears the sibling role-send/role-turn/God confirmations on the app. */
  clearRoleConfirmations(): void;
};

/**
 * Either arms an irreversible-sim confirmation (multi-tick / fork) and returns
 * its prompt, or — for the non-destructive actions and a single `tick 1` —
 * executes immediately. Mirrors the God-action gate: status/pause/resume/export
 * and `tick 1` pass straight through; everything else waits for the operator to
 * re-type the world id.
 */
export async function armOrRunSimAction(
  context: ExtendedConfirmationContext,
  action: TuiSimAction,
): Promise<string> {
  const state = await context.load();
  const pending = createSimConfirmation(state, action);
  if (pending) {
    context.pending.sim = pending;
    context.pending.modelChange = undefined;
    context.clearRoleConfirmations();
    return formatSimConfirmation(pending, context.dictionary);
  }
  return controlSimulationFromTui(context.client, state, action, context.dictionary, () =>
    context.reload(),
  );
}

/** Resolves an armed sim confirmation against the operator's latest input. */
export async function resolveSimConfirmation(
  context: ExtendedConfirmationContext,
  trimmed: string,
): Promise<string> {
  const pending = context.pending.sim;
  if (!pending) {
    return context.dictionary.simActionCancelled;
  }
  const decision = decideSimConfirmation(trimmed, pending);
  if (decision === "cancel") {
    context.pending.sim = undefined;
    return context.dictionary.simActionCancelled;
  }
  if (decision === "pending") {
    return formatSimConfirmation(pending, context.dictionary);
  }
  context.pending.sim = undefined;
  return controlSimulationFromTui(
    context.client,
    await context.load(),
    pending.action,
    context.dictionary,
    () => context.reload(),
  );
}

/** Resolves an armed model-change confirmation against the latest input. */
export async function resolveModelChangeConfirmation(
  context: ExtendedConfirmationContext,
  trimmed: string,
): Promise<string> {
  const pending = context.pending.modelChange;
  if (!pending) {
    return context.dictionary.modelChangeCancelled;
  }
  const decision = decideModelChangeConfirmation(trimmed);
  if (decision === "cancel") {
    context.pending.modelChange = undefined;
    return context.dictionary.modelChangeCancelled;
  }
  if (decision === "pending") {
    return formatModelChangeConfirmation(pending, context.dictionary);
  }
  context.pending.modelChange = undefined;
  await context.updateDefaultModel(pending.nextProvider, pending.nextModel);
  return context.dictionary.modelChanged(`${pending.nextProvider}/${pending.nextModel}`);
}

/**
 * Arms a model-change confirmation, echoing the current default model so the
 * operator sees the before/after pair before any write happens.
 */
export async function armModelChange(
  context: ExtendedConfirmationContext,
  provider: string,
  model: string,
): Promise<string> {
  const current = await loadDefaultModel(context.client);
  const pending = createModelChangeConfirmation(current, { provider, model });
  context.pending.modelChange = pending;
  context.pending.sim = undefined;
  context.clearRoleConfirmations();
  return formatModelChangeConfirmation(pending, context.dictionary);
}

/**
 * Rolls config back to `historyId` (or the implicit `fallbackHistoryId` when the
 * operator omitted one). Returns the notice plus whether a write actually
 * happened so the caller can refresh state and clear its stale last-applied id.
 */
export async function rollbackConfig(
  context: ExtendedConfirmationContext,
  historyId: string | undefined,
  fallbackHistoryId: string | undefined,
): Promise<{ notice: string; rolledBack: boolean }> {
  const target = historyId ?? fallbackHistoryId;
  const notice = await rollbackConfigFromTui(context.client, target, context.dictionary);
  if (!target) {
    return { notice, rolledBack: false };
  }
  await context.reload();
  return { notice, rolledBack: true };
}
