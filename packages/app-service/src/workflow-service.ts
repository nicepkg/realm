import { randomUUID } from "node:crypto";
import type {
  Capability,
  WorkflowApproval,
  WorkflowArtifact,
  WorkflowReview,
  WorkflowTask,
} from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import type { AppendAuditInput } from "./policy-gate.ts";
import { assertSafePathSegment, OWNER_ID } from "./support.ts";

export type CreateWorkflowArtifactInput = {
  worldId: string;
  title: string;
  kind: WorkflowArtifact["kind"];
  content: string;
  ownerRoleId?: string;
  idempotencyKey?: string;
};

export type CreateWorkflowTaskInput = {
  worldId: string;
  title: string;
  description?: string;
  ownerRoleId?: string;
  artifactId?: string;
  idempotencyKey?: string;
};

export type RequestWorkflowReviewInput = {
  worldId: string;
  artifactId: string;
  requestedBy: string;
  reviewerRoleId: string;
  summary?: string;
  idempotencyKey?: string;
};

export type DecideWorkflowReviewInput = {
  worldId: string;
  reviewId: string;
  artifactId: string;
  reviewerRoleId: string;
  decision: "changes-requested" | "approved";
  summary: string;
  idempotencyKey?: string;
};

export type RequestWorkflowApprovalInput = {
  worldId: string;
  capability: Capability;
  requestedBy: string;
  targetId?: string;
  reason: string;
  idempotencyKey?: string;
};

export type DecideWorkflowApprovalInput = {
  worldId: string;
  approvalId: string;
  capability: Capability;
  requestedBy: string;
  targetId?: string;
  decision: "approved" | "rejected";
  decidedBy?: string;
  reason: string;
  requestReason: string;
  idempotencyKey?: string;
};

export class WorkflowService {
  constructor(
    private readonly input: {
      eventStore: EventStore;
      clock: () => Date;
      assertAllowed: (capability: Capability) => void;
      appendAudit: (input: AppendAuditInput) => void;
    },
  ) {}

  createArtifact(input: CreateWorkflowArtifactInput): WorkflowArtifact {
    this.input.assertAllowed("state.patch.propose");
    this.assertWorkflowIds(input);
    const artifact: WorkflowArtifact = {
      id: makeId("artifact", randomUUID()),
      worldId: input.worldId,
      title: input.title,
      kind: input.kind,
      status: "draft",
      ownerRoleId: input.ownerRoleId,
      content: input.content,
      createdAt: nowIso(this.input.clock()),
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:artifact", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: artifact.createdAt,
        type: "workflow.artifact.created",
        artifact,
      }),
      "workflow.artifact.created",
    ).artifact;
  }

  createTask(input: CreateWorkflowTaskInput): WorkflowTask {
    this.input.assertAllowed("state.patch.propose");
    this.assertWorkflowIds(input);
    if (input.artifactId) {
      assertSafePathSegment(input.artifactId, "artifactId");
    }
    const task: WorkflowTask = {
      id: makeId("task", randomUUID()),
      worldId: input.worldId,
      title: input.title,
      description: input.description ?? "",
      status: "todo",
      ownerRoleId: input.ownerRoleId,
      artifactId: input.artifactId,
      createdAt: nowIso(this.input.clock()),
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:task", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: task.createdAt,
        type: "workflow.task.created",
        task,
      }),
      "workflow.task.created",
    ).task;
  }

  requestReview(input: RequestWorkflowReviewInput): WorkflowReview {
    this.input.assertAllowed("state.patch.propose");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.artifactId, "artifactId");
    assertSafePathSegment(input.requestedBy, "requestedBy");
    assertSafePathSegment(input.reviewerRoleId, "reviewerRoleId");
    const review: WorkflowReview = {
      id: makeId("review", randomUUID()),
      worldId: input.worldId,
      artifactId: input.artifactId,
      requestedBy: input.requestedBy,
      reviewerRoleId: input.reviewerRoleId,
      status: "requested",
      summary: input.summary ?? "",
      createdAt: nowIso(this.input.clock()),
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:review", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: review.createdAt,
        type: "workflow.review.requested",
        review,
      }),
      "workflow.review.requested",
    ).review;
  }

  decideReview(input: DecideWorkflowReviewInput): WorkflowReview {
    this.input.assertAllowed("state.patch.propose");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.reviewId, "reviewId");
    assertSafePathSegment(input.artifactId, "artifactId");
    assertSafePathSegment(input.reviewerRoleId, "reviewerRoleId");
    const review: WorkflowReview = {
      id: input.reviewId,
      worldId: input.worldId,
      artifactId: input.artifactId,
      requestedBy: input.reviewerRoleId,
      reviewerRoleId: input.reviewerRoleId,
      status: input.decision,
      summary: input.summary,
      createdAt: nowIso(this.input.clock()),
    };
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:review", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: review.createdAt,
        type: "workflow.review.decided",
        review,
      }),
      "workflow.review.decided",
    ).review;
  }

  requestApproval(input: RequestWorkflowApprovalInput): WorkflowApproval {
    this.input.assertAllowed("state.patch.propose");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.requestedBy, "requestedBy");
    if (input.targetId) {
      assertSafePathSegment(input.targetId, "targetId");
    }
    const approval = this.buildApproval({
      id: makeId("approval", randomUUID()),
      input,
      status: "pending",
      createdAt: nowIso(this.input.clock()),
    });
    this.input.appendAudit({
      actorId: input.requestedBy,
      action: "workflow.approval.requested",
      target: input.capability,
      reason: input.reason,
    });
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:approval", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: approval.createdAt,
        type: "workflow.approval.requested",
        approval,
      }),
      "workflow.approval.requested",
    ).approval;
  }

  decideApproval(input: DecideWorkflowApprovalInput): WorkflowApproval {
    this.input.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.approvalId, "approvalId");
    assertSafePathSegment(input.requestedBy, "requestedBy");
    if (input.targetId) {
      assertSafePathSegment(input.targetId, "targetId");
    }
    if (input.decidedBy) {
      assertSafePathSegment(input.decidedBy, "decidedBy");
    }
    const now = nowIso(this.input.clock());
    const approval = this.buildApproval({
      id: input.approvalId,
      input: {
        worldId: input.worldId,
        capability: input.capability,
        requestedBy: input.requestedBy,
        targetId: input.targetId,
        reason: input.requestReason,
      },
      status: input.decision,
      createdAt: now,
      decidedAt: now,
      decidedBy: input.decidedBy ?? OWNER_ID,
      decisionReason: input.reason,
    });
    this.input.appendAudit({
      actorId: approval.decidedBy ?? OWNER_ID,
      action: `workflow.approval.${input.decision}`,
      target: input.capability,
      reason: input.reason,
    });
    return expectEvent(
      this.input.eventStore.append({
        eventId: makeId("event:workflow:approval", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        type: "workflow.approval.decided",
        approval,
      }),
      "workflow.approval.decided",
    ).approval;
  }

  private assertWorkflowIds(input: { worldId: string; ownerRoleId?: string }): void {
    assertSafePathSegment(input.worldId, "worldId");
    if (input.ownerRoleId) {
      assertSafePathSegment(input.ownerRoleId, "ownerRoleId");
    }
  }

  private buildApproval(input: {
    id: string;
    input: Omit<RequestWorkflowApprovalInput, "idempotencyKey">;
    status: WorkflowApproval["status"];
    createdAt: string;
    decidedAt?: string;
    decidedBy?: string;
    decisionReason?: string;
  }): WorkflowApproval {
    return {
      id: input.id,
      worldId: input.input.worldId,
      capability: input.input.capability,
      requestedBy: input.input.requestedBy,
      targetId: input.input.targetId,
      reason: input.input.reason,
      status: input.status,
      decidedBy: input.decidedBy,
      decisionReason: input.decisionReason,
      createdAt: input.createdAt,
      decidedAt: input.decidedAt,
    };
  }
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
