import {
  projectConfigSchema,
  skillScopeSchema,
  skillSourceSchema,
  userConfigSchema,
} from "@realm/config/schemas";
import {
  capabilitySchema,
  configPatchProposalSchema,
  godRoleActionTypeSchema,
  messageSchema,
  realmEventSchema,
  roleSummarySchema,
  roomSchema,
  statePatchOperationSchema,
  statePatchResultSchema,
  statePatchSchema,
  workflowApprovalSchema,
  workflowArtifactSchema,
  workflowProjectPatchSchema,
  workflowReviewSchema,
  workflowTaskSchema,
  worldEventConditionSchema,
  worldEventRecordSchema,
  worldSummarySchema,
  worldTickRecordSchema,
} from "@realm/core";
import { z } from "zod";

export type { ProjectConfig, UserConfig } from "@realm/config/schemas";
export type {
  ConfigPatchProposal,
  GodRoleActionType,
  Message,
  ModelUsage,
  RealmEvent,
  RoleAvatar,
  RoleSummary,
  Room,
  StatePatch,
  StatePatchOperation,
  StatePatchResult,
  TurnSummary,
  WorkflowApproval,
  WorkflowArtifact,
  WorkflowProjectPatch,
  WorkflowReview,
  WorkflowTask,
  WorldEventCondition,
  WorldEventRecord,
  WorldSummary,
  WorldTickRecord,
} from "@realm/core";
export {
  realmEventSchema,
  statePatchOperationSchema,
  statePatchResultSchema,
  statePatchSchema,
} from "@realm/core";
export * from "./simulation.ts";

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    remediation: z.string().optional(),
  }),
});

export const projectResponseSchema = z.object({
  root: z.string().min(1),
  name: z.string().min(1),
  defaultWorldId: z.string().min(1),
});

export const configStatusResponseSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
});

export const settingsResponseSchema = z.object({
  user: userConfigSchema,
  project: projectConfigSchema,
  paths: z.object({
    userConfigPath: z.string().min(1),
    projectConfigPath: z.string().min(1),
    projectLocalConfigPath: z.string().min(1),
  }),
});

export const settingsExportResponseSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  user: userConfigSchema,
  project: projectConfigSchema,
  redactions: z.array(z.string().min(1)),
});

export const settingsImportRequestSchema = z.object({
  user: userConfigSchema,
  project: projectConfigSchema,
});

export const updateUserSettingsRequestSchema = userConfigSchema;

export const updateProjectSettingsRequestSchema = projectConfigSchema;

export const effectiveConfigResponseSchema = z.object({
  project: projectResponseSchema,
  worlds: z.array(worldSummarySchema),
  roles: z.array(roleSummarySchema),
});

export const policySkillIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scope: skillScopeSchema,
  source: skillSourceSchema,
  roleId: z.string().min(1).optional(),
  worldId: z.string().min(1).optional(),
  relativePath: z.string().min(1),
  path: z.string().min(1),
  contentHash: z.string().min(1),
});

export const effectivePolicyResponseSchema = z.object({
  trustTier: z.enum(["read-only", "run-roles", "elevated-tools"]),
  capabilities: z.array(
    z.object({
      capability: capabilitySchema,
      allow: z.boolean(),
      reason: z.string().min(1),
      remediation: z.string().optional(),
      auditLevel: z.enum(["none", "standard", "high"]).optional(),
      highRisk: z.boolean(),
    }),
  ),
  roleWorlds: z.array(
    z.object({
      worldId: z.string().min(1),
      roleId: z.string().min(1),
      allowedSkills: z.array(policySkillIdentitySchema),
      deniedSkills: z.array(
        z.object({
          skill: policySkillIdentitySchema,
          reason: z.string().min(1),
          pattern: z.string().min(1).optional(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string().min(1)),
});

export const listEventsResponseSchema = z.object({
  events: z.array(realmEventSchema),
  lastSeq: z.number().int().nonnegative(),
});

export const listWorldsResponseSchema = z.object({
  worlds: z.array(worldSummarySchema),
});

export const listRoomsResponseSchema = z.object({
  rooms: z.array(roomSchema),
});

export const listRolesResponseSchema = z.object({
  roles: z.array(roleSummarySchema),
});

export const listMessagesResponseSchema = z.object({
  messages: z.array(messageSchema),
});

export const sendMessageRequestSchema = z.object({
  worldId: z.string().min(1),
  displayedAuthorId: z
    .string()
    .min(1)
    .refine((value) => value !== "god", "God messages must use world event endpoints")
    .optional(),
  content: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const sendMessageResponseSchema = z.object({
  message: messageSchema,
});

export const createRoomRequestSchema = z.object({
  type: z.enum(["group", "dm", "god-channel", "system"]).default("group"),
  name: z.string().min(1),
  memberIds: z.array(z.string().min(1)).default([]),
  idempotencyKey: z.string().min(1).optional(),
});

export const createRoomResponseSchema = z.object({
  room: roomSchema,
});

export const runRoleTurnRequestSchema = z.object({
  worldId: z.string().min(1),
  roleId: z.string().min(1),
  prompt: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const runRoleTurnResponseSchema = z.object({
  turnId: z.string().min(1),
  message: messageSchema,
});

export const startRoleTurnResponseSchema = z.object({
  turnId: z.string().min(1),
});

export const cancelTurnResponseSchema = z.object({
  turnId: z.string().min(1),
  cancelled: z.boolean(),
});

export const extensionStateQueryRequestSchema = z.object({
  worldId: z.string().min(1),
  roleId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  path: z.string().optional(),
});

export const extensionStateQueryResponseSchema = z.object({
  state: z.unknown(),
});

export const worldStateResponseSchema = z.object({
  worldId: z.string().min(1),
  version: z.number().int().nonnegative(),
  state: z.record(z.string(), z.unknown()),
});

export const adminStatePatchRequestSchema = z.object({
  worldId: z.string().min(1),
  actorId: z.string().min(1).default("god"),
  expectedVersion: z.number().int().nonnegative().optional(),
  operations: z.array(statePatchOperationSchema).min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const adminStatePatchResponseSchema = z.object({
  patch: statePatchSchema,
  result: statePatchResultSchema,
});

export const godRoleActionRequestSchema = z.object({
  action: godRoleActionTypeSchema,
  targetRoleId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const godRoleActionResponseSchema = z.object({
  action: godRoleActionRequestSchema.extend({
    worldId: z.string().min(1),
  }),
  patch: statePatchSchema,
  result: statePatchResultSchema,
});

export const naturalWorldEventRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  targetRoleIds: z.array(z.string().min(1)).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  operations: z.array(statePatchOperationSchema).min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const naturalWorldEventResponseSchema = z.object({
  event: naturalWorldEventRequestSchema.extend({
    worldId: z.string().min(1),
  }),
  patch: statePatchSchema,
  result: statePatchResultSchema,
});

export const randomNaturalWorldEventRequestSchema = z.object({
  seed: z.union([z.string().min(1), z.number()]).optional(),
  targetRoleIds: z.array(z.string().min(1)).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const worldEventTriggerRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  targetRoleIds: z.array(z.string().min(1)).optional(),
  operations: z.array(statePatchOperationSchema).min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  roomId: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const worldEventConditionRequestSchema = worldEventTriggerRequestSchema.extend({
  condition: worldEventConditionSchema,
});

export const randomWorldEventRequestSchema = z.object({
  seed: z.union([z.string().min(1), z.number()]).optional(),
  targetRoleIds: z.array(z.string().min(1)).optional(),
  roomId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const tickWorldEventRequestSchema = randomWorldEventRequestSchema.extend({
  tick: z.number().int().nonnegative().optional(),
});

export const worldEventTriggerResponseSchema = z.object({
  event: worldEventRecordSchema,
  patch: statePatchSchema.optional(),
  result: statePatchResultSchema.optional(),
  message: messageSchema.optional(),
});

export const worldTickTriggerResponseSchema = worldEventTriggerResponseSchema.extend({
  tick: worldTickRecordSchema,
});

export const worldEventReplayResponseSchema = z.object({
  worldId: z.string().min(1),
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
  replayHash: z.string().min(1),
  events: z.array(realmEventSchema),
});

export const extensionMemoryReadRequestSchema = z.object({
  roleId: z.string().min(1),
  worldId: z.string().min(1).optional(),
  toolCallId: z.string().min(1).optional(),
});

export const extensionMemoryReadResponseSchema = z.object({
  content: z.string(),
});

export const extensionMemoryWriteRequestSchema = z.object({
  roleId: z.string().min(1),
  worldId: z.string().min(1).optional(),
  toolCallId: z.string().min(1).optional(),
  content: z.string(),
});

export const extensionMemoryWriteResponseSchema = z.object({
  bytes: z.number().int().nonnegative(),
});

export const createRoleRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  model: z.string().min(1).default("default"),
  summary: z.string().default(""),
});

export const createWorldRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["debate", "workflow", "game", "simulation", "sandbox"]).default("sandbox"),
  roomName: z.string().min(1).default("All Hands"),
  roleIds: z.array(z.string().min(1)).default([]),
});

export const assistantConfigRequestSchema = z.object({
  goal: z.string().min(1),
});

export const configPatchProposalResponseSchema = z.object({
  patch: configPatchProposalSchema,
});

export const configPatchApplyRequestSchema = z.object({
  confirmation: z.string().optional(),
});

export const configPatchApplyResponseSchema = z.object({
  patchId: z.string().min(1),
  historyId: z.string().min(1),
  changedPaths: z.array(z.string()),
});

export const configRollbackResponseSchema = z.object({
  historyId: z.string().min(1),
  restoredPaths: z.array(z.string()),
});

export const createWorkflowArtifactRequestSchema = z.object({
  title: z.string().min(1),
  kind: workflowArtifactSchema.shape.kind,
  content: z.string(),
  ownerRoleId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const createWorkflowArtifactResponseSchema = z.object({
  artifact: workflowArtifactSchema,
});

export const createWorkflowTaskRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  ownerRoleId: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

export const createWorkflowTaskResponseSchema = z.object({
  task: workflowTaskSchema,
});

export const requestWorkflowReviewRequestSchema = z.object({
  artifactId: z.string().min(1),
  requestedBy: z.string().min(1),
  reviewerRoleId: z.string().min(1),
  summary: z.string().default(""),
  idempotencyKey: z.string().min(1).optional(),
});

export const workflowReviewResponseSchema = z.object({
  review: workflowReviewSchema,
});

export const decideWorkflowReviewRequestSchema = z.object({
  reviewId: z.string().min(1),
  artifactId: z.string().min(1),
  reviewerRoleId: z.string().min(1),
  decision: z.enum(["changes-requested", "approved"]),
  summary: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const requestWorkflowApprovalRequestSchema = z.object({
  capability: capabilitySchema,
  requestedBy: z.string().min(1),
  targetId: z.string().min(1).optional(),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const workflowApprovalResponseSchema = z.object({
  approval: workflowApprovalSchema,
});

export const decideWorkflowApprovalRequestSchema = z.object({
  approvalId: z.string().min(1),
  capability: capabilitySchema,
  requestedBy: z.string().min(1),
  targetId: z.string().min(1).optional(),
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string().min(1).optional(),
  reason: z.string().min(1),
  requestReason: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const proposeProjectPatchRequestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(""),
  requestedBy: z.string().min(1),
  approvalId: z.string().min(1).optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        action: z.enum(["create", "update", "delete"]),
        nextContent: z.string().nullable().optional(),
      }),
    )
    .min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const projectPatchResponseSchema = z.object({
  projectPatch: workflowProjectPatchSchema,
});

export const applyProjectPatchRequestSchema = z.object({
  approvalId: z.string().min(1),
  appliedBy: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});
