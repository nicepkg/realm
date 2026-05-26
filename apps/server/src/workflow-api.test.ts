import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { createRealmServer } from "./index.ts";

describe("Realm workflow API", () => {
  test("exposes artifact, review, approval, and project patch endpoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-workflow-"));
    await initProject(root, "demo");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "feature.txt"), "before\n", "utf8");
    const app = createRealmServer({ root, trustTier: "run-roles" });

    const artifactResponse = await app.request("/api/worlds/software-company/workflow/artifacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Add settings search",
        kind: "spec",
        content: "Users can search settings.",
        ownerRoleId: "product-manager",
      }),
    });
    const artifactPayload = (await artifactResponse.json()) as { artifact: { id: string } };
    const reviewResponse = await app.request("/api/worlds/software-company/workflow/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artifactId: artifactPayload.artifact.id,
        requestedBy: "engineer",
        reviewerRoleId: "qa",
        summary: "Review the plan.",
      }),
    });
    const reviewPayload = (await reviewResponse.json()) as { review: { id: string } };
    const decisionResponse = await app.request(
      `/api/worlds/software-company/workflow/reviews/${reviewPayload.review.id}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewId: reviewPayload.review.id,
          artifactId: artifactPayload.artifact.id,
          reviewerRoleId: "qa",
          decision: "approved",
          summary: "Looks shippable.",
        }),
      },
    );
    const approvalResponse = await app.request("/api/worlds/software-company/workflow/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capability: "fs.project.write",
        requestedBy: "engineer",
        reason: "Patch the fixture.",
      }),
    });
    const approvalPayload = (await approvalResponse.json()) as { approval: { id: string } };
    await app.request(
      `/api/worlds/software-company/workflow/approvals/${approvalPayload.approval.id}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvalId: approvalPayload.approval.id,
          capability: "fs.project.write",
          requestedBy: "engineer",
          decision: "approved",
          reason: "Scoped patch.",
          requestReason: "Patch the fixture.",
        }),
      },
    );
    const patchResponse = await app.request(
      "/api/worlds/software-company/workflow/project-patches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Patch fixture",
          requestedBy: "engineer",
          files: [{ path: "src/feature.txt", action: "update", nextContent: "after\n" }],
        }),
      },
    );
    const patchPayload = (await patchResponse.json()) as { projectPatch: { id: string } };
    const applyResponse = await app.request(
      `/api/worlds/software-company/workflow/project-patches/${patchPayload.projectPatch.id}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId: approvalPayload.approval.id }),
      },
    );

    expect(artifactResponse.status).toBe(201);
    expect(reviewResponse.status).toBe(201);
    expect(decisionResponse.status).toBe(201);
    expect(approvalResponse.status).toBe(201);
    expect(patchResponse.status).toBe(201);
    expect(applyResponse.status).toBe(201);
    await expect(readFile(path.join(root, "src", "feature.txt"), "utf8")).resolves.toBe("after\n");
  });
});
