import type { Room, WorldSummary } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { useState } from "react";

type SimulationStatus = {
  paused: boolean;
  tick: number;
  activeRuns: string[];
};

type WorldSimulationOptions = {
  client: RealmHttpClient;
  selectedRoom?: Room;
  selectedWorld?: WorldSummary;
  reload: () => Promise<void>;
};

export function useWorldSimulation({
  client,
  selectedRoom,
  selectedWorld,
  reload,
}: WorldSimulationOptions) {
  const [simulationTicks, setSimulationTicks] = useState("2");
  const [simulationMaxActivations, setSimulationMaxActivations] = useState("2");
  const [simulationIntervalMs, setSimulationIntervalMs] = useState("1000");
  const [simulationSeed, setSimulationSeed] = useState("fixture-seed");
  const [simulationForkLabel, setSimulationForkLabel] = useState("manual checkpoint");
  const [simulationForkId, setSimulationForkId] = useState("");
  const [simulationRunId, setSimulationRunId] = useState<string | undefined>();
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus | undefined>();
  const [simulationResult, setSimulationResult] = useState<string | undefined>();

  async function refreshSimulationStatus() {
    if (!selectedWorld) {
      return;
    }
    const status = await client.simulation.getStatus(selectedWorld.id);
    setSimulationStatus(status);
    setSimulationResult(
      `Status: tick ${status.tick} · ${status.paused ? "paused" : "running"} · ${status.activeRuns.length} background run(s)`,
    );
  }

  async function runSimulationTicks() {
    if (!selectedWorld) {
      return;
    }
    const result = await client.simulation.runTicks(selectedWorld.id, {
      ticks: parsePositiveInt(simulationTicks, 1),
      maxActivations: parsePositiveInt(simulationMaxActivations, 3),
      seed: simulationSeed.trim() || undefined,
      roomId: selectedRoom?.id,
      idempotencyKey: `web-simulation-${Date.now()}`,
    });
    const lastTick = result.ticks.at(-1);
    setSimulationResult(
      lastTick
        ? `Ran ${result.ticks.length} tick(s) · tick ${lastTick.tick} · ${lastTick.replayHash.slice(0, 12)}`
        : `${result.status} · ${result.eventCount} events`,
    );
    await reload();
    await refreshSimulationStatus();
  }

  async function pauseSimulation() {
    if (!selectedWorld) {
      return;
    }
    const result = await client.simulation.pause(selectedWorld.id, {
      reason: "Paused from Web UI.",
      idempotencyKey: `web-simulation-pause-${Date.now()}`,
    });
    setSimulationResult(`Paused at state v${result.stateVersion}`);
    await reload();
    await refreshSimulationStatus();
  }

  async function resumeSimulation() {
    if (!selectedWorld) {
      return;
    }
    const result = await client.simulation.resume(selectedWorld.id, {
      forkId: simulationForkId.trim() || undefined,
      reason: "Resumed from Web UI.",
      idempotencyKey: `web-simulation-resume-${Date.now()}`,
    });
    setSimulationResult(
      result.forkId
        ? `Resumed fork ${result.forkId} at state v${result.stateVersion}`
        : `Resumed at state v${result.stateVersion}`,
    );
    await reload();
    await refreshSimulationStatus();
  }

  async function exportSimulation() {
    if (!selectedWorld) {
      return;
    }
    const result = await client.simulation.exportWorld(selectedWorld.id);
    setSimulationResult(
      `Exported ${result.eventCount} events · replay ${result.replayHash.slice(0, 12)} · state ${result.stateHash.slice(0, 12)}`,
    );
  }

  async function forkSimulation() {
    if (!selectedWorld) {
      return;
    }
    const result = await client.simulation.fork(selectedWorld.id, {
      label: simulationForkLabel.trim() || "manual checkpoint",
      idempotencyKey: `web-simulation-fork-${Date.now()}`,
    });
    setSimulationForkId(result.forkId);
    setSimulationResult(`Forked ${result.forkId} · state ${result.stateHash.slice(0, 12)}`);
  }

  async function startBackgroundSimulation() {
    if (!selectedWorld) {
      return;
    }
    const run = await client.simulation.startBackground(selectedWorld.id, {
      ticks: parsePositiveInt(simulationTicks, 1),
      maxActivations: parsePositiveInt(simulationMaxActivations, 3),
      intervalMs: parsePositiveInt(simulationIntervalMs, 1000),
      seed: simulationSeed.trim() || undefined,
      roomId: selectedRoom?.id,
      idempotencyKey: `web-simulation-background-${Date.now()}`,
    });
    setSimulationRunId(run.runId);
    setSimulationResult(`Background run started · ${run.plannedTicks} tick(s)`);
    await refreshSimulationStatus();
  }

  async function stopBackgroundSimulation() {
    if (!simulationRunId) {
      return;
    }
    const run = await client.simulation.stopBackground(simulationRunId);
    setSimulationRunId(undefined);
    setSimulationResult(`Background run ${run.status}`);
    await reload();
    await refreshSimulationStatus();
  }

  return {
    exportSimulation,
    forkSimulation,
    pauseSimulation,
    refreshSimulationStatus,
    resumeSimulation,
    runSimulationTicks,
    setSimulationForkId,
    setSimulationForkLabel,
    setSimulationIntervalMs,
    setSimulationMaxActivations,
    setSimulationSeed,
    setSimulationTicks,
    simulationForkId,
    simulationForkLabel,
    simulationIntervalMs,
    simulationMaxActivations,
    simulationResult,
    simulationRunId,
    simulationSeed,
    simulationStatus,
    simulationTicks,
    startBackgroundSimulation,
    stopBackgroundSimulation,
  };
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
