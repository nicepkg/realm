import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { CapabilityPolicy } from "@realm/policy";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService workflow", () => {
  test("creates workflow artifacts, tasks, reviews, and approval gate events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-workflow-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const artifact = service.createWorkflowArtifact({
      worldId: "software-company",
      title: "Add settings search",
      kind: "spec",
      content: "Users can search settings by label.",
      ownerRoleId: "product-manager",
      idempotencyKey: "artifact-settings-search",
    });
    const task = service.createWorkflowTask({
      worldId: "software-company",
      title: "Implement settings search",
      ownerRoleId: "engineer",
      artifactId: artifact.id,
    });
    const review = service.requestWorkflowReview({
      worldId: "software-company",
      artifactId: artifact.id,
      requestedBy: "engineer",
      reviewerRoleId: "qa",
      summary: "Review the feature plan.",
    });
    const decision = service.decideWorkflowReview({
      worldId: "software-company",
      reviewId: review.id,
      artifactId: artifact.id,
      reviewerRoleId: "qa",
      decision: "approved",
      summary: "Plan covers the happy path and rollback.",
    });
    const approval = service.requestWorkflowApproval({
      worldId: "software-company",
      capability: "fs.project.write",
      requestedBy: "engineer",
      reason: "Need to patch the fixture repository.",
    });
    const approved = service.decideWorkflowApproval({
      worldId: "software-company",
      approvalId: approval.id,
      capability: "fs.project.write",
      requestedBy: "engineer",
      decision: "approved",
      reason: "Patch is scoped and reviewed.",
      requestReason: approval.reason,
    });
    const directProjectWrite = new CapabilityPolicy().decide({
      principal: { id: "engineer", kind: "role" },
      capability: "fs.project.write",
      trustTier: "run-roles",
      allowedCapabilities: ["fs.project.write"],
    });

    expect(artifact.status).toBe("draft");
    expect(task.artifactId).toBe(artifact.id);
    expect(decision.status).toBe("approved");
    expect(approval.status).toBe("pending");
    expect(approved.status).toBe("approved");
    expect(directProjectWrite.allow).toBe(false);
    expect(service.listEvents().map((event) => event.type)).toContain("workflow.review.decided");
    expect(service.listEvents().map((event) => event.type)).toContain("workflow.approval.decided");
  });

  test("applies project patches only after fs.project.write approval", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-project-patch-"));
    await initProject(root, "demo");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "feature.txt"), "before\n", "utf8");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });
    const patch = await service.proposeProjectPatch({
      worldId: "software-company",
      title: "Update fixture feature",
      requestedBy: "engineer",
      files: [{ path: "src/feature.txt", action: "update", nextContent: "after\n" }],
    });

    await expect(
      service.applyProjectPatch({
        worldId: "software-company",
        patchId: patch.id,
        approvalId: "approval:missing",
      }),
    ).rejects.toThrow("requires approved fs.project.write approval");
    await expect(readFile(path.join(root, "src", "feature.txt"), "utf8")).resolves.toBe("before\n");

    const approval = service.requestWorkflowApproval({
      worldId: "software-company",
      capability: "fs.project.write",
      requestedBy: "engineer",
      reason: "Patch the fixture file.",
    });
    service.decideWorkflowApproval({
      worldId: "software-company",
      approvalId: approval.id,
      capability: "fs.project.write",
      requestedBy: "engineer",
      decision: "approved",
      reason: "Reviewed and scoped.",
      requestReason: approval.reason,
    });
    const applied = await service.applyProjectPatch({
      worldId: "software-company",
      patchId: patch.id,
      approvalId: approval.id,
    });

    expect(applied.status).toBe("applied");
    await expect(readFile(path.join(root, "src", "feature.txt"), "utf8")).resolves.toBe("after\n");
    expect(service.listEvents().map((event) => event.type)).toContain(
      "workflow.project_patch.applied",
    );
  });

  test("project patch apply is idempotent before touching files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-project-patch-idempotent-"));
    await initProject(root, "demo");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "feature.txt"), "before\n", "utf8");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });
    const patch = await service.proposeProjectPatch({
      worldId: "software-company",
      title: "Update fixture feature",
      requestedBy: "engineer",
      files: [{ path: "src/feature.txt", action: "update", nextContent: "after\n" }],
      idempotencyKey: "project-patch-proposal-1",
    });
    const duplicateProposal = await service.proposeProjectPatch({
      worldId: "software-company",
      title: "Ignored duplicate payload",
      requestedBy: "engineer",
      files: [{ path: "src/feature.txt", action: "update", nextContent: "ignored\n" }],
      idempotencyKey: "project-patch-proposal-1",
    });
    const approval = service.requestWorkflowApproval({
      worldId: "software-company",
      capability: "fs.project.write",
      requestedBy: "engineer",
      reason: "Patch the fixture file.",
    });
    service.decideWorkflowApproval({
      worldId: "software-company",
      approvalId: approval.id,
      capability: "fs.project.write",
      requestedBy: "engineer",
      decision: "approved",
      reason: "Reviewed and scoped.",
      requestReason: approval.reason,
    });

    const firstApply = await service.applyProjectPatch({
      worldId: "software-company",
      patchId: patch.id,
      approvalId: approval.id,
      idempotencyKey: "project-patch-apply-1",
    });
    const secondApply = await service.applyProjectPatch({
      worldId: "software-company",
      patchId: patch.id,
      approvalId: approval.id,
      idempotencyKey: "project-patch-apply-1",
    });

    expect(duplicateProposal.id).toBe(patch.id);
    expect(firstApply.id).toBe(patch.id);
    expect(secondApply).toEqual(firstApply);
    await expect(readFile(path.join(root, "src", "feature.txt"), "utf8")).resolves.toBe("after\n");
  });

  test("project patches cannot target runtime state or log directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-project-patch-protected-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    await expect(
      service.proposeProjectPatch({
        worldId: "software-company",
        title: "Delete state",
        requestedBy: "engineer",
        files: [{ path: ".agents/state", action: "delete" }],
      }),
    ).rejects.toThrow("machine-local Realm data");
    await expect(
      service.proposeProjectPatch({
        worldId: "software-company",
        title: "Patch logs",
        requestedBy: "engineer",
        files: [{ path: ".agents/logs/run.txt", action: "create", nextContent: "log\n" }],
      }),
    ).rejects.toThrow("machine-local Realm data");
  });
});
