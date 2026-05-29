import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
// Membership rule lives in ONE place within the TUI (role-turn-confirmation.ts);
// role-send reuses it so a non-member send is refused with the same precondition.
import { roleIsMemberOfRoom, type TuiRoleTurnBlocked } from "./role-turn-confirmation.ts";
import type { TuiPendingRoleSend, TuiState } from "./types.ts";

export type RoleSendConfirmationDecision = "confirm" | "cancel" | "pending";

export function createRoleSendConfirmation(
  state: TuiState,
  content: string,
): TuiPendingRoleSend | TuiRoleTurnBlocked | undefined {
  if (state.identity === "owner") {
    return undefined;
  }
  if (!state.world || !state.room) {
    return undefined;
  }
  const identityLabel = displayName(state.identity, state.roles);
  if (!roleIsMemberOfRoom(state, state.identity)) {
    return { blocked: "not-member", roleLabel: identityLabel, roomName: state.room.name };
  }
  return {
    content,
    identity: state.identity,
    identityLabel,
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
