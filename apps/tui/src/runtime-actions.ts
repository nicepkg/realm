import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand, TuiPendingGodAction, TuiState } from "./types.ts";

export async function applyGodActionFromTui(
  client: RealmHttpClient,
  pending: TuiPendingGodAction,
): Promise<void> {
  await client.applyGodRoleAction(pending.worldId, {
    action: pending.action,
    idempotencyKey: `tui-god-${pending.action}-${pending.targetRoleId}-${Date.now()}`,
    reason: pending.reason,
    targetRoleId: pending.targetRoleId,
  });
}

export async function createRuntimeRoom(
  client: RealmHttpClient,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "createRoom" }>,
  dictionary: TuiDictionary,
): Promise<{ notice: string; roomId?: string }> {
  if (!state.world) {
    return { notice: dictionary.noWorld };
  }
  const response = await client.createRoom(state.world.id, {
    idempotencyKey: `tui-room-${Date.now()}`,
    memberIds: command.memberIds,
    name: command.name,
    type: command.roomType,
  });
  return {
    notice: dictionary.roomCreated(response.room.name),
    roomId: response.room.id,
  };
}

export async function runRoleTurnFromTui(
  client: RealmHttpClient,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "runRole" }>,
  dictionary: TuiDictionary,
): Promise<string> {
  if (!(state.world && state.room)) {
    return dictionary.cannotSendWithoutContext;
  }
  const role = state.roles.find((candidate) => candidate.id === command.roleId);
  if (!role) {
    return dictionary.unknownRole(command.roleId);
  }
  const response = await client.runRoleTurn(state.room.id, {
    prompt: command.prompt,
    roleId: role.id,
    worldId: state.world.id,
  });
  return dictionary.roleTurnCompleted(role.displayName, response.message.id);
}
