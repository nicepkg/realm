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
      defaultModel: "gemini-3.5-pro",
      providers: [],
      web: { host: "127.0.0.1", preferredPort: 3737, openBrowser: true },
    });

    expect(requestPath).toBe("/api/settings/user");
    expect(response.user.defaultProvider).toBe("google");
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

  test("posts typed random natural events to the world endpoint", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(
          {
            event: {
              worldId: "cultivation",
              title: "Unexpected Windfall",
              description: "Lei Jun receives a temporary opportunity.",
              severity: "minor",
              targetRoleIds: ["leijun"],
              operations: [
                { op: "set", path: "/privateState/roles/leijun/fortune", value: "windfall" },
              ],
            },
            patch: {
              id: "state-patch:1",
              worldId: "cultivation",
              actorId: "god",
              proposedBy: "owner",
              approvedBy: "owner",
              baseVersion: 0,
              expectedVersion: 0,
              operations: [
                { op: "set", path: "/privateState/roles/leijun/fortune", value: "windfall" },
              ],
              reason: "Natural event: Unexpected Windfall.",
              createdAt: "2026-05-27T00:00:00.000Z",
            },
            result: {
              status: "committed",
              patchId: "state-patch:1",
              version: 1,
              state: { privateState: { roles: { leijun: { fortune: "windfall" } } } },
            },
          },
          { status: 201 },
        );
      }) as typeof fetch,
    });

    const response = await client.triggerRandomNaturalEvent("cultivation", {
      seed: "day-1",
      targetRoleIds: ["leijun"],
    });

    expect(requestPath).toBe("/api/god/cultivation/natural-events/random");
    expect(requestBody).toMatchObject({ seed: "day-1" });
    expect(response.event.title).toBe("Unexpected Windfall");
  });

  test("posts typed workflow commands to world endpoints", async () => {
    const requestPaths: string[] = [];
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        const path = new URL(String(input), "http://realm.test").pathname;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestPaths.push(path);
        if (path.endsWith("/workflow/artifacts")) {
          return Response.json(
            {
              artifact: {
                id: "artifact:1",
                worldId: "software-company",
                title: body.title,
                kind: body.kind,
                status: "draft",
                content: body.content,
                createdAt: "2026-05-27T00:00:00.000Z",
              },
            },
            { status: 201 },
          );
        }
        if (path.endsWith("/workflow/project-patches")) {
          return Response.json(
            {
              projectPatch: {
                id: "project-patch:1",
                worldId: "software-company",
                title: body.title,
                summary: body.summary ?? "",
                requestedBy: body.requestedBy,
                status: "proposed",
                files: [
                  {
                    path: "src/feature.txt",
                    action: "update",
                    previousHash: "old",
                    nextHash: "new",
                    nextContent: "after",
                  },
                ],
                createdAt: "2026-05-27T00:00:00.000Z",
              },
            },
            { status: 201 },
          );
        }
        if (path.endsWith("/workflow/project-patches/project-patch%3A1/apply")) {
          return Response.json(
            {
              projectPatch: {
                id: "project-patch:1",
                worldId: "software-company",
                title: "Patch fixture",
                summary: "",
                requestedBy: "engineer",
                approvalId: body.approvalId,
                status: "applied",
                files: [
                  {
                    path: "src/feature.txt",
                    action: "update",
                    previousHash: "old",
                    nextHash: "new",
                    nextContent: "after",
                  },
                ],
                createdAt: "2026-05-27T00:00:00.000Z",
                appliedAt: "2026-05-27T00:01:00.000Z",
              },
            },
            { status: 201 },
          );
        }
        return Response.json(
          {
            approval: {
              id: "approval:1",
              worldId: "software-company",
              capability: body.capability,
              requestedBy: body.requestedBy,
              targetId: body.targetId,
              reason: body.reason,
              status: "pending",
              createdAt: "2026-05-27T00:00:00.000Z",
            },
          },
          { status: 201 },
        );
      }) as typeof fetch,
    });

    const artifact = await client.createWorkflowArtifact("software-company", {
      title: "Add settings search",
      kind: "spec",
      content: "Users can search settings.",
    });
    const approval = await client.requestWorkflowApproval("software-company", {
      capability: "fs.project.write",
      requestedBy: "engineer",
      targetId: "project-patch:1",
      reason: "Patch the fixture.",
    });
    const projectPatch = await client.proposeProjectPatch("software-company", {
      title: "Patch fixture",
      requestedBy: "engineer",
      files: [{ path: "src/feature.txt", action: "update", nextContent: "after" }],
    });
    const applied = await client.applyProjectPatch(
      "software-company",
      projectPatch.projectPatch.id,
      {
        approvalId: "approval:1",
      },
    );

    expect(requestPaths).toEqual([
      "/api/worlds/software-company/workflow/artifacts",
      "/api/worlds/software-company/workflow/approvals",
      "/api/worlds/software-company/workflow/project-patches",
      "/api/worlds/software-company/workflow/project-patches/project-patch%3A1/apply",
    ]);
    expect(artifact.artifact.status).toBe("draft");
    expect(approval.approval.status).toBe("pending");
    expect(projectPatch.projectPatch.status).toBe("proposed");
    expect(applied.projectPatch.status).toBe("applied");
  });
});
