import type { RealmHttpClient } from "@realm/client-sdk";
import { applyPendingConfigPatchFromTui } from "./config-patch-actions.ts";
import type { TuiDictionary, TuiLocale } from "./i18n.ts";
import { inspectRoleMemoryForTui, inspectWorldStateForTui } from "./inspection-actions.ts";
import { runRoleTurnFromTui } from "./runtime-actions.ts";
import type { TuiCommand, TuiState } from "./types.ts";

/**
 * State-mutating command delegators extracted from {@link RealmTuiApp} to keep
 * its body under the file-size budget. Each returns the notice plus the next
 * `state` (when the action recomputes one) so the app can assign it; behavior
 * is identical to the previous inline method bodies. The app still owns the
 * `state`/`lastConfigHistoryId` fields and reload lifecycle.
 */
export type StateMutationDeps = {
  readonly client: RealmHttpClient;
  readonly dictionary: TuiDictionary;
  readonly locale: TuiLocale;
  load(): Promise<TuiState>;
  reload(): Promise<void>;
};

export type StateMutationResult = { notice: string; state?: TuiState };

export async function inspectWorldStateMutation(
  deps: StateMutationDeps,
  path: string | undefined,
): Promise<StateMutationResult> {
  const inspected = inspectWorldStateForTui(await deps.load(), deps.locale, path, deps.dictionary);
  return { notice: inspected.notice, state: inspected.state };
}

export async function inspectRoleMemoryMutation(
  deps: StateMutationDeps,
  roleId: string,
): Promise<StateMutationResult> {
  const inspected = await inspectRoleMemoryForTui(
    deps.client,
    await deps.load(),
    roleId,
    deps.locale,
    deps.dictionary,
  );
  return { notice: inspected.notice, state: inspected.state };
}

export async function runRoleTurnMutation(
  deps: StateMutationDeps,
  command: Extract<TuiCommand, { kind: "runRole" }>,
): Promise<string> {
  const notice = await runRoleTurnFromTui(deps.client, await deps.load(), command, deps.dictionary);
  await deps.reload();
  return notice;
}

/**
 * Applies the staged config patch, then reloads and stamps `lastPatchApply`.
 * Returns the new state, the rollback-hinted notice, and the history id so the
 * app can remember it for a bare `:rollback`. On failure the result carries
 * just the notice.
 */
export async function applyConfigPatchMutation(
  deps: StateMutationDeps,
  confirmation: string | undefined,
): Promise<{ notice: string; state?: TuiState; historyId?: string }> {
  const state = await deps.load();
  const applied = await applyPendingConfigPatchFromTui(
    deps.client,
    state.assistantProposal,
    confirmation,
    deps.dictionary,
  );
  if (!applied.result) {
    return { notice: applied.notice };
  }
  await deps.reload();
  const reloaded = await deps.load();
  return {
    notice: `${applied.notice} ${deps.dictionary.rollbackHint}`,
    state: { ...reloaded, assistantProposal: undefined, lastPatchApply: applied.result },
    historyId: applied.result.historyId,
  };
}
