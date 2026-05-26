import { z } from "zod";

const seedSchema = z.union([z.string(), z.number()]).optional();

export const simulationRunRequestSchema = z.object({
  ticks: z.number().int().min(1).max(100).default(1),
  seed: seedSchema,
  roomId: z.string().min(1).optional(),
  maxActivations: z.number().int().min(1).max(20).default(3),
  idempotencyKey: z.string().min(1).optional(),
});

export const simulationControlRequestSchema = z.object({
  reason: z.string().min(1).default("Simulation control request."),
  idempotencyKey: z.string().min(1).optional(),
});

export const simulationResumeRequestSchema = simulationControlRequestSchema.extend({
  forkId: z.string().min(1).optional(),
});

export const simulationForkRequestSchema = z.object({
  label: z.string().min(1).default("manual fork"),
  afterSeq: z.number().int().nonnegative().default(0),
  idempotencyKey: z.string().min(1).optional(),
});

export const simulationBackgroundStartRequestSchema = simulationRunRequestSchema.extend({
  intervalMs: z.number().int().min(10).max(60_000).default(1_000),
});

export const simulationDecisionSchema = z.object({
  roleId: z.string().min(1),
  activated: z.boolean(),
  energyBefore: z.number(),
  energyAfter: z.number(),
  reputationBefore: z.number(),
  reputationAfter: z.number(),
  reason: z.string().min(1),
});

export const simulationTickSummarySchema = z.object({
  tick: z.number().int().nonnegative(),
  worldEventId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  replayHash: z.string().min(1),
  decisions: z.array(simulationDecisionSchema),
});

export const simulationRunResponseSchema = z.object({
  worldId: z.string().min(1),
  status: z.enum(["running", "paused", "completed"]),
  ticks: z.array(simulationTickSummarySchema),
  eventCount: z.number().int().nonnegative(),
  replayHash: z.string().min(1),
});

export const simulationStatusResponseSchema = z.object({
  worldId: z.string().min(1),
  paused: z.boolean(),
  tick: z.number().int().nonnegative(),
  activeRuns: z.array(z.string().min(1)),
});

export const simulationControlResponseSchema = z.object({
  worldId: z.string().min(1),
  paused: z.boolean(),
  stateVersion: z.number().int().nonnegative(),
  forkId: z.string().min(1).optional(),
});

export const simulationExportResponseSchema = z.object({
  worldId: z.string().min(1),
  exportedAt: z.string().datetime({ offset: true }),
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  replayHash: z.string().min(1),
  stateHash: z.string().min(1),
  state: z.unknown(),
  events: z.array(z.unknown()),
});

export const simulationForkResponseSchema = z.object({
  forkId: z.string().min(1),
  worldId: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  replayHash: z.string().min(1),
  stateHash: z.string().min(1),
});

export const simulationBackgroundRunResponseSchema = z.object({
  runId: z.string().min(1),
  worldId: z.string().min(1),
  status: z.enum(["running", "stopped"]),
  intervalMs: z.number().int().positive(),
  plannedTicks: z.number().int().positive(),
});
