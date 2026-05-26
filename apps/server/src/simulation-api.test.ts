import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { createRealmServer } from "./index.ts";

describe("Realm simulation API", () => {
  test("runs, pauses, exports, forks, and resumes simulation worlds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-simulation-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const runResponse = await app.request("/api/worlds/cultivation/simulation/ticks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1, seed: "api-seed", maxActivations: 1 }),
    });
    const pauseResponse = await app.request("/api/worlds/cultivation/simulation/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "test pause" }),
    });
    const exportResponse = await app.request("/api/worlds/cultivation/simulation/export");
    const forkResponse = await app.request("/api/worlds/cultivation/simulation/forks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "api fork", idempotencyKey: "api-fork" }),
    });
    const fork = (await forkResponse.json()) as { forkId: string };
    const resumeResponse = await app.request("/api/worlds/cultivation/simulation/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ forkId: fork.forkId, reason: "resume fork" }),
    });

    expect(runResponse.status).toBe(201);
    expect(pauseResponse.status).toBe(200);
    expect(exportResponse.status).toBe(200);
    expect(forkResponse.status).toBe(201);
    expect(resumeResponse.status).toBe(200);
    expect(await app.request("/api/worlds/cultivation/simulation/status")).toMatchObject({
      status: 200,
    });
  });
});
