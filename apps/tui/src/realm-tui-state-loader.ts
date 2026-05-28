import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiOptions } from "./tui-options.ts";
import type { TuiPolicySummary, TuiState } from "./types.ts";

export type TuiStateLoadRequest = {
  options: TuiOptions;
  previous?: TuiState;
  roomOverride?: string;
  selectedRoomId?: string;
  selectedWorldId?: string;
};

export async function loadTuiState(
  client: RealmHttpClient,
  request: TuiStateLoadRequest,
): Promise<TuiState> {
  const effective = await client.getEffectiveConfig();
  const world =
    effective.worlds.find((candidate) => candidate.id === request.selectedWorldId) ??
    effective.worlds.find((candidate) => candidate.id === effective.project.defaultWorldId) ??
    effective.worlds[0];
  const rooms = world ? (await client.listRooms(world.id)).rooms : [];
  const room =
    rooms.find(
      (candidate) =>
        candidate.id === (request.roomOverride ?? request.selectedRoomId ?? request.options.roomId),
    ) ??
    rooms.find((candidate) => candidate.id === world?.defaultRoomId) ??
    rooms[0];
  const messages = room ? (await client.listMessages(room.id)).messages : [];
  const [eventsPage, settings, policy] = await Promise.all([
    client.listEvents(),
    client.getSettings(),
    client.getEffectivePolicy(),
  ]);
  const worldState = world ? await client.getWorldState(world.id) : undefined;
  const previous = request.previous;

  return {
    assistantProposal: previous?.assistantProposal,
    events: eventsPage.events,
    identity: request.options.identity ?? previous?.identity ?? "owner",
    lastPatchApply: previous?.lastPatchApply,
    memoryInspection: previous?.memoryInspection,
    messages,
    policySummary: summarizePolicy(policy),
    projectName: effective.project.name,
    providerModel: `${settings.user.defaultProvider}/${settings.user.defaultModel}`,
    roles: effective.roles,
    room,
    rooms,
    settingsSummary: previous?.settingsSummary,
    stateInspection: previous?.stateInspection,
    world,
    worlds: effective.worlds,
    worldState: worldState
      ? {
          state: worldState.state,
          version: worldState.version,
        }
      : undefined,
  };
}

function summarizePolicy(
  policy: Awaited<ReturnType<RealmHttpClient["getEffectivePolicy"]>>,
): TuiPolicySummary {
  return {
    allowedCapabilities: policy.capabilities.filter((capability) => capability.allow).length,
    deniedCapabilities: policy.capabilities.filter((capability) => !capability.allow).length,
    highRiskAllowed: policy.capabilities.filter(
      (capability) => capability.allow && capability.highRisk,
    ).length,
    trustTier: policy.trustTier,
    warnings: policy.warnings,
  };
}
