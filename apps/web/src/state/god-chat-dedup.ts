import type { RoleSummary } from "@realm/api-contract";

/**
 * Add-role de-duplication (P2) — pure helpers that let the God-chat brain detect a
 * same-name role ALREADY loaded and refuse to mint a second one ("加一个叫云遥…"
 * twice must never yield two 云遥 / a role-1 twin). Kept React-free + co-located so
 * it stays unit-testable and the runtime file stays under the 500-line budget.
 */

/**
 * Title templates the planner emits for an add-role proposal, both English
 * ("Add role 云遥" / "add a role: 云遥" / "create role 云遥") and the zh-CN forms
 * `localizeProposalTitle` produces ("新增角色「云遥」"). The capture group is the
 * requested display name.
 */
const ADD_ROLE_TITLE_PATTERNS: RegExp[] = [
  /^add role[:\s-]+(.+)$/i,
  /^add a role[:\s-]+(.+)$/i,
  /^create role[:\s-]+(.+)$/i,
  /^create a role[:\s-]+(.+)$/i,
  /^新增角色[「:\s-]*([^」]+)」?$/,
  /^新增一个角色[「:\s-]*([^」]+)」?$/,
];

/**
 * Pull the requested role display name out of an add-role proposal title. Returns
 * the trimmed name for an add-role proposal; undefined for any other proposal
 * (world creation, rule edits) so those still stage normally.
 */
export function extractAddRoleName(title: string): string | undefined {
  const trimmed = title.trim();
  for (const pattern of ADD_ROLE_TITLE_PATTERNS) {
    const name = trimmed.match(pattern)?.[1]?.trim();
    if (name) {
      return name;
    }
  }
  return undefined;
}

/**
 * Find a role already loaded whose display name matches `name` (case/space-folded).
 * Used to short-circuit an add-role proposal when the role already exists (P2).
 */
export function findRoleByDisplayName(roles: RoleSummary[], name: string): RoleSummary | undefined {
  const target = name.trim().toLowerCase();
  if (target.length === 0) {
    return undefined;
  }
  return roles.find((role) => role.displayName.trim().toLowerCase() === target);
}
