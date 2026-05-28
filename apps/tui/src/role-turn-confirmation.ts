import type { RoleSummary } from "@realm/api-contract";
import type { TuiPendingRoleTurn, TuiState } from "./types.ts";

export type RoleTurnConfirmationDecision = "confirm" | "cancel" | "pending";

export function createRoleTurnConfirmation(
  state: TuiState,
  roleId: string,
  prompt?: string,
): TuiPendingRoleTurn | undefined {
  if (!(state.world && state.room)) {
    return undefined;
  }
  const role = state.roles.find((candidate) => candidate.id === roleId);
  if (!role) {
    return undefined;
  }
  return {
    prompt,
    roleId,
    roleLabel: displayName(roleId, state.roles),
    roomId: state.room.id,
    roomName: state.room.name,
    worldId: state.world.id,
    worldName: state.world.name,
  };
}

export function decideRoleTurnConfirmation(input: string): RoleTurnConfirmationDecision {
  const normalized = input.trim().toLowerCase();
  if (normalized === "y" || normalized === "yes" || normalized === "confirm") {
    return "confirm";
  }
  if (normalized === "n" || normalized === "no" || normalized === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatRoleTurnConfirmation(pending: TuiPendingRoleTurn): string {
  const prompt = pending.prompt ? ` Prompt: ${pending.prompt}` : "";
  return [
    `Run ${pending.roleLabel} in ${pending.roomName}?`,
    `World: ${pending.worldName}. Real operator: Boss.${prompt}`,
    "Type y to confirm or n to cancel.",
  ].join(" ");
}

function displayName(identity: string, roles: RoleSummary[]): string {
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
