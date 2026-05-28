import { z } from "zod";
import { turnRuntimeSchema } from "./runtime-metadata.ts";

export * from "./runtime-metadata.ts";

export const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

export const isoDateSchema = z.string().datetime({ offset: true });

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

export const roleAvatarSchema = z
  .object({
    emoji: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
  })
  .refine((avatar) => avatar.emoji || avatar.image, "Avatar must include emoji or image");
export type RoleAvatar = z.infer<typeof roleAvatarSchema>;

export const roleSummarySchema = z.object({
  id: idSchema,
  displayName: z.string().min(1),
  model: z.string().min(1),
  source: z.enum(["config", "world", "template"]),
  avatar: roleAvatarSchema.optional(),
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
  runtime: turnRuntimeSchema.optional(),
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

export const worldEventSeveritySchema = z.enum(["minor", "major", "critical"]);

export type WorldEventSeverity = z.infer<typeof worldEventSeveritySchema>;

export const worldEventConditionSchema = z.object({
  path: jsonPointerSchema,
  equals: z.unknown().optional(),
  exists: z.boolean().optional(),
});

export type WorldEventCondition = z.infer<typeof worldEventConditionSchema>;

export const worldEventRecordSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  kind: z.enum(["manual", "random", "condition", "god-adjudicated"]),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: worldEventSeveritySchema,
  targetRoleIds: z.array(idSchema),
  seed: z.union([z.string(), z.number()]).optional(),
  condition: worldEventConditionSchema.optional(),
  patchId: idSchema.optional(),
  messageId: idSchema.optional(),
  stateVersion: z.number().int().nonnegative().optional(),
  status: z.enum(["committed", "duplicate", "rejected", "skipped"]),
  reason: z.string().optional(),
  createdAt: isoDateSchema,
});

export type WorldEventRecord = z.infer<typeof worldEventRecordSchema>;

export const worldTickRecordSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  tick: z.number().int().nonnegative(),
  seed: z.union([z.string(), z.number()]),
  eventId: idSchema.optional(),
  stateVersion: z.number().int().nonnegative().optional(),
  status: z.enum(["triggered", "duplicate", "skipped"]),
  createdAt: isoDateSchema,
});

export type WorldTickRecord = z.infer<typeof worldTickRecordSchema>;

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
  riskReasons: z.array(z.string().min(1)).default([]),
  typedConfirmation: z.string().min(1).nullable().default(null),
  requiredCapabilities: z.array(capabilitySchema),
  operations: z.array(configPatchFileOperationSchema).min(1),
  createdAt: isoDateSchema,
});

export type ConfigPatchProposal = z.infer<typeof configPatchProposalSchema>;

export const workflowArtifactSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  title: z.string().min(1),
  kind: z.enum(["spec", "task-brief", "review-request", "release-note", "note"]),
  status: z.enum(["draft", "review", "approved", "implemented", "verified"]),
  ownerRoleId: idSchema.optional(),
  content: z.string(),
  createdAt: isoDateSchema,
});

export type WorkflowArtifact = z.infer<typeof workflowArtifactSchema>;

export const workflowTaskSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["todo", "in-progress", "blocked", "done"]),
  ownerRoleId: idSchema.optional(),
  artifactId: idSchema.optional(),
  createdAt: isoDateSchema,
});

export type WorkflowTask = z.infer<typeof workflowTaskSchema>;

export const workflowReviewSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  artifactId: idSchema,
  requestedBy: idSchema,
  reviewerRoleId: idSchema,
  status: z.enum(["requested", "changes-requested", "approved"]),
  summary: z.string().default(""),
  createdAt: isoDateSchema,
});

export type WorkflowReview = z.infer<typeof workflowReviewSchema>;

export const workflowApprovalSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  capability: capabilitySchema,
  requestedBy: idSchema,
  targetId: idSchema.optional(),
  reason: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  decidedBy: idSchema.optional(),
  decisionReason: z.string().optional(),
  createdAt: isoDateSchema,
  decidedAt: isoDateSchema.optional(),
});

export type WorkflowApproval = z.infer<typeof workflowApprovalSchema>;

export const workflowProjectPatchFileSchema = z.object({
  path: z.string().min(1),
  action: z.enum(["create", "update", "delete"]),
  previousHash: z.string().nullable(),
  nextHash: z.string().nullable(),
  nextContent: z.string().nullable(),
});

export type WorkflowProjectPatchFile = z.infer<typeof workflowProjectPatchFileSchema>;

export const workflowProjectPatchSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  requestedBy: idSchema,
  approvalId: idSchema.optional(),
  status: z.enum(["proposed", "applied"]),
  files: z.array(workflowProjectPatchFileSchema).min(1),
  createdAt: isoDateSchema,
  appliedAt: isoDateSchema.optional(),
  appliedBy: idSchema.optional(),
});

export type WorkflowProjectPatch = z.infer<typeof workflowProjectPatchSchema>;

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
    type: z.literal("world.event.triggered"),
    event: worldEventRecordSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("world.tick.triggered"),
    tick: worldTickRecordSchema,
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
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.artifact.created"),
    artifact: workflowArtifactSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.task.created"),
    task: workflowTaskSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.review.requested"),
    review: workflowReviewSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.review.decided"),
    review: workflowReviewSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.approval.requested"),
    approval: workflowApprovalSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.approval.decided"),
    approval: workflowApprovalSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.project_patch.proposed"),
    projectPatch: workflowProjectPatchSchema,
  }),
  eventEnvelopeSchema.extend({
    type: z.literal("workflow.project_patch.applied"),
    projectPatch: workflowProjectPatchSchema,
  }),
]);

export type RealmEvent = z.infer<typeof realmEventSchema>;

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function makeId(prefix: string, value: string | number): string {
  return `${prefix}:${value}`;
}
