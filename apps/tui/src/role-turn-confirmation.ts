import type { RoleSummary, Room } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiPendingRoleTurn, TuiState } from "./types.ts";

export type RoleTurnConfirmationDecision = "confirm" | "cancel" | "pending";

/**
 * Returned instead of a confirmable pending action when the target role/identity
 * is not a member of the room. The caller surfaces it as a named, non-confirmable
 * error (`dict.roleNotInRoom`) so the operator sees WHY the action was refused —
 * a non-member turn/send must never reach a y/n confirm.
 */
export type TuiRoleTurnBlocked = {
  blocked: "not-member";
  roleLabel: string;
  roomName: string;
};

/**
 * Whether `roleId` may act in `room`, mirroring the Web `roomMembersForAvatar`
 * semantics so the TUI and Web enforce ONE precondition: in a `world-main` or
 * `group` room every role (and the owner) is implicitly a member; for any other
 * room type (dm/system/typed) membership is explicit via `room.memberIds`. The
 * owner is always a member (it is the audited real operator, never role-gated).
 *
 * TODO(realm): this predicate duplicates the Web rule (apps/web .../use-message-send.ts
 * + messenger-primitives roomMembersForAvatar). Lift it into packages/* so Web and
 * TUI consume one source of truth. Kept TUI-local this round to keep the diff disjoint.
 */
export function roleIsMemberOfRoom(state: TuiState, roleId: string): boolean {
  const room = state.room;
  if (!room) {
    return false;
  }
  if (roleId === "owner") {
    return true;
  }
  if (roomAdmitsEveryRole(room)) {
    return state.roles.some((role) => role.id === roleId);
  }
  return room.memberIds.includes(roleId);
}

function roomAdmitsEveryRole(room: Room): boolean {
  // `world-main` is the data-layer all-hands type; the api-contract enum narrows
  // to "group" but the runtime may surface "world-main", so accept both to match Web.
  return (room.type as string) === "world-main" || room.type === "group";
}

export function createRoleTurnConfirmation(
  state: TuiState,
  roleId: string,
  dict: TuiDictionary,
  prompt?: string,
): TuiPendingRoleTurn | TuiRoleTurnBlocked | undefined {
  if (!(state.world && state.room)) {
    return undefined;
  }
  const role = state.roles.find((candidate) => candidate.id === roleId);
  if (!role) {
    return undefined;
  }
  const roleLabel = displayName(roleId, state.roles);
  if (!roleIsMemberOfRoom(state, roleId)) {
    return { blocked: "not-member", roleLabel, roomName: state.room.name };
  }
  return {
    model: role.model,
    permissionSummary: summarizePermissions(state, dict),
    prompt,
    provider: resolveProvider(state.providerModel, dict),
    roleId,
    roleLabel,
    roomId: state.room.id,
    roomName: state.room.name,
    worldId: state.world.id,
    worldName: state.world.name,
  };
}

/**
 * Running a role turn is answered in the same composer textbox used for normal
 * chat, so a bare "y" must never commit a turn by accidental Enter. The pending
 * turn carries its roleId, so mirror the God-action bar: require typing the
 * exact role id to confirm. Only an explicit n/no/cancel aborts; anything else
 * stays pending so stray chat never confirms.
 */
export function decideRoleTurnConfirmation(
  input: string,
  pending: TuiPendingRoleTurn,
): RoleTurnConfirmationDecision {
  const normalized = input.trim();
  if (normalized === pending.roleId) {
    return "confirm";
  }
  const lower = normalized.toLowerCase();
  if (lower === "n" || lower === "no" || lower === "cancel") {
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
    dict.confirmTypeRoleId(pending.roleId),
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
