import { describe, expect, test } from "bun:test";
import { RealmHttpClient } from "./index.ts";

describe("RealmHttpClient", () => {
  test("posts typed settings updates", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          user: requestBody,
          project: {
            version: 1,
            project: { name: "demo" },
            defaults: { world: "cultivation", modelProfile: "default" },
            skills: {},
            security: {
              requireTrust: true,
              allowProjectShellByDefault: false,
              allowNetworkByDefault: false,
            },
          },
          paths: {
            userConfigPath: "/tmp/.realm/config.yaml",
            projectConfigPath: "/tmp/demo/.agents/config.yaml",
            projectLocalConfigPath: "/tmp/demo/.agents/config.local.yaml",
          },
        });
      }) as typeof fetch,
    });

    const response = await client.updateUserSettings({
      version: 1,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-flash",
      providers: [],
      web: { host: "127.0.0.1", preferredPort: 3737, openBrowser: true },
    });

    expect(requestPath).toBe("/api/settings/user");
    expect(response.user.defaultProvider).toBe("google");
  });

  test("exports and imports portable settings", async () => {
    const requestPaths: string[] = [];
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        const path = new URL(String(input), "http://realm.test").pathname;
        requestPaths.push(path);
        const settings = {
          user: {
            version: 1,
            defaultProvider: "openai",
            defaultModel: "gpt-5",
            providers: [],
            web: { host: "127.0.0.1", preferredPort: 3737, openBrowser: true },
          },
          project: {
            version: 1,
            project: { name: "demo" },
            defaults: { world: "cultivation", modelProfile: "default" },
            skills: {},
            security: {
              requireTrust: true,
              allowProjectShellByDefault: false,
              allowNetworkByDefault: false,
            },
          },
        };
        if (path.endsWith("/export")) {
          return Response.json({
            version: 1,
            exportedAt: "2026-05-27T00:00:00.000Z",
            ...settings,
            redactions: ["provider secret values are never exported"],
          });
        }
        expect(JSON.parse(String(init?.body))).toEqual(settings);
        return Response.json({
          ...settings,
          paths: {
            userConfigPath: "/tmp/.realm/config.yaml",
            projectConfigPath: "/tmp/demo/.agents/config.yaml",
            projectLocalConfigPath: "/tmp/demo/.agents/config.local.yaml",
          },
        });
      }) as typeof fetch,
    });

    const exported = await client.exportSettings();
    await client.importSettings({ user: exported.user, project: exported.project });

    expect(requestPaths).toEqual(["/api/settings/export", "/api/settings/import"]);
  });

  test("posts config patch typed confirmation", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          patchId: "patch-1",
          historyId: "history-1",
          changedPaths: [".agents/worlds/cultivation/world.yaml"],
        });
      }) as typeof fetch,
    });

    const response = await client.applyConfigPatch("patch-1", { confirmation: "APPLY patch-1" });

    expect(requestPath).toBe("/api/config/patches/patch-1/apply");
    expect(requestBody).toEqual({ confirmation: "APPLY patch-1" });
    expect(response.historyId).toBe("history-1");
  });

  test("starts and cancels role turns", async () => {
    const requestPaths: string[] = [];
    const client = new RealmHttpClient({
      fetchImpl: (async (input) => {
        const path = new URL(String(input), "http://realm.test").pathname;
        requestPaths.push(path);
        if (path.endsWith("/start")) {
          return Response.json({ turnId: "turn-1" }, { status: 202 });
        }
        return Response.json({ turnId: "turn-1", cancelled: true });
      }) as typeof fetch,
    });

    const started = await client.startRoleTurn("main", {
      worldId: "cultivation",
      roleId: "leijun",
      timeoutMs: 500,
    });
    const cancelled = await client.cancelTurn(started.turnId);

    expect(requestPaths).toEqual(["/api/rooms/main/role-turns/start", "/api/turns/turn-1/cancel"]);
    expect(cancelled.cancelled).toBe(true);
  });

  test("gets effective policy matrix", async () => {
    let requestPath = "";
    const client = new RealmHttpClient({
      fetchImpl: (async (input) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        return Response.json({
          trustTier: "run-roles",
          capabilities: [
            {
              capability: "network.fetch",
              allow: false,
              reason: "network.fetch requires elevated tool trust",
              remediation: "Raise the trust tier and enable the capability explicitly.",
              highRisk: true,
            },
          ],
          roleWorlds: [
            {
              worldId: "cultivation",
              roleId: "leijun",
              allowedSkills: [
                {
                  id: "role-private:leijun:private-note",
                  name: "private-note",
                  scope: "role-private",
                  source: "role-private",
                  roleId: "leijun",
                  relativePath: ".agents/roles/leijun/skills/private-note",
                  path: "/tmp/demo/.agents/roles/leijun/skills/private-note",
                  contentHash: "hash",
                },
              ],
              deniedSkills: [],
            },
          ],
          warnings: ["Network fetch is disabled by project policy."],
        });
      }) as typeof fetch,
    });

    const policy = await client.getEffectivePolicy();

    expect(requestPath).toBe("/api/policy/effective");
    expect(policy.roleWorlds[0]?.allowedSkills[0]?.id).toBe("role-private:leijun:private-note");
  });

  test("reads role memory through the operator endpoint", async () => {
    let requestPath = "";
    const client = new RealmHttpClient({
      fetchImpl: (async (input) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        return Response.json({ content: "remember launch plan" });
      }) as typeof fetch,
    });

    const response = await client.readRoleMemory("cultivation", "leijun");

    expect(requestPath).toBe("/api/worlds/cultivation/roles/leijun/memory");
    expect(response.content).toBe("remember launch plan");
  });

  test("posts typed God role actions to the world endpoint", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(
          {
            action: {
              worldId: "cultivation",
              action: requestBody.action,
              targetRoleId: requestBody.targetRoleId,
              expectedVersion: requestBody.expectedVersion,
              reason: requestBody.reason,
              idempotencyKey: requestBody.idempotencyKey,
            },
            patch: {
              id: "state-patch:1",
              worldId: "cultivation",
              actorId: "god",
              proposedBy: "owner",
              approvedBy: "owner",
              baseVersion: 0,
              expectedVersion: 0,
              idempotencyKey: "client-god-kill",
              operations: [{ op: "set", path: "/metaState/roles/leijun/alive", value: false }],
              reason: "God adjudicated fatal damage.",
              createdAt: "2026-05-27T00:00:00.000Z",
            },
            result: {
              status: "committed",
              patchId: "state-patch:1",
              version: 1,
              state: { metaState: { roles: { leijun: { alive: false } } } },
            },
          },
          { status: 201 },
        );
      }) as typeof fetch,
    });

    const response = await client.applyGodRoleAction("cultivation", {
      action: "kill",
      targetRoleId: "leijun",
      expectedVersion: 0,
      reason: "God adjudicated fatal damage.",
      idempotencyKey: "client-god-kill",
    });

    expect(requestPath).toBe("/api/god/cultivation/actions");
    expect(requestBody).toMatchObject({ action: "kill", targetRoleId: "leijun" });
    expect(response.result).toMatchObject({ status: "committed", version: 1 });
  });

  test("posts typed natural events to the world endpoint", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(
          {
            event: { worldId: "cultivation", ...requestBody },
            patch: {
              id: "state-patch:1",
              worldId: "cultivation",
              actorId: "god",
              proposedBy: "owner",
              approvedBy: "owner",
              baseVersion: 0,
              expectedVersion: 0,
              operations: requestBody.operations,
              reason: "Natural event: Storm. A storm changes the weather.",
              createdAt: "2026-05-27T00:00:00.000Z",
            },
            result: {
              status: "committed",
              patchId: "state-patch:1",
              version: 1,
              state: { publicState: { weather: "storm" } },
            },
          },
          { status: 201 },
        );
      }) as typeof fetch,
    });

    const response = await client.triggerNaturalEvent("cultivation", {
      title: "Storm",
      description: "A storm changes the weather.",
      operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
    });

    expect(requestPath).toBe("/api/god/cultivation/natural-events");
    expect(requestBody).toMatchObject({ title: "Storm" });
    expect(response.result).toMatchObject({ status: "committed", version: 1 });
  });
});
