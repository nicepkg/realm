import type { RealmEvent, StatePatchOperation, StatePatchResult } from "@realm/core";
import { assertSafePathSegment, readJsonPointer, stableHash } from "./support.ts";

export type SimulationRunInput = {
  ticks?: number;
  seed?: string | number;
  roomId?: string;
  maxActivations?: number;
  idempotencyKey?: string;
};

export type SimulationControlInput = {
  reason?: string;
  idempotencyKey?: string;
};

export type SimulationResumeInput = SimulationControlInput & {
  forkId?: string;
};

export type SimulationForkInput = {
  label?: string;
  afterSeq?: number;
  idempotencyKey?: string;
};

export type SimulationBackgroundStartInput = SimulationRunInput & {
  intervalMs?: number;
};

export type SimulationDecision = {
  roleId: string;
  activated: boolean;
  energyBefore: number;
  energyAfter: number;
  reputationBefore: number;
  reputationAfter: number;
  reason: string;
};

export type SimulationTickSummary = {
  tick: number;
  worldEventId: string;
  stateVersion: number;
  replayHash: string;
  decisions: SimulationDecision[];
};

export type SimulationRunResult = {
  worldId: string;
  status: "running" | "paused" | "completed";
  ticks: SimulationTickSummary[];
  eventCount: number;
  replayHash: string;
};

export type SimulationExport = {
  worldId: string;
  exportedAt: string;
  fromSeq: number;
  toSeq: number;
  eventCount: number;
  replayHash: string;
  stateHash: string;
  state: unknown;
  events: readonly RealmEvent[];
};

export type SimulationForkResult = {
  forkId: string;
  worldId: string;
  label: string;
  path: string;
  replayHash: string;
  stateHash: string;
};

export type SimulationBackgroundRun = {
  runId: string;
  worldId: string;
  status: "running" | "stopped";
  intervalMs: number;
  plannedTicks: number;
};

export type BackgroundRunState = SimulationBackgroundRun & {
  interval: ReturnType<typeof setInterval>;
  completedTicks: number;
  running: boolean;
};

export function buildRunResult(
  worldId: string,
  status: SimulationRunResult["status"],
  ticks: SimulationTickSummary[],
  replay: { replayHash: string; events: readonly RealmEvent[] },
): SimulationRunResult {
  return {
    worldId,
    status,
    ticks,
    eventCount: replay.events.length,
    replayHash: replay.replayHash,
  };
}

export function buildSimulationOperations(
  tick: number,
  seed: string | number,
  decisions: SimulationDecision[],
): StatePatchOperation[] {
  const operations: StatePatchOperation[] = [
    { op: "set", path: "/publicState/simulation/tick", value: tick },
    { op: "set", path: "/publicState/simulation/lastSeed", value: seed },
  ];
  for (const decision of decisions) {
    operations.push({
      op: "set",
      path: rolePath(decision.roleId, "energy"),
      value: decision.energyAfter,
    });
    operations.push({
      op: "set",
      path: rolePath(decision.roleId, "reputation"),
      value: decision.reputationAfter,
    });
    operations.push({
      op: "set",
      path: `/privateState/roles/${decision.roleId}/doctrine`,
      value: {
        tick,
        memory: decision.activated
          ? "Act when the world calls, but preserve energy."
          : "Rest is a strategic resource.",
      },
    });
  }
  const activated = decisions.filter((item) => item.activated);
  for (const [index, decision] of activated.entries()) {
    const next = activated[index + 1];
    if (next) {
      operations.push({
        op: "set",
        path: `/publicState/simulation/relationships/${decision.roleId}/${next.roleId}`,
        value: 1,
      });
    }
  }
  return operations;
}

export function committedVersion(result: StatePatchResult): number {
  if (result.status === "committed" || result.status === "duplicate") {
    return result.version;
  }
  return result.currentVersion;
}

export function rolePath(roleId: string, field: "energy" | "reputation"): string {
  assertSafePathSegment(roleId, "roleId");
  return `/publicState/simulation/roles/${roleId}/${field}`;
}

export function readNumber(state: unknown, pointer: string, fallback: number): number {
  const value = readJsonPointer(state, pointer);
  return typeof value === "number" ? value : fallback;
}

export function readBoolean(state: unknown, pointer: string, fallback: boolean): boolean {
  const value = readJsonPointer(state, pointer);
  return typeof value === "boolean" ? value : fallback;
}

export function score(seed: string | number, tick: number, roleId: string): number {
  return Number.parseInt(stableHash(`${seed}:${tick}:${roleId}`).slice(0, 8), 16);
}

export function energyCost(seed: string | number, tick: number, roleId: string): number {
  return 3 + (score(seed, tick, roleId) % 4);
}

export function toPublicRun(run: BackgroundRunState): SimulationBackgroundRun {
  return {
    runId: run.runId,
    worldId: run.worldId,
    status: run.status,
    intervalMs: run.intervalMs,
    plannedTicks: run.plannedTicks,
  };
}
