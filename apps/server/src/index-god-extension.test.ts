import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { createRealmServer } from "./index.ts";

describe("Realm server God, natural-event, and extension API", () => {
  test("applies typed God role actions through the API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-god-action-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const response = await app.request("/api/god/cultivation/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "kill",
        targetRoleId: "leijun",
        reason: "God adjudicated fatal damage.",
      }),
    });
    const payload = (await response.json()) as {
      action: { worldId: string; action: string; targetRoleId: string };
      result: { status: string };
    };
    const statePayload = (await (await app.request("/api/worlds/cultivation/state")).json()) as {
      state: unknown;
    };

    expect(response.status).toBe(201);
    expect(payload.action).toMatchObject({
      worldId: "cultivation",
      action: "kill",
      targetRoleId: "leijun",
    });
    expect(payload.result.status).toBe("committed");
    expect(JSON.stringify(statePayload.state)).toContain('"alive":false');
  });

  test("triggers natural events through the API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-natural-event-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const response = await app.request("/api/god/cultivation/natural-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Storm",
        description: "A storm changes the weather.",
        severity: "minor",
        operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
      }),
    });
    const payload = (await response.json()) as {
      event: { worldId: string; title: string };
      result: { status: string };
    };

    expect(response.status).toBe(201);
    expect(payload.event).toMatchObject({ worldId: "cultivation", title: "Storm" });
    expect(payload.result.status).toBe("committed");
  });

  test("triggers random natural events through the API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-random-event-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const response = await app.request("/api/god/cultivation/natural-events/random", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seed: "day-1",
        targetRoleIds: ["leijun"],
      }),
    });
    const payload = (await response.json()) as {
      event: { worldId: string; title: string };
      result: { status: string };
    };

    expect(response.status).toBe(201);
    expect(payload.event.worldId).toBe("cultivation");
    expect(payload.event.title.length).toBeGreaterThan(0);
    expect(payload.result.status).toBe("committed");
  });

  test("serves extension state and memory endpoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-extension-"));
    await initProject(root, "demo");
    const worldDir = path.join(root, ".agents", "worlds", "cultivation");
    await mkdir(worldDir, { recursive: true });
    await writeFile(
      path.join(worldDir, "initial-state.yaml"),
      [
        "publicState:",
        "  weather: clear",
        "privateState:",
        "  roles:",
        "    leijun:",
        "      hp: 92",
        "metaState:",
        "  roles:",
        "    leijun:",
        "      alive: true",
        "",
      ].join("\n"),
    );
    const app = createRealmServer({
      root,
      trustTier: "run-roles",
      extensionStaticTokens: [{ token: "test-token", worldId: "cultivation", roleId: "leijun" }],
    });

    const stateResponse = await app.request("/api/extension/state-query", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        toolCallId: "tool-state-1",
        path: "/privateState",
      }),
    });
    const writeResponse = await app.request("/api/extension/memory-write", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        toolCallId: "tool-memory-write-1",
        content: "memory",
      }),
    });
    const readResponse = await app.request("/api/extension/memory-read", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        toolCallId: "tool-memory-read-1",
      }),
    });
    const statePayload = (await stateResponse.json()) as { state: unknown };
    const memoryPayload = (await readResponse.json()) as { content: string };

    expect(writeResponse.status).toBe(200);
    expect(JSON.stringify(statePayload.state)).toContain("hp");
    expect(memoryPayload.content).toBe("memory");
  });

  test("rejects extension calls without a scoped bearer token", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-extension-deny-"));
    await initProject(root, "demo");
    const app = createRealmServer({
      root,
      trustTier: "run-roles",
      extensionStaticTokens: [{ token: "test-token", worldId: "cultivation", roleId: "leijun" }],
    });

    const missingTokenResponse = await app.request("/api/extension/memory-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        toolCallId: "tool-denied-1",
      }),
    });
    const wrongRoleResponse = await app.request("/api/extension/memory-read", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "guchenfeng",
        toolCallId: "tool-denied-2",
      }),
    });

    expect(missingTokenResponse.status).toBe(401);
    expect(wrongRoleResponse.status).toBe(403);
  });

  test("exposes world event engine endpoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-world-events-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const manualResponse = await app.request("/api/worlds/cultivation/events/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Manual Storm",
        description: "God manually changes weather.",
        roomId: "main",
        operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
      }),
    });
    const tickResponse = await app.request("/api/worlds/cultivation/events/tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 1, seed: "day-1", targetRoleIds: ["leijun"] }),
    });
    const godEventResponse = await app.request("/api/worlds/cultivation/events/god-adjudicated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Duel Result",
        description: "God adjudicates a duel outcome.",
        operations: [{ op: "set", path: "/publicState/duel", value: "settled" }],
      }),
    });
    const replayResponse = await app.request("/api/worlds/cultivation/events/replay");
    const manualPayload = (await manualResponse.json()) as { event: { kind: string } };
    const tickPayload = (await tickResponse.json()) as { tick: { tick: number } };
    const replayPayload = (await replayResponse.json()) as {
      replayHash: string;
      events: Array<{ type: string }>;
    };

    expect(manualResponse.status).toBe(201);
    expect(tickResponse.status).toBe(201);
    expect(godEventResponse.status).toBe(201);
    expect(manualPayload.event.kind).toBe("manual");
    expect(tickPayload.tick.tick).toBe(1);
    expect(replayPayload.replayHash).toHaveLength(64);
    expect(replayPayload.events.map((event) => event.type)).toContain("world.event.triggered");
  });
});
