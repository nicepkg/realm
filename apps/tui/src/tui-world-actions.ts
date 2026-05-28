import type { ConfigPatchProposal } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand, TuiSimAction, TuiState } from "./types.ts";

/**
 * World/role proposal + simulation control collaborators for
 * {@link RealmTuiApp}. These wrap the client calls and notice formatting so the
 * app method bodies stay thin delegators (mirroring runtime-actions.ts and
 * settings-actions.ts). Behavior is identical to the previous inline bodies.
 */

/** Result of a proposal action: the patch to stage plus the notice to surface. */
export type TuiProposalResult = {
  patch: ConfigPatchProposal;
  notice: string;
};

export async function proposeWorldFromTui(
  client: RealmHttpClient,
  command: Extract<TuiCommand, { kind: "createWorld" }>,
  dictionary: TuiDictionary,
): Promise<TuiProposalResult> {
  const payload = await client.proposeWorld({
    id: command.worldId,
    name: command.name,
    mode: command.mode,
  });
  return { patch: payload.patch, notice: dictionary.createWorldProposed(command.worldId) };
}

export async function proposeRoleFromTui(
  client: RealmHttpClient,
  command: Extract<TuiCommand, { kind: "createRole" }>,
  dictionary: TuiDictionary,
): Promise<TuiProposalResult> {
  const payload = await client.proposeRole({
    id: command.roleId,
    displayName: command.displayName,
    model: command.model,
  });
  return { patch: payload.patch, notice: dictionary.createRoleProposed(command.roleId) };
}

/**
 * Drives the simulation runtime for the active world and returns the notice.
 * `reload` is invoked for the actions that mutate world state (tick/resume) so
 * the next render reflects the change, exactly as the original inline body did.
 */
export async function controlSimulationFromTui(
  client: RealmHttpClient,
  state: TuiState,
  action: TuiSimAction,
  dictionary: TuiDictionary,
  reload: () => Promise<void>,
): Promise<string> {
  if (!state.world) {
    return dictionary.simNoWorld;
  }
  const worldId = state.world.id;
  const { simulation } = client;
  if (action.kind === "status") {
    const status = await simulation.getStatus(worldId);
    return dictionary.simStatus(status.paused, status.tick, status.activeRuns.length);
  }
  if (action.kind === "tick") {
    const result = await simulation.runTicks(worldId, { ticks: action.ticks });
    await reload();
    return dictionary.simTicked(result.ticks.length, result.eventCount);
  }
  if (action.kind === "pause") {
    const result = await simulation.pause(worldId, {});
    return dictionary.simPaused(result.stateVersion);
  }
  if (action.kind === "resume") {
    const result = await simulation.resume(worldId, {});
    await reload();
    return dictionary.simResumed(result.stateVersion);
  }
  if (action.kind === "fork") {
    const result = await simulation.fork(worldId, {
      ...(action.label ? { label: action.label } : {}),
    });
    return dictionary.simForked(result.forkId, result.label);
  }
  const result = await simulation.exportWorld(worldId);
  return dictionary.simExported(result.eventCount, result.replayHash);
}
