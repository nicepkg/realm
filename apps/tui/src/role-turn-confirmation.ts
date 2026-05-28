import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiPendingRoleTurn, TuiState } from "./types.ts";

export type RoleTurnConfirmationDecision = "confirm" | "cancel" | "pending";

export function createRoleTurnConfirmation(
  state: TuiState,
  roleId: string,
  dict: TuiDictionary,
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
    permissionSummary: summarizePermissions(state, dict),
    prompt,
    provider: resolveProvider(state.providerModel, dict),
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
  dict: TuiDictionary,
): string {
  const modelLine = dict.roleTurnModelPermissions(
    pending.provider,
    pending.model,
    pending.permissionSummary,
  );
  const promptSuffix = pending.prompt ? ` ${dict.roleTurnPromptLine(pending.prompt)}` : "";
  return [
    dict.roleTurnRunPrompt(pending.roleLabel, pending.roomName),
    dict.confirmWorldOperator(pending.worldName),
    `${modelLine}${promptSuffix}`,
    dict.confirmYesNo,
    dict.roleTurnCancelHint,
  ].join(" ");
}

function summarizePermissions(state: TuiState, dict: TuiDictionary): string {
  const policy = state.policySummary;
  if (!policy) {
    return dict.permissionTrustUnknown;
  }
  return dict.permissionSummary(
    policy.trustTier,
    policy.allowedCapabilities,
    policy.deniedCapabilities,
    policy.highRiskAllowed,
  );
}

function resolveProvider(providerModel: string | undefined, dict: TuiDictionary): string {
  if (!providerModel) {
    return dict.defaultValue;
  }
  const [provider] = providerModel.split(/[:/]/, 1);
  return provider?.trim() || providerModel;
}

function displayName(identity: string, roles: RoleSummary[]): string {
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}
