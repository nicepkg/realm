import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { FakePiBridge } from "@realm/pi-bridge";
import { createRealmServer } from "./index.ts";

describe("Realm server API", () => {
  test("serves world state in default read-only trust mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-read-only-state-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root });

    const response = await app.request("/api/worlds/cultivation/state");
    const payload = (await response.json()) as { worldId: string; version: number };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ worldId: "cultivation", version: 0 });
  });

  test("serves role memory through the operator read-only endpoint", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-role-memory-"));
    await initProject(root, "demo");
    const memoryDir = path.join(root, ".agents", "state", "roles", "leijun");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(path.join(memoryDir, "memory.md"), "remember launch plan", "utf8");
    const app = createRealmServer({ root });

    const response = await app.request("/api/worlds/cultivation/roles/leijun/memory");
    const payload = (await response.json()) as { content: string };

    expect(response.status).toBe(200);
    expect(payload.content).toBe("remember launch plan");
  });

  test("accepts a message and returns it from the room query", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-message-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const sendResponse = await app.request("/api/rooms/main/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        displayedAuthorId: "owner",
        content: "Hello realm.",
      }),
    });
    expect(sendResponse.status).toBe(201);

    const listResponse = await app.request("/api/rooms/main/messages");
    const payload = (await listResponse.json()) as { messages: Array<{ content: string }> };
    expect(payload.messages.map((message) => message.content)).toEqual(["Hello realm."]);
  });

  test("exposes the full audit timeline including impersonation entries", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-audits-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    // Send as a role (impersonation) so an audit entry is recorded.
    await app.request("/api/rooms/main/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        displayedAuthorId: "leijun",
        content: "Speaking as Lei Jun.",
      }),
    });

    const response = await app.request("/api/worlds/cultivation/audits");
    const payload = (await response.json()) as {
      audits: Array<{ kind: string; action: string; actorId: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.audits.some((entry) => entry.kind === "impersonation")).toBe(true);
  });

  test("ignores caller-supplied operators on the public message API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-message-operator-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const sendResponse = await app.request("/api/rooms/main/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        operatorId: "leijun",
        displayedAuthorId: "leijun",
        content: "I should still be audited as owner.",
      }),
    });
    const payload = (await sendResponse.json()) as {
      message: { displayedAuthorId: string; realOperatorId?: string };
    };

    expect(sendResponse.status).toBe(201);
    expect(payload.message).toMatchObject({
      displayedAuthorId: "leijun",
      realOperatorId: "owner",
    });
  });

  test("proposes and applies role config through API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-config-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const proposalResponse = await app.request("/api/config/patches/role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "qa",
        displayName: "QA",
        model: "default",
        summary: "Regression reviewer.",
      }),
    });
    const proposalPayload = (await proposalResponse.json()) as { patch: { id: string } };
    const applyResponse = await app.request(
      `/api/config/patches/${proposalPayload.patch.id}/apply`,
      {
        method: "POST",
      },
    );

    expect(proposalResponse.status).toBe(201);
    expect(applyResponse.status).toBe(200);
    expect((await app.request("/api/roles")).status).toBe(200);
  });

  test("creates runtime rooms through API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-room-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const createResponse = await app.request("/api/worlds/cultivation/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "dm",
        name: "Owner / QA",
        memberIds: ["owner", "qa"],
      }),
    });
    const listResponse = await app.request("/api/worlds/cultivation/rooms");
    const payload = (await listResponse.json()) as { rooms: Array<{ name: string; type: string }> };

    expect(createResponse.status).toBe(201);
    expect(payload.rooms).toContainEqual(
      expect.objectContaining({ name: "Owner / QA", type: "dm" }),
    );
  });

  test("reads and writes settings through API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-settings-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-server-settings-home-"));
    await initProject(root, "demo");
    const app = createRealmServer({
      root,
      env: { REALM_HOME: realmHome },
      trustTier: "run-roles",
    });
    const settingsResponse = await app.request("/api/settings");
    const settings = (await settingsResponse.json()) as {
      user: { defaultProvider: string; defaultModel: string };
      project: { project: { name: string }; security: { allowNetworkByDefault: boolean } };
    };

    const userResponse = await app.request("/api/settings/user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...settings.user, defaultProvider: "google" }),
    });
    const projectResponse = await app.request("/api/settings/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...settings.project,
        project: { name: "server-settings" },
        security: { ...settings.project.security, allowNetworkByDefault: true },
      }),
    });

    expect(settingsResponse.status).toBe(200);
    expect(userResponse.status).toBe(200);
    expect(projectResponse.status).toBe(200);
  });

  test("runs role turns through the API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-role-turn-"));
    await initProject(root, "demo");
    const app = createRealmServer({
      root,
      piBridge: new FakePiBridge(),
      trustTier: "run-roles",
    });
    const proposalResponse = await app.request("/api/config/patches/role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "leijun",
        displayName: "Lei Jun",
        model: "default",
        summary: "Product builder.",
      }),
    });
    const proposalPayload = (await proposalResponse.json()) as { patch: { id: string } };
    await app.request(`/api/config/patches/${proposalPayload.patch.id}/apply`, { method: "POST" });

    const response = await app.request("/api/rooms/main/role-turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        roleId: "leijun",
        prompt: "Hello",
        timeoutMs: 500,
      }),
    });
    const payload = (await response.json()) as { message: { content: string } };

    expect(response.status).toBe(201);
    expect(payload.message.content).toBe("[leijun] Hello");
  });

  test("commits admin state patches through the API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-admin-state-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const patchResponse = await app.request("/api/admin/state-patch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
        reason: "God triggered a storm.",
      }),
    });
    const patchPayload = (await patchResponse.json()) as { result: { status: string } };
    const stateResponse = await app.request("/api/worlds/cultivation/state");
    const statePayload = (await stateResponse.json()) as { version: number; state: unknown };

    expect(patchResponse.status).toBe(201);
    expect(patchPayload.result.status).toBe("committed");
    expect(statePayload.version).toBe(1);
    expect(JSON.stringify(statePayload.state)).toContain("storm");
  });

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
