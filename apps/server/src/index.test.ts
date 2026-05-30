import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { FakePiBridge, fakeReply } from "@realm/pi-bridge";
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

  test("assistant config attaches an added role to the active world via worldId", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-assistant-attach-"));
    await initProject(root, "demo");
    const worldDir = path.join(root, ".agents", "worlds", "cultivation");
    await mkdir(worldDir, { recursive: true });
    await writeFile(
      path.join(worldDir, "world.yaml"),
      [
        "version: 1",
        "id: cultivation",
        "name: 云岭修仙界",
        "mode:",
        "  type: sandbox",
        "  time:",
        "    kind: manual",
        "rooms:",
        "  main:",
        "    type: world-main",
        "    name: main",
        "roles: []",
        "",
      ].join("\n"),
    );
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const response = await app.request("/api/assistant/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "加一个叫云遥的角色", worldId: "cultivation" }),
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      patch: { operations: Array<{ path: string; action: string }> };
    };

    const worldOp = payload.patch.operations.find(
      (op) => op.path === ".agents/worlds/cultivation/world.yaml",
    );
    expect(worldOp?.action).toBe("update");
    // The role-create op is still present alongside the world attachment.
    expect(payload.patch.operations.some((op) => op.path.startsWith(".agents/roles/"))).toBe(true);
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
    expect(payload.message.content).toBe(fakeReply("leijun", 0));
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
});
