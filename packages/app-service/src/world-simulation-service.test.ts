import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject, writeYamlFile } from "@realm/config";
import { RealmApplicationService } from "./index.ts";

describe("WorldSimulationService", () => {
  test("runs deterministic low-cost ticks with state snapshots and scheduler audit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-simulation-ticks-"));
    await writeSimulationFixture(root);
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const result = await service.worldSimulation.runTicks("cultivation", {
      ticks: 2,
      seed: "fixture-seed",
      maxActivations: 1,
      idempotencyKey: "fixture",
    });
    const state = await service.getWorldState("cultivation");
    const auditReasons = service
      .listEvents()
      .filter((event) => event.type === "audit.created")
      .map((event) => (event.type === "audit.created" ? event.audit.reason : ""));

    expect(result.status).toBe("completed");
    expect(result.ticks).toHaveLength(2);
    expect(
      result.ticks.map((tick) => tick.decisions.find((item) => item.activated)?.roleId),
    ).toEqual(["guchenfeng", "guchenfeng"]);
    expect(
      result.ticks.map((tick) => tick.decisions.filter((item) => item.activated).length),
    ).toEqual([1, 1]);
    expect(result.replayHash).toHaveLength(64);
    expect(state.version).toBe(4);
    expect(JSON.stringify(state.state)).toContain('"energy"');
    expect(JSON.stringify(state.state)).toContain('"reputation"');
    expect(JSON.stringify(state.state)).toContain('"energy":92');
    expect(JSON.stringify(state.state)).toContain('"reputation":4');
    expect(JSON.stringify(state.state)).toContain('"doctrine"');
    expect(auditReasons.some((reason) => reason?.includes("active"))).toBe(true);
  });

  test("pauses, exports, forks, and resumes a simulation from a fork", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-simulation-fork-"));
    await writeSimulationFixture(root);
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    await service.worldSimulation.runTicks("cultivation", {
      ticks: 1,
      seed: "fork-seed",
      idempotencyKey: "fork-base",
    });
    const paused = await service.worldSimulation.pause("cultivation", {
      reason: "Manual pause for branch.",
      idempotencyKey: "pause-1",
    });
    const exported = await service.worldSimulation.exportWorld("cultivation");
    const fork = await service.worldSimulation.forkWorld("cultivation", {
      label: "branch A",
      idempotencyKey: "branch-a",
    });
    await service.worldSimulation.runTicks("cultivation", {
      ticks: 1,
      seed: "mutate-after-fork",
      idempotencyKey: "mutate",
    });
    const resumed = await service.worldSimulation.resume("cultivation", {
      forkId: fork.forkId,
      reason: "Restore branch A.",
      idempotencyKey: "resume-branch-a",
    });

    expect(paused.paused).toBe(true);
    expect(exported.eventCount).toBeGreaterThan(0);
    expect(fork.replayHash).toBe(exported.replayHash);
    expect(await readFile(fork.path, "utf8")).toContain('"forkId": "branch-a"');
    expect(resumed.paused).toBe(false);
    expect((await service.worldSimulation.getStatus("cultivation")).paused).toBe(false);
  });

  test("starts and stops a background simulation run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-simulation-background-"));
    await writeSimulationFixture(root);
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const run = service.worldSimulation.startBackground("cultivation", {
      ticks: 10,
      intervalMs: 20,
      seed: "background-seed",
    });
    await new Promise((resolve) => setTimeout(resolve, 45));
    const stopped = service.worldSimulation.stopBackground(run.runId);

    expect(run.status).toBe("running");
    expect(stopped.status).toBe("stopped");
    expect(service.listEvents().some((event) => event.type === "world.tick.triggered")).toBe(true);
  });
});

async function writeSimulationFixture(root: string): Promise<void> {
  const layout = await initProject(root, "demo");
  const worldDir = path.join(layout.worldsDir, "cultivation");
  await mkdir(worldDir, { recursive: true });
  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "cultivation",
    name: "Cultivation",
    mode: { type: "game", time: { kind: "manual" } },
    rooms: { main: { type: "world-main", name: "All Hands" } },
    roles: [
      { id: "leijun", model: "default" },
      { id: "guchenfeng", model: "default" },
    ],
  });
}
