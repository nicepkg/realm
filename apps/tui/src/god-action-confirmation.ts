import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand, TuiPendingGodAction, TuiState } from "./types.ts";

export type GodActionConfirmationDecision = "confirm" | "cancel" | "pending";

export function createGodActionConfirmation(
  state: TuiState,
  command: Extract<TuiCommand, { kind: "god" }>,
): TuiPendingGodAction | undefined {
  if (!state.world) {
    return undefined;
  }
  return {
    action: command.action,
    reason: command.reason,
    targetRoleId: command.targetRoleId,
    targetRoleLabel: displayName(command.targetRoleId, state.roles),
    worldId: state.world.id,
    worldName: state.world.name,
  };
}

export function decideGodActionConfirmation(
  input: string,
  pending: TuiPendingGodAction,
): GodActionConfirmationDecision {
  const normalized = input.trim();
  if (normalized === pending.targetRoleId) {
    return "confirm";
  }
  const lower = normalized.toLowerCase();
  if (lower === "n" || lower === "no" || lower === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatGodActionConfirmation(
  pending: TuiPendingGodAction,
  dict: TuiDictionary,
): string {
  return [
    dict.godActionPrompt(pending.action, pending.targetRoleLabel, pending.worldName),
    dict.godActionReasonLine(pending.reason),
    dict.confirmTypeRoleId(pending.targetRoleId),
  ].join(" ");
}

function displayName(identity: string, roles: RoleSummary[]): string {
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
