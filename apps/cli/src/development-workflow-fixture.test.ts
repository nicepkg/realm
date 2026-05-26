import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RealmApplicationService } from "@realm/app-service";
import { initProject } from "@realm/config";
import { writeTemplate } from "./project-templates.ts";

describe("software company development workflow fixture", () => {
  test("discusses, patches, verifies, and reviews a fixed feature", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-dev-workflow-fixture-"));
    const layout = await initProject(root, "fixture-repo");
    await writeTemplate(layout, "software-company");
    await writeFixtureFeature(root);

    const service = new RealmApplicationService({ root, trustTier: "run-roles" });
    const mainRoom = (await service.listRooms("software-company")).find(
      (room) => room.id === "main",
    );
    if (!mainRoom) {
      throw new Error("software-company template did not create a main room");
    }

    service.sendMessage({
      worldId: "software-company",
      roomId: mainRoom.id,
      content: "Please implement title normalization for generated docs.",
      idempotencyKey: "fixture-message-owner",
    });
    service.sendMessage({
      worldId: "software-company",
      roomId: mainRoom.id,
      displayedAuthorId: "product-manager",
      content: "Acceptance: trim, collapse whitespace, and capitalize the first character.",
      idempotencyKey: "fixture-message-pm",
    });
    service.sendMessage({
      worldId: "software-company",
      roomId: mainRoom.id,
      displayedAuthorId: "architect",
      content: "Keep the change local to src/title.ts and prove it with a fixture test.",
      idempotencyKey: "fixture-message-architect",
    });

    const artifact = service.createWorkflowArtifact({
      worldId: "software-company",
      title: "Title normalization feature",
      kind: "spec",
      content: "Normalize generated document titles before rendering.",
      ownerRoleId: "product-manager",
      idempotencyKey: "fixture-artifact-title-normalization",
    });
    const task = service.createWorkflowTask({
      worldId: "software-company",
      title: "Implement formatTitle normalization",
      description: "Patch src/title.ts and verify src/title.test.ts.",
      ownerRoleId: "engineer",
      artifactId: artifact.id,
      idempotencyKey: "fixture-task-title-normalization",
    });
    const review = service.requestWorkflowReview({
      worldId: "software-company",
      artifactId: artifact.id,
      requestedBy: "engineer",
      reviewerRoleId: "qa",
      summary: "Review implementation scope and acceptance evidence.",
      idempotencyKey: "fixture-review-title-normalization",
    });
    const projectPatch = await service.proposeProjectPatch({
      worldId: "software-company",
      title: "Implement title normalization",
      summary: "Updates src/title.ts to satisfy the fixture acceptance test.",
      requestedBy: "engineer",
      files: [
        {
          path: "src/title.ts",
          action: "update",
          nextContent: normalizedTitleImplementation,
        },
      ],
      idempotencyKey: "fixture-project-patch-title-normalization",
    });

    await expect(
      service.applyProjectPatch({
        worldId: "software-company",
        patchId: projectPatch.id,
        approvalId: "approval:missing",
      }),
    ).rejects.toThrow("requires approved fs.project.write approval");
    await expect(readFile(path.join(root, "src", "title.ts"), "utf8")).resolves.toBe(
      initialTitleImplementation,
    );

    const approval = service.requestWorkflowApproval({
      worldId: "software-company",
      capability: "fs.project.write",
      requestedBy: "engineer",
      reason: `Apply ${projectPatch.id} to src/title.ts for ${task.id}.`,
      idempotencyKey: "fixture-approval-title-normalization",
    });
    service.decideWorkflowApproval({
      worldId: "software-company",
      approvalId: approval.id,
      capability: "fs.project.write",
      requestedBy: "engineer",
      decision: "approved",
      reason: "Patch is scoped to one source file and has a fixture test.",
      requestReason: approval.reason,
      idempotencyKey: "fixture-approval-decision-title-normalization",
    });
    const applied = await service.applyProjectPatch({
      worldId: "software-company",
      patchId: projectPatch.id,
      approvalId: approval.id,
      idempotencyKey: "fixture-project-patch-apply-title-normalization",
    });
    const testOutput = await runFixtureTests(root);
    const finalReview = service.decideWorkflowReview({
      worldId: "software-company",
      reviewId: review.id,
      artifactId: artifact.id,
      reviewerRoleId: "qa",
      decision: "approved",
      summary: "Fixture test passed after the approved project patch.",
      idempotencyKey: "fixture-review-decision-title-normalization",
    });

    expect(applied.status).toBe("applied");
    expect(finalReview.status).toBe("approved");
    expect(testOutput).toContain("1 pass");
    expect(service.listMessages(mainRoom.id)).toHaveLength(3);
    expect(service.listEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "message.created",
        "workflow.artifact.created",
        "workflow.task.created",
        "workflow.review.requested",
        "workflow.project_patch.proposed",
        "workflow.approval.requested",
        "workflow.approval.decided",
        "workflow.project_patch.applied",
        "workflow.review.decided",
      ]),
    );
  });
});

async function writeFixtureFeature(root: string): Promise<void> {
  const srcDir = path.join(root, "src");
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(path.join(srcDir, "title.ts"), initialTitleImplementation, "utf8");
  await writeFile(path.join(srcDir, "title.test.ts"), titleTest, "utf8");
}

async function runFixtureTests(root: string): Promise<string> {
  const subprocess = Bun.spawn([process.execPath, "test", "src/title.test.ts"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  if (exitCode !== 0) {
    throw new Error(output);
  }
  return output;
}

const initialTitleImplementation = `export function formatTitle(input: string): string {
  return input.trim();
}
`;

const normalizedTitleImplementation = `export function formatTitle(input: string): string {
  const collapsed = input.trim().replace(/\\s+/g, " ");
  return collapsed.replace(/^./, (char) => char.toUpperCase());
}
`;

const titleTest = `import { expect, test } from "bun:test";
import { formatTitle } from "./title";

test("normalizes generated document titles", () => {
  expect(formatTitle("  hello    realm  ")).toBe("Hello realm");
});
`;
