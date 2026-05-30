import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import { worldScopedRoles } from "@/state/use-god-chat-helpers.ts";

/**
 * Pure, React-free run-turn subject resolution for `use-realm-app-state.ts`.
 *
 * Split into this co-located helper so the hook file stays under the 500-line
 * file-size guard while the active-world scoping stays deterministically
 * unit-testable without rendering the hook.
 */

/**
 * Resolve the run-turn subject role, scoped to the ACTIVE world.
 *
 * `pool` is the project-wide role roster (`state.roles`); a bare `pool[0]` fallback
 * picks the GLOBAL first role across ALL worlds — so when the active world is, say,
 * 赛博修真世界 (only member 云遥) but 云遥 isn't the global first, the run-turn quick
 * action would bind a FOREIGN-world role (顾辰风 from 云岭). Scope the fallback to the
 * active world's members via the same `worldScopedRoles` source the right rail's
 * "本世界角色" uses, so the palette label (`app.selectedRole.displayName`), the run
 * gate (`canRunRoleTurn`), the god-sheet candidate, and the run-turn preview all
 * agree on an active-world role.
 *
 * Resolution order:
 *   1. `runRoleId` match (the explicitly selected subject) — primary path, unchanged.
 *   2. the active world's FIRST member (world-scoped, not the global pool).
 *   3. undefined when the active world has zero members — run-turn is then correctly
 *      gated/disabled rather than silently bound to a foreign-world role.
 */
export function resolveSelectedRole(
  pool: RoleSummary[],
  selectedWorld: WorldSummary | undefined,
  runRoleId: string | undefined,
): RoleSummary | undefined {
  const explicit = pool.find((role) => role.id === runRoleId);
  if (explicit) {
    return explicit;
  }
  const scoped = worldScopedRoles(pool, selectedWorld, selectedWorld?.id);
  return scoped[0];
}
