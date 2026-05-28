import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiPendingRoleSend, TuiState } from "./types.ts";

export type RoleSendConfirmationDecision = "confirm" | "cancel" | "pending";

export function createRoleSendConfirmation(
  state: TuiState,
  content: string,
): TuiPendingRoleSend | undefined {
  if (state.identity === "owner") {
    return undefined;
  }
  if (!state.world || !state.room) {
    return undefined;
  }
  return {
    content,
    identity: state.identity,
    identityLabel: displayName(state.identity, state.roles),
    roomId: state.room.id,
    roomName: state.room.name,
    worldId: state.world.id,
    worldName: state.world.name,
  };
}

export function decideRoleSendConfirmation(input: string): RoleSendConfirmationDecision {
  const normalized = input.trim().toLowerCase();
  if (normalized === "y" || normalized === "yes" || normalized === "confirm") {
    return "confirm";
  }
  if (normalized === "n" || normalized === "no" || normalized === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatRoleSendConfirmation(
  pending: TuiPendingRoleSend,
  dict: TuiDictionary,
): string {
  return [
    dict.roleSendPrompt(pending.identityLabel, pending.roomName),
    dict.confirmWorldOperator(pending.worldName),
    dict.confirmYesNo,
  ].join(" ");
}

function displayName(identity: string, roles: RoleSummary[]): string {
  if (identity === "god") {
    return "God";
  }
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
