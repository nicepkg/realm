import type { AssistantConfigPlan } from "./index.ts";

/**
 * NL intent contract — the shared vocabulary the whole NL-first vision rests on.
 * Free operator text maps to one of these action families, each carrying a
 * structured payload that the web hook later feeds to the SDK.
 *
 * This module is PURE TYPES: no runtime, no React, no network. The deterministic
 * classifier ({@link ./intent-classifier.ts}) and the model-backed router
 * ({@link ./intent-router.ts}) both produce these shapes.
 *
 * Mapping contract (values mirror @realm/api-contract request schemas; we keep
 * local string-literal unions instead of importing @realm/core so this package
 * stays dependency-light and the web hook owns the SDK call):
 *  - config     → world/role/rule creation via the existing config planner
 *  - god        → adjudication (kill/mute/revive) → godRoleAction shape
 *  - state-patch→ attribute/condition writes → adminPatchState shape
 *  - run-turn   → run one role's turn in a room
 *  - inspect    → read/answer about world state or a role's memory
 */

/** God adjudication actions, matching @realm/api-contract godRoleActionTypeSchema. */
export type GodAction = "kill" | "mute" | "revive";

/** Read targets the inspect family can answer. */
export type InspectTarget = "world-state" | "role-memory";

/**
 * Trust tiers the operator can request by plain language. Today the only
 * elevation the chat surface exposes is read-only → run-roles (let roles take
 * turns / write state). Kept as a string-literal union so adding tiers later is
 * a one-line change and the web hook can `switch` exhaustively.
 */
export type TrustTier = "run-roles";

/**
 * A single state-patch operation. Mirrors @realm/core statePatchOperationSchema
 * (subset the deterministic router emits: set/increment/append). `path` is a
 * JSON Pointer (must start with "/").
 */
export type IntentStateOperation =
  | { op: "set"; path: string; value: unknown }
  | { op: "increment"; path: string; amount: number }
  | { op: "append"; path: string; value: unknown };

export type RealmIntent =
  | { kind: "config"; goal: string; plan: AssistantConfigPlan }
  | { kind: "god"; targetRoleId: string; action: GodAction; reason: string }
  | {
      kind: "state-patch";
      worldId: string;
      operations: IntentStateOperation[];
      reason: string;
    }
  | { kind: "run-turn"; roleId: string; roomId: string }
  /**
   * Operator asks to switch the active world by name ("切换到云岭修仙界 / 打开 …").
   * Resolved to a concrete `worldId` here (name→id matched against
   * {@link IntentRouterContext.worlds}) so the web hook can call `selectWorld`
   * directly. Surfaced as its own intent so a world change is NEVER mis-read as a
   * world-state inspect ("现在世界什么状态？") — the catch-all inspect is the LAST
   * resort, never the path a clear switch command falls into.
   */
  | { kind: "world-switch"; worldId: string }
  | { kind: "inspect"; target: InspectTarget; roleId?: string; query: string }
  /**
   * Operator asks to leave read-only mode (e.g. "提升信任等级 / 允许运行角色").
   * Surfaced as its own intent so the web hook routes it to the trust-elevation
   * confirm card instead of misreading it as a config proposal — a config edit
   * itself needs trust, which would otherwise dead-loop the operator.
   */
  | { kind: "trust-elevation"; tier: TrustTier };

export type IntentRouterRole = { id: string; displayName: string };
export type IntentRouterRoom = { id: string };
/** A world the operator can name to switch into (id + user-facing name). */
export type IntentRouterWorld = { id: string; name: string };

export interface IntentRouterContext {
  roles: IntentRouterRole[];
  rooms: IntentRouterRoom[];
  /**
   * All worlds in the project, used to resolve a world-switch command's named
   * target ("切换到云岭修仙界") to a concrete id. Optional / empty when the host
   * has not wired the roster yet — the classifier then cannot resolve a switch
   * and falls back to listing nothing (the web hook answers calmly).
   */
  worlds?: IntentRouterWorld[];
  /**
   * World the action applies to. Optional in context; state-patch falls back to
   * the empty string so the web hook can substitute the active world id.
   */
  worldId?: string;
  /**
   * Room used for run-turn when the operator names a role but no room. Falls
   * back to the first room in context, then the empty string.
   */
  defaultRoomId?: string;
}

export interface IntentRouter {
  classify(goal: string, context: IntentRouterContext): Promise<RealmIntent>;
}
