import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Capability } from "@realm/core";
import { assertSafePathSegment, stableHash } from "./support.ts";
import type { WorldEventService } from "./world-event-service.ts";
import {
  type BackgroundRunState,
  buildRunResult,
  buildSimulationOperations,
  committedVersion,
  energyCost,
  readBoolean,
  readNumber,
  rolePath,
  type SimulationBackgroundRun,
  type SimulationBackgroundStartInput,
  type SimulationControlInput,
  type SimulationDecision,
  type SimulationExport,
  type SimulationForkInput,
  type SimulationForkResult,
  type SimulationResumeInput,
  type SimulationRunInput,
  type SimulationRunResult,
  type SimulationTickSummary,
  score,
  toPublicRun,
} from "./world-simulation-model.ts";
import type { WorldStateService } from "./world-state-service.ts";

export type WorldSimulationServiceOptions = {
  root: string;
  clock: () => Date;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
  worldEvents: WorldEventService;
  worldState: WorldStateService;
  listWorldRoleIds: (worldId: string) => Promise<string[]>;
};

export class WorldSimulationService {
  private readonly backgroundRuns = new Map<string, BackgroundRunState>();

  constructor(private readonly options: WorldSimulationServiceOptions) {}

  async getStatus(worldId: string) {
    this.options.assertAllowed("trace.read");
    assertSafePathSegment(worldId, "worldId");
    const view = await this.options.worldState.getWorldState(worldId);
    return {
      worldId,
      paused: readBoolean(view.state, "/metaState/simulation/paused", false),
      tick: readNumber(view.state, "/publicState/simulation/tick", 0),
      activeRuns: [...this.backgroundRuns.values()]
        .filter((run) => run.worldId === worldId && run.status === "running")
        .map((run) => run.runId),
    };
  }

  async runTicks(worldId: string, input: SimulationRunInput = {}): Promise<SimulationRunResult> {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(worldId, "worldId");
    const summaries: SimulationTickSummary[] = [];
    if ((await this.getStatus(worldId)).paused) {
      const replay = this.options.worldEvents.getReplay({ worldId });
      return buildRunResult(worldId, "paused", summaries, replay);
    }
    for (let index = 0; index < (input.ticks ?? 1); index += 1) {
      summaries.push(await this.runOneTick(worldId, input, index));
    }
    const replay = this.options.worldEvents.getReplay({ worldId });
    return buildRunResult(worldId, "completed", summaries, replay);
  }

  async pause(worldId: string, input: SimulationControlInput = {}) {
    const result = await this.patchControl(worldId, true, input);
    return { worldId, paused: true, stateVersion: committedVersion(result.result) };
  }

  async resume(worldId: string, input: SimulationResumeInput = {}) {
    if (input.forkId) {
      await this.restoreFork(worldId, input.forkId, input);
    }
    const result = await this.patchControl(worldId, false, input);
    return {
      worldId,
      paused: false,
      stateVersion: committedVersion(result.result),
      forkId: input.forkId,
    };
  }

  async exportWorld(worldId: string, afterSeq = 0): Promise<SimulationExport> {
    this.options.assertAllowed("trace.read");
    assertSafePathSegment(worldId, "worldId");
    const replay = this.options.worldEvents.getReplay({ worldId, afterSeq });
    const state = await this.options.worldState.getWorldState(worldId);
    return {
      worldId,
      exportedAt: this.options.clock().toISOString(),
      fromSeq: replay.fromSeq,
      toSeq: replay.toSeq,
      eventCount: replay.events.length,
      replayHash: replay.replayHash,
      stateHash: stableHash(state.state),
      state: state.state,
      events: replay.events,
    };
  }

  async forkWorld(worldId: string, input: SimulationForkInput = {}): Promise<SimulationForkResult> {
    const snapshot = await this.exportWorld(worldId, input.afterSeq);
    const forkId = fileSafeId(input.idempotencyKey ?? randomUUID());
    assertSafePathSegment(forkId, "forkId");
    const label = input.label ?? "manual fork";
    const forkPath = path.join(
      this.options.root,
      ".agents",
      "state",
      "worlds",
      worldId,
      "forks",
      `${forkId}.json`,
    );
    await mkdir(path.dirname(forkPath), { recursive: true });
    await writeFile(forkPath, JSON.stringify({ forkId, label, snapshot }, null, 2), "utf8");
    this.options.appendAudit({
      actorId: "owner",
      action: "simulation.fork.created",
      target: forkId,
      reason: `Forked ${worldId} at replay ${snapshot.replayHash}.`,
    });
    return {
      forkId,
      worldId,
      label,
      path: forkPath,
      replayHash: snapshot.replayHash,
      stateHash: snapshot.stateHash,
    };
  }

  startBackground(
    worldId: string,
    input: SimulationBackgroundStartInput = {},
  ): SimulationBackgroundRun {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(worldId, "worldId");
    const plannedTicks = input.ticks ?? 10;
    const intervalMs = input.intervalMs ?? 1_000;
    const runId = `simulation-run:${randomUUID()}`;
    const run: BackgroundRunState = {
      runId,
      worldId,
      status: "running",
      intervalMs,
      plannedTicks,
      completedTicks: 0,
      running: false,
      interval: setInterval(() => void this.stepBackground(run, input), intervalMs),
    };
    this.backgroundRuns.set(runId, run);
    this.options.appendAudit({
      actorId: "god",
      action: "simulation.background.started",
      target: runId,
      reason: `Background simulation started for ${worldId}.`,
    });
    return toPublicRun(run);
  }

  stopBackground(runId: string): SimulationBackgroundRun {
    const run = this.backgroundRuns.get(runId);
    if (!run) {
      throw new Error(`Unknown simulation run: ${runId}`);
    }
    clearInterval(run.interval);
    run.status = "stopped";
    this.backgroundRuns.delete(runId);
    this.options.appendAudit({
      actorId: "god",
      action: "simulation.background.stopped",
      target: runId,
      reason: `Background simulation stopped after ${run.completedTicks} ticks.`,
    });
    return toPublicRun(run);
  }

  private async runOneTick(
    worldId: string,
    input: SimulationRunInput,
    index: number,
  ): Promise<SimulationTickSummary> {
    const status = await this.getStatus(worldId);
    const tick = status.tick + 1;
    const seed = input.seed ?? `${worldId}:simulation:${tick}`;
    const tickKey = `${input.idempotencyKey ?? "simulation"}:${tick}:${index}`;
    const worldTick = await this.options.worldEvents.triggerTick({
      worldId,
      tick,
      seed,
      roomId: input.roomId,
      idempotencyKey: tickKey,
    });
    const state = await this.options.worldState.getWorldState(worldId);
    const decisions = await this.planRoleDecisions(worldId, state.state, tick, seed, input);
    const operations = buildSimulationOperations(tick, seed, decisions);
    const patch = await this.options.worldState.adminPatchState({
      worldId,
      actorId: "god",
      expectedVersion: state.version,
      operations,
      reason: `Simulation tick ${tick} updated role energy, reputation, relationships, and doctrine memory.`,
      idempotencyKey: `simulation-state:${tickKey}`,
    });
    const replay = this.options.worldEvents.getReplay({ worldId });
    this.options.appendAudit({
      actorId: "god",
      action: "simulation.scheduler.decided",
      target: `${worldId}:${tick}`,
      reason: decisions
        .map((decision) => `${decision.roleId}:${decision.activated ? "active" : "rest"}`)
        .join(", "),
    });
    return {
      tick,
      worldEventId: worldTick.event.id,
      stateVersion: committedVersion(patch.result),
      replayHash: replay.replayHash,
      decisions,
    };
  }

  private async planRoleDecisions(
    worldId: string,
    state: unknown,
    tick: number,
    seed: string | number,
    input: SimulationRunInput,
  ): Promise<SimulationDecision[]> {
    const roleIds = await this.options.listWorldRoleIds(worldId);
    const selected = new Set(
      roleIds
        .filter((roleId) => readNumber(state, rolePath(roleId, "energy"), 100) > 0)
        .sort((left, right) => score(seed, tick, left) - score(seed, tick, right))
        .slice(0, input.maxActivations ?? 3),
    );
    return roleIds.map((roleId) => {
      const energyBefore = readNumber(state, rolePath(roleId, "energy"), 100);
      const reputationBefore = readNumber(state, rolePath(roleId, "reputation"), 0);
      const activated = selected.has(roleId);
      const energyAfter = activated
        ? Math.max(0, energyBefore - energyCost(seed, tick, roleId))
        : Math.min(100, energyBefore + 1);
      const reputationAfter = activated ? reputationBefore + 2 : reputationBefore;
      return {
        roleId,
        activated,
        energyBefore,
        energyAfter,
        reputationBefore,
        reputationAfter,
        reason: activated
          ? "low-cost @all selected by deterministic seed score"
          : "resting to preserve model budget",
      };
    });
  }

  private async patchControl(worldId: string, paused: boolean, input: SimulationControlInput) {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(worldId, "worldId");
    const state = await this.options.worldState.getWorldState(worldId);
    return this.options.worldState.adminPatchState({
      worldId,
      actorId: "god",
      expectedVersion: state.version,
      operations: [
        { op: "set", path: "/metaState/simulation/paused", value: paused },
        {
          op: "set",
          path: "/metaState/simulation/reason",
          value: input.reason ?? "Simulation control request.",
        },
      ],
      reason: paused ? "Simulation paused." : "Simulation resumed.",
      idempotencyKey: input.idempotencyKey
        ? `simulation-control:${paused}:${input.idempotencyKey}`
        : undefined,
    });
  }

  private async restoreFork(
    worldId: string,
    forkId: string,
    input: SimulationResumeInput,
  ): Promise<void> {
    assertSafePathSegment(forkId, "forkId");
    const forkPath = path.join(
      this.options.root,
      ".agents",
      "state",
      "worlds",
      worldId,
      "forks",
      `${forkId}.json`,
    );
    const fork = JSON.parse(await readFile(forkPath, "utf8")) as {
      snapshot: { state: Record<string, unknown> };
    };
    const current = await this.options.worldState.getWorldState(worldId);
    await this.options.worldState.adminPatchState({
      worldId,
      actorId: "god",
      expectedVersion: current.version,
      operations: Object.entries(fork.snapshot.state).map(([key, value]) => ({
        op: "set",
        path: `/${key}`,
        value,
      })),
      reason: `Simulation resumed from fork ${forkId}. ${input.reason ?? ""}`.trim(),
      idempotencyKey: input.idempotencyKey
        ? `simulation-resume-fork:${input.idempotencyKey}`
        : undefined,
    });
  }

  private async stepBackground(
    run: BackgroundRunState,
    input: SimulationBackgroundStartInput,
  ): Promise<void> {
    if (run.running || run.status !== "running") {
      return;
    }
    run.running = true;
    try {
      await this.runTicks(run.worldId, {
        ...input,
        ticks: 1,
        idempotencyKey: `${run.runId}:${run.completedTicks + 1}`,
      });
      run.completedTicks += 1;
      if (run.completedTicks >= run.plannedTicks || (await this.getStatus(run.worldId)).paused) {
        this.stopBackground(run.runId);
      }
    } finally {
      run.running = false;
    }
  }
}

function fileSafeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
