import { describe, expect, test } from "bun:test";
import { RealmHttpClient } from "./index.ts";

describe("RealmHttpClient world events, trust, and audits", () => {
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

  test("sets the project trust tier", async () => {
    let requestPath = "";
    let requestBody: Record<string, unknown> = {};
    const client = new RealmHttpClient({
      fetchImpl: (async (input, init) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          trustTier: "run-roles",
          trustedAt: "2026-05-29T00:00:00.000Z",
        });
      }) as typeof fetch,
    });

    const response = await client.setTrust("run-roles");

    expect(requestPath).toBe("/api/trust");
    expect(requestBody).toEqual({ tier: "run-roles" });
    expect(response.trustTier).toBe("run-roles");
    expect(response.trustedAt).toBe("2026-05-29T00:00:00.000Z");
  });

  test("lists the world audit timeline", async () => {
    let requestPath = "";
    const client = new RealmHttpClient({
      fetchImpl: (async (input) => {
        requestPath = new URL(String(input), "http://realm.test").pathname;
        return Response.json({
          audits: [
            {
              id: "audit-1",
              kind: "impersonation",
              actorId: "owner",
              action: "role.impersonate",
              target: "leijun",
              visibility: "leijun",
              denied: false,
              seq: 7,
              createdAt: "2026-05-29T00:00:00.000Z",
            },
          ],
        });
      }) as typeof fetch,
    });

    const response = await client.listAudits("cultivation");

    expect(requestPath).toBe("/api/worlds/cultivation/audits");
    expect(response.audits[0]?.kind).toBe("impersonation");
    expect(response.audits[0]?.visibility).toBe("leijun");
  });
});
