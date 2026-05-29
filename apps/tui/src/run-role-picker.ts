import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiState } from "./types.ts";

/**
 * Roles eligible for a `:run-role` turn in the current room: the role set that
 * is both visible config-side AND a member of the active room. Mirrors the Web
 * member-of-room gate so the TUI never offers a role the room cannot run.
 */
export function roomMemberRoles(state: TuiState): RoleSummary[] {
  const memberIds = new Set(state.room?.memberIds ?? []);
  return state.roles.filter((role) => memberIds.has(role.id));
}

/**
 * Renders the `:run-role` (no role id) picker: a printed list of current
 * room-member roles by `displayName (id)` so the operator can copy an id back
 * into `:run-role <id>`. Returns a calm "no members" notice when the room has
 * none, never an error.
 */
export function formatRunRolePicker(state: TuiState, dict: TuiDictionary): string {
  const members = roomMemberRoles(state);
  if (members.length === 0) {
    return dict.runRoleNoMembers;
  }
  const lines = members.map((role) => `  - ${role.displayName} (${role.id})`);
  return [dict.runRoleNeedsRole, ...lines].join("\n");
}
