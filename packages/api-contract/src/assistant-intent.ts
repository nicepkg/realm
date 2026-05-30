import { godRoleActionTypeSchema } from "@realm/core";
import { z } from "zod";

/**
 * Assistant intent routing contract.
 *
 * The model-backed router is the PRIMARY natural-language routing path. The web /
 * TUI hosts post the operator's free-form goal plus a minimal world/role/room
 * context to `POST /api/assistant/intent`; the server returns a routed
 * `RealmIntent` (the SAME discriminated union the deterministic classifier in
 * `@realm/assistant` emits) which the host then maps onto its existing
 * preview/confirm flow. The endpoint NEVER throws: on any model/provider failure
 * the service falls back to the deterministic classifier so the result is always
 * a coherent, write-safe intent.
 *
 * Co-located in its own module (re-exported from `index.ts`) so the contract index
 * stays under the 500-line guard.
 */

/** Minimal role context the router needs to resolve names → ids. */
const intentContextRoleSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
});

/** Minimal room context (just ids) used to default a run-turn's room. */
const intentContextRoomSchema = z.object({
  id: z.string().min(1),
});

/** Minimal world context (id + user-facing name) used to resolve world-switch. */
const intentContextWorldSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const assistantIntentRequestSchema = z.object({
  /** The operator's raw natural-language instruction. */
  goal: z.string().min(1),
  /** Roles visible in the active scope (for name→id resolution). */
  roles: z.array(intentContextRoleSchema).default([]),
  /** Rooms in the active world (to default a run-turn's room). */
  rooms: z.array(intentContextRoomSchema).default([]),
  /** Every world in the project (to resolve a named world-switch). */
  worlds: z.array(intentContextWorldSchema).default([]),
  /** Active world id, when one is selected. */
  worldId: z.string().min(1).optional(),
  /** Default room id for run-turn when the operator names a role but no room. */
  defaultRoomId: z.string().min(1).optional(),
});

/**
 * A single state-patch operation the intent router emits. Mirrors
 * `@realm/assistant`'s IntentStateOperation (set/increment/append). `path` is a
 * JSON Pointer (the assistant contract guarantees a leading "/").
 */
const intentStateOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("increment"), path: z.string(), amount: z.number() }),
  z.object({ op: z.literal("append"), path: z.string(), value: z.unknown() }),
]);

/**
 * The config plan a config intent carries. Mirrors `@realm/assistant`'s
 * `AssistantConfigPlan` (role | world) but kept permissive here so the contract
 * package stays free of an `@realm/assistant` dependency: the web host only reads
 * the config GOAL (it re-proposes via `proposeAssistantConfig`), so the plan is
 * passed through structurally. `passthrough` preserves unknown plan fields across
 * the wire without coupling the contract to the planner's exact shape.
 */
const assistantConfigPlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.record(z.string(), z.unknown()) }).passthrough(),
  z.object({ kind: z.literal("world"), world: z.record(z.string(), z.unknown()) }).passthrough(),
]);

/**
 * The routed intent — a zod mirror of `@realm/assistant`'s `RealmIntent`
 * discriminated union (incl. world-switch). Mirrored here (rather than imported)
 * so the contract has no runtime dependency on the assistant package and the SDK
 * can parse the response with a schema it owns.
 */
export const assistantIntentResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("config"),
    goal: z.string().min(1),
    plan: assistantConfigPlanSchema,
  }),
  z.object({
    kind: z.literal("god"),
    targetRoleId: z.string().min(1),
    action: godRoleActionTypeSchema,
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal("state-patch"),
    worldId: z.string(),
    // Mirrors `@realm/assistant`'s IntentStateOperation (set/increment/append) —
    // the subset the intent router emits — NOT the full core StatePatchOperation
    // (which also has remove/move). The web host re-shapes these into a write.
    operations: z.array(intentStateOperationSchema).min(1),
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal("run-turn"),
    roleId: z.string().min(1),
    roomId: z.string(),
  }),
  z.object({
    kind: z.literal("world-switch"),
    worldId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("inspect"),
    target: z.enum(["world-state", "role-memory"]),
    roleId: z.string().optional(),
    query: z.string(),
  }),
  z.object({
    kind: z.literal("trust-elevation"),
    tier: z.enum(["run-roles"]),
  }),
]);

export const assistantIntentResultResponseSchema = z.object({
  intent: assistantIntentResponseSchema,
});

export type AssistantIntentRequest = z.infer<typeof assistantIntentRequestSchema>;
export type AssistantIntentResponse = z.infer<typeof assistantIntentResponseSchema>;
