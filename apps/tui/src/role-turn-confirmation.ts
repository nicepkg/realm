import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
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
    model: role.model,
    permissionSummary: summarizePermissions(state),
    prompt,
    provider: resolveProvider(state.providerModel),
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

export function formatRoleTurnConfirmation(
  pending: TuiPendingRoleTurn,
  dict?: TuiDictionary,
): string {
  const prompt = pending.prompt ? ` Prompt: ${pending.prompt}` : "";
  const cancelLine = dict?.roleTurnCancelHint ?? "Ctrl+C cancels the active turn.";
  return [
    `Run ${pending.roleLabel} in ${pending.roomName}?`,
    `World: ${pending.worldName}. Real operator: Boss.`,
    `Model: ${pending.provider} / ${pending.model}. Permissions: ${pending.permissionSummary}.${prompt}`,
    "Type y to confirm or n to cancel.",
    cancelLine,
  ].join(" ");
}

function summarizePermissions(state: TuiState): string {
  const policy = state.policySummary;
  if (!policy) {
    return "trust tier unknown";
  }
  return `trust ${policy.trustTier}, ${policy.allowedCapabilities} allowed / ${policy.deniedCapabilities} denied / ${policy.highRiskAllowed} high-risk`;
}

function resolveProvider(providerModel: string | undefined): string {
  if (!providerModel) {
    return "default";
  }
  const [provider] = providerModel.split(/[:/]/, 1);
  return provider?.trim() || providerModel;
}

function displayName(identity: string, roles: RoleSummary[]): string {
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
