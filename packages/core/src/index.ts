import { z } from "zod";

export const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

export const isoDateSchema = z.string().datetime({ offset: true });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ProjectId = Brand<string, "ProjectId">;
export type WorldId = Brand<string, "WorldId">;
export type RoomId = Brand<string, "RoomId">;
export type RoleId = Brand<string, "RoleId">;
export type TurnId = Brand<string, "TurnId">;
export type EventId = Brand<string, "EventId">;
export type PrincipalId = Brand<string, "PrincipalId">;

export const capabilitySchema = z.enum([
  "message.send",
  "room.create",
  "turn.run",
  "state.query",
  "state.patch.propose",
  "state.patch.admin",
  "memory.read",
  "memory.write",
  "fs.private.read",
  "fs.private.write",
  "fs.private.list",
  "fs.project.read",
  "fs.project.write",
  "shell.run",
  "network.fetch",
  "role.impersonate",
  "trace.read",
  "config.read",
  "config.write",
  "role.create",
  "world.create",
  "model.configure",
  "god.admin",
]);

export type Capability = z.infer<typeof capabilitySchema>;

export const principalSchema = z.object({
  id: idSchema,
  kind: z.enum(["owner", "role", "god", "system", "assistant"]),
});

export type Principal = z.infer<typeof principalSchema>;

export const eventEnvelopeSchema = z.object({
  eventId: idSchema,
  seq: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  aggregateId: idSchema,
  causationId: idSchema.optional(),
  correlationId: idSchema.optional(),
  idempotencyKey: z.string().min(1).optional(),
  createdAt: isoDateSchema,
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const messageSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  roomId: idSchema,
  authorId: idSchema,
  displayedAuthorId: idSchema,
  realOperatorId: idSchema.optional(),
  content: z.string(),
  createdAt: isoDateSchema,
  reversibleUntil: isoDateSchema.optional(),
});

export type Message = z.infer<typeof messageSchema>;

export const roomTypeSchema = z.enum(["world-main", "group", "dm", "god-channel", "system"]);

export type RoomType = z.infer<typeof roomTypeSchema>;

export const roomSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  type: roomTypeSchema,
  name: z.string().min(1),
  memberIds: z.array(idSchema).default([]),
});

export type Room = z.infer<typeof roomSchema>;

export const roleSummarySchema = z.object({
  id: idSchema,
  displayName: z.string().min(1),
  model: z.string().min(1),
  source: z.enum(["config", "world", "template"]),
});

export type RoleSummary = z.infer<typeof roleSummarySchema>;

export const worldSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  mode: z.object({
    type: z.enum(["debate", "workflow", "game", "simulation", "sandbox"]),
    time: z.object({
      kind: z.enum(["manual", "tick", "realtime"]),
    }),
  }),
  defaultRoomId: idSchema,
  roleIds: z.array(idSchema),
});

export type WorldSummary = z.infer<typeof worldSummarySchema>;

export const modelUsageCostSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export type ModelUsageCost = z.infer<typeof modelUsageCostSchema>;

export const modelUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cost: modelUsageCostSchema,
});

export type ModelUsage = z.infer<typeof modelUsageSchema>;

export const turnSummarySchema = z.object({
  id: idSchema,
  worldId: idSchema,
  roomId: idSchema,
  actorId: idSchema,
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  model: z.string().optional(),
  usage: modelUsageSchema.optional(),
});

export type TurnSummary = z.infer<typeof turnSummarySchema>;

export const toolCallSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: z.enum(["allowed", "denied", "completed", "failed"]),
  reason: z.string().optional(),
});

export type ToolCallSummary = z.infer<typeof toolCallSummarySchema>;

export const turnDeltaSchema = z.object({
  turnId: idSchema,
  roleId: idSchema,
  delta: z.string(),
});

export type TurnDelta = z.infer<typeof turnDeltaSchema>;

export const auditEventSchema = z.object({
  id: idSchema,
  actorId: idSchema,
  action: z.string().min(1),
  target: z.string().optional(),
  reason: z.string().optional(),
  createdAt: isoDateSchema,
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const jsonPointerSchema = z
  .string()
  .refine((value) => value === "" || value.startsWith("/"), "Must be a JSON Pointer path");

export const statePatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: jsonPointerSchema, value: z.unknown() }),
  z.object({ op: z.literal("increment"), path: jsonPointerSchema, amount: z.number() }),
  z.object({ op: z.literal("append"), path: jsonPointerSchema, value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: jsonPointerSchema }),
  z.object({ op: z.literal("move"), from: jsonPointerSchema, path: jsonPointerSchema }),
]);

export type StatePatchOperation = z.infer<typeof statePatchOperationSchema>;

export const statePatchSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  actorId: idSchema,
  proposedBy: idSchema,
  approvedBy: idSchema.optional(),
  baseVersion: z.number().int().nonnegative(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).optional(),
  operations: z.array(statePatchOperationSchema).min(1),
  reason: z.string().min(1),
  createdAt: isoDateSchema,
});

export type StatePatch = z.infer<typeof statePatchSchema>;

export const statePatchResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("committed"),
    patchId: idSchema,
    version: z.number().int().nonnegative(),
    state: z.record(z.string(), z.unknown()),
  }),
  z.object({
    status: z.literal("rejected"),
    patchId: idSchema,
    reason: z.string(),
    currentVersion: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("duplicate"),
    patchId: idSchema,
    version: z.number().int().nonnegative(),
    state: z.record(z.string(), z.unknown()),
  }),
]);

export type StatePatchResult = z.infer<typeof statePatchResultSchema>;

export const godRoleActionTypeSchema = z.enum(["kill", "mute", "revive"]);

export type GodRoleActionType = z.infer<typeof godRoleActionTypeSchema>;

export const configPatchFileOperationSchema = z.object({
  path: z.string().min(1),
  action: z.enum(["create", "update", "delete"]),
  previousHash: z.string().nullable(),
  nextHash: z.string().nullable(),
  nextContent: z.string().nullable(),
});

export type ConfigPatchFileOperation = z.infer<typeof configPatchFileOperationSchema>;

export const configPatchProposalSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  requiredCapabilities: z.array(capabilitySchema),
  operations: z.array(configPatchFileOperationSchema).min(1),
  createdAt: isoDateSchema,
});

export type ConfigPatchProposal = z.infer<typeof configPatchProposalSchema>;

export const realmEventSchema = z.discriminatedUnion("type", [
  eventEnvelopeSchema.extend({
    type: z.literal("message.created"),
    message: messageSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("room.created"),
    room: roomSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("turn.started"),
    turn: turnSummarySchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("turn.completed"),
    turn: turnSummarySchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("turn.failed"),
    turn: turnSummarySchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("turn.cancelled"),
    turn: turnSummarySchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("turn.delta"),
    delta: turnDeltaSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("tool.called"),
    traceId: idSchema,
    toolCall: toolCallSummarySchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("state.patch.proposed"),
    patch: statePatchSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("state.patch.committed"),
    patch: statePatchSchema,
    version: z.number().int().nonnegative(),
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("audit.created"),
    audit: auditEventSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("config.patch.proposed"),
    patch: configPatchProposalSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("config.patch.applied"),
    patchId: idSchema,
    historyId: idSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("config.reloaded"),
    projectId: idSchema,
  }),
]);

export type RealmEvent = z.infer<typeof realmEventSchema>;

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function makeId(prefix: string, value: string | number): string {
  return `${prefix}:${value}`;
}
