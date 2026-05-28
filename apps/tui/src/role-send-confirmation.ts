import type { RoleSummary } from "@realm/api-contract";
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

export function formatRoleSendConfirmation(pending: TuiPendingRoleSend): string {
  return [
    `Send as ${pending.identityLabel} to ${pending.roomName}?`,
    `World: ${pending.worldName}. Real operator: Boss.`,
    "Type y to confirm or n to cancel.",
  ].join(" ");
}

function displayName(identity: string, roles: RoleSummary[]): string {
  if (identity === "god") {
    return "God";
  }
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
