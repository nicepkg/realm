import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Capability, WorkflowProjectPatch } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import { assertSafePathSegment, OWNER_ID } from "./support.ts";

export type ProjectPatchFileInput = {
  path: string;
  action: "create" | "update" | "delete";
  nextContent?: string | null;
};

export type ProposeProjectPatchInput = {
  worldId: string;
  title: string;
  summary?: string;
  requestedBy: string;
  approvalId?: string;
  files: ProjectPatchFileInput[];
  idempotencyKey?: string;
};

export type ApplyProjectPatchInput = {
  worldId: string;
  patchId: string;
  approvalId: string;
  appliedBy?: string;
  idempotencyKey?: string;
};

export class ProjectPatchService {
  constructor(
    private readonly input: {
      root: string;
      eventStore: EventStore;
      clock: () => Date;
      assertAllowed: (capability: Capability) => void;
    },
  ) {}

  async proposePatch(input: ProposeProjectPatchInput): Promise<WorkflowProjectPatch> {
    this.input.assertAllowed("state.patch.propose");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.requestedBy, "requestedBy");
    if (input.approvalId) {
      assertSafePathSegment(input.approvalId, "approvalId");
    }
    const existing = input.idempotencyKey
      ? this.findProjectPatchProposalByIdempotencyKey(input.idempotencyKey)
      : undefined;
    if (existing) {
      return existing;
    }
    const files = await Promise.all(input.files.map((file) => this.prepareFile(file)));
    const projectPatch: WorkflowProjectPatch = {
      id: makeId("project-patch", randomUUID()),
      worldId: input.worldId,
      title: input.title,
      summary: input.summary ?? "",
      requestedBy: input.requestedBy,
      approvalId: input.approvalId,
      status: "proposed",
      files,
      createdAt: nowIso(this.input.clock()),
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:project-patch", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: projectPatch.createdAt,
        type: "workflow.project_patch.proposed",
        projectPatch,
      }),
      "workflow.project_patch.proposed",
    ).projectPatch;
  }

  async applyPatch(input: ApplyProjectPatchInput): Promise<WorkflowProjectPatch> {
    this.input.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.patchId, "patchId");
    assertSafePathSegment(input.approvalId, "approvalId");
    if (input.appliedBy) {
      assertSafePathSegment(input.appliedBy, "appliedBy");
    }
    const existing = input.idempotencyKey
      ? this.findAppliedProjectPatchByIdempotencyKey(input.idempotencyKey)
      : undefined;
    if (existing) {
      if (existing.id !== input.patchId || existing.worldId !== input.worldId) {
        throw new Error(`Idempotency key belongs to a different project patch: ${input.patchId}`);
      }
      return existing;
    }
    const proposed = this.findProjectPatch(input.patchId);
    if (proposed.worldId !== input.worldId) {
      throw new Error(`Project patch ${input.patchId} does not belong to ${input.worldId}`);
    }
    this.assertApproved(input.approvalId, input.worldId);

    for (const file of proposed.files) {
      await this.applyFile(file);
    }

    const now = nowIso(this.input.clock());
    const projectPatch: WorkflowProjectPatch = {
      ...proposed,
      approvalId: input.approvalId,
      status: "applied",
      appliedAt: now,
      appliedBy: input.appliedBy ?? OWNER_ID,
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:project-patch", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        type: "workflow.project_patch.applied",
        projectPatch,
      }),
      "workflow.project_patch.applied",
    ).projectPatch;
  }

  private async prepareFile(
    input: ProjectPatchFileInput,
  ): Promise<WorkflowProjectPatch["files"][number]> {
    const filePath = this.resolveProjectPath(input.path);
    const previousContent = await readOptional(filePath);
    if (input.action === "create" && previousContent !== undefined) {
      throw new Error(`Cannot create existing file: ${input.path}`);
    }
    if (input.action === "update" && previousContent === undefined) {
      throw new Error(`Cannot update missing file: ${input.path}`);
    }
    if (input.action !== "delete" && typeof input.nextContent !== "string") {
      throw new Error(`${input.action} requires nextContent for ${input.path}`);
    }
    return {
      path: normalizeProjectPath(input.path),
      action: input.action,
      previousHash: previousContent === undefined ? null : hashText(previousContent),
      nextHash: input.action === "delete" ? null : hashText(input.nextContent ?? ""),
      nextContent: input.action === "delete" ? null : (input.nextContent ?? ""),
    };
  }

  private async applyFile(file: WorkflowProjectPatch["files"][number]): Promise<void> {
    const filePath = this.resolveProjectPath(file.path);
    const currentContent = await readOptional(filePath);
    const currentHash = currentContent === undefined ? null : hashText(currentContent);
    if (currentHash !== file.previousHash) {
      throw new Error(`File changed since proposal: ${file.path}`);
    }
    if (file.action === "delete") {
      if (await exists(filePath)) {
        await rm(filePath);
      }
      return;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.nextContent ?? "", "utf8");
  }

  private findProjectPatch(patchId: string): WorkflowProjectPatch {
    const event = this.input.eventStore
      .list({ limit: 5000 })
      .find(
        (event) =>
          event.type === "workflow.project_patch.proposed" && event.projectPatch.id === patchId,
      );
    if (!event || event.type !== "workflow.project_patch.proposed") {
      throw new Error(`Unknown project patch: ${patchId}`);
    }
    return event.projectPatch;
  }

  private findProjectPatchProposalByIdempotencyKey(
    idempotencyKey: string,
  ): WorkflowProjectPatch | undefined {
    const event = this.input.eventStore.findByIdempotencyKey(idempotencyKey);
    if (!event) {
      return undefined;
    }
    return expectEvent(event, "workflow.project_patch.proposed").projectPatch;
  }

  private findAppliedProjectPatchByIdempotencyKey(
    idempotencyKey: string,
  ): WorkflowProjectPatch | undefined {
    const event = this.input.eventStore.findByIdempotencyKey(idempotencyKey);
    if (!event) {
      return undefined;
    }
    return expectEvent(event, "workflow.project_patch.applied").projectPatch;
  }

  private assertApproved(approvalId: string, worldId: string): void {
    const event = this.input.eventStore
      .list({ limit: 5000 })
      .find(
        (event) =>
          event.type === "workflow.approval.decided" &&
          event.approval.id === approvalId &&
          event.approval.worldId === worldId &&
          event.approval.status === "approved" &&
          event.approval.capability === "fs.project.write",
      );
    if (!event) {
      throw new Error(`Project patch requires approved fs.project.write approval: ${approvalId}`);
    }
  }

  private resolveProjectPath(relativePath: string): string {
    const normalized = normalizeProjectPath(relativePath);
    const resolved = path.resolve(this.input.root, normalized);
    const root = path.resolve(this.input.root);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Project patch path escapes project root: ${relativePath}`);
    }
    const firstSegment = normalized.split(/[\\/]/)[0];
    if (firstSegment === ".git" || firstSegment === "node_modules") {
      throw new Error(`Project patch path targets protected directory: ${relativePath}`);
    }
    if (
      normalized === ".agents/state" ||
      normalized.startsWith(".agents/state/") ||
      normalized === ".agents/logs" ||
      normalized.startsWith(".agents/logs/")
    ) {
      throw new Error(`Project patch path targets machine-local Realm data: ${relativePath}`);
    }
    return resolved;
  }
}

function normalizeProjectPath(value: string): string {
  if (path.isAbsolute(value)) {
    throw new Error(`Project patch path must be relative: ${value}`);
  }
  const normalized = value.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(`Project patch path is unsafe: ${value}`);
  }
  return normalized;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function expectEvent<T extends { type: string }, K extends T["type"]>(
  event: T,
  type: K,
): Extract<T, { type: K }> {
  if (event.type !== type) {
    throw new Error(`Idempotency key belongs to ${event.type}, not ${type}`);
  }
  return event as Extract<T, { type: K }>;
}
