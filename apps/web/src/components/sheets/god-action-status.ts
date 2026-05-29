import type { Locale } from "@/i18n/index.tsx";
import type { GodRoleAction } from "@/state/use-realm-app-state.ts";

/**
 * Lifecycle status of a God-action target role, read from the simulation world
 * state at `metaState.roles.<roleId>`. Values are `undefined` when the world
 * does not track role lifecycle (e.g. non-simulation worlds), in which case
 * every action stays enabled so those worlds are never blocked.
 */
export type RoleLifecycleStatus = {
  alive: boolean | undefined;
  muted: boolean | undefined;
};

const UNKNOWN_STATUS: RoleLifecycleStatus = { alive: undefined, muted: undefined };

/** The God-action types in their canonical display order. */
export const GOD_ROLE_ACTIONS: readonly GodRoleAction[] = ["mute", "kill", "revive"];

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Null-safe read of a role's `{alive, muted}` lifecycle from world state.
 *
 * Looks up `state.metaState.roles[roleId]`. If world state, the role entry, or
 * the fields are absent (a non-simulation world, or a role the world does not
 * track), returns `{alive: undefined, muted: undefined}` so callers treat the
 * status as unknown and allow ALL actions rather than blocking the operator.
 */
export function readRoleLifecycleStatus(
  state: Record<string, unknown> | undefined,
  roleId: string | undefined,
): RoleLifecycleStatus {
  if (!state || !roleId) {
    return UNKNOWN_STATUS;
  }
  const metaState = state.metaState;
  if (!metaState || typeof metaState !== "object") {
    return UNKNOWN_STATUS;
  }
  const roles = (metaState as Record<string, unknown>).roles;
  if (!roles || typeof roles !== "object") {
    return UNKNOWN_STATUS;
  }
  const entry = (roles as Record<string, unknown>)[roleId];
  if (!entry || typeof entry !== "object") {
    return UNKNOWN_STATUS;
  }
  const record = entry as Record<string, unknown>;
  return {
    alive: readBoolean(record.alive),
    muted: readBoolean(record.muted),
  };
}

/**
 * Whether a God action is valid for the target's current lifecycle status.
 *
 * Rules (any field that is `undefined` does not constrain — unknown status
 * leaves every action enabled):
 * - `revive` requires the role NOT be alive (alive===true disables revive).
 * - `kill` requires the role be alive (alive===false disables kill).
 * - `mute` requires the role be alive AND not already muted
 *   (alive===false or muted===true disables mute).
 */
export function isActionValidForStatus(
  action: GodRoleAction,
  status: RoleLifecycleStatus,
): boolean {
  switch (action) {
    case "revive":
      return status.alive !== true;
    case "kill":
      return status.alive !== false;
    case "mute":
      return status.alive !== false && status.muted !== true;
    default:
      return true;
  }
}

/** First action valid for the given status, or `undefined` when none is. */
export function firstValidAction(status: RoleLifecycleStatus): GodRoleAction | undefined {
  return GOD_ROLE_ACTIONS.find((action) => isActionValidForStatus(action, status));
}

/**
 * Build a calm one-line status label like `存活 · 未禁言` from the resolved
 * status using the R2-4 i18n keys. Returns `undefined` when lifecycle is
 * unknown so the caller can hide the line entirely.
 */
export function statusLabelParts(
  status: RoleLifecycleStatus,
  t: (key: string) => string,
): string | undefined {
  if (status.alive === undefined && status.muted === undefined) {
    return undefined;
  }
  const parts: string[] = [];
  if (status.alive !== undefined) {
    parts.push(t(status.alive ? "sheet.god.statusAlive" : "sheet.god.statusDead"));
  }
  if (status.muted !== undefined) {
    parts.push(t(status.muted ? "sheet.god.statusMuted" : "sheet.god.statusUnmuted"));
  }
  return parts.join(" · ");
}

/**
 * File-local consequence copy for the God adjudication gate — mirrors
 * `world-simulation-tab`'s `consequenceCopy` pattern so the operator sees, right
 * where they type to confirm, exactly what the selected action will DO to the
 * named role in the named world. Kept here (not in the shared i18n dict) so the
 * gate's risk phrasing lives next to the gate's logic and stays per-action.
 */
export const godConsequenceCopy: Record<
  Locale,
  {
    kill: (role: string, world: string) => string;
    mute: (role: string, world: string) => string;
    revive: (role: string, world: string) => string;
  }
> = {
  "zh-CN": {
    kill: (role, world) => `处决 ${role}：该角色将停止参与回合，并在 ${world} 中被标记为死亡。`,
    mute: (role, world) => `禁言 ${role}：该角色将在 ${world} 中被禁止发言。`,
    revive: (role, world) => `复活 ${role}：该角色将在 ${world} 中恢复参与回合。`,
  },
  en: {
    kill: (role, world) =>
      `Kill ${role}: the role stops taking turns and is marked dead in ${world}.`,
    mute: (role, world) => `Mute ${role}: the role is silenced in ${world}.`,
    revive: (role, world) => `Revive ${role}: the role resumes taking turns in ${world}.`,
  },
};

/**
 * Localized one-line consequence sentence naming both the target role and the
 * world-truth effect of the chosen God action. Selects the per-action phrasing
 * from {@link godConsequenceCopy} for the active locale.
 */
export function godConsequenceText(
  action: GodRoleAction,
  roleLabel: string,
  worldName: string,
  locale: Locale,
): string {
  return godConsequenceCopy[locale][action](roleLabel, worldName);
}
