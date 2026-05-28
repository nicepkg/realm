import {
  applyProjectPatchRequestSchema,
  createWorkflowArtifactRequestSchema,
  createWorkflowArtifactResponseSchema,
  createWorkflowTaskRequestSchema,
  createWorkflowTaskResponseSchema,
  decideWorkflowApprovalRequestSchema,
  decideWorkflowReviewRequestSchema,
  projectPatchResponseSchema,
  proposeProjectPatchRequestSchema,
  requestWorkflowApprovalRequestSchema,
  requestWorkflowReviewRequestSchema,
  workflowApprovalResponseSchema,
  workflowReviewResponseSchema,
} from "@realm/api-contract";
import type { z } from "zod";
import { RealmHttpTransport } from "./http.ts";

/**
 * Workflow + project-patch endpoints. Split out of the main client to keep both
 * files cohesive and under the 500-line cap; `RealmHttpClient` extends this so
 * the public method surface (`client.createWorkflowArtifact(...)`) is unchanged.
 */
export class RealmWorkflowClient extends RealmHttpTransport {
  async createWorkflowArtifact(
    worldId: string,
    input: z.input<typeof createWorkflowArtifactRequestSchema>,
  ): Promise<z.infer<typeof createWorkflowArtifactResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/artifacts`,
      createWorkflowArtifactRequestSchema.parse(input),
      createWorkflowArtifactResponseSchema,
    );
  }

  async createWorkflowTask(
    worldId: string,
    input: z.input<typeof createWorkflowTaskRequestSchema>,
  ): Promise<z.infer<typeof createWorkflowTaskResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/tasks`,
      createWorkflowTaskRequestSchema.parse(input),
      createWorkflowTaskResponseSchema,
    );
  }

  async requestWorkflowReview(
    worldId: string,
    input: z.input<typeof requestWorkflowReviewRequestSchema>,
  ): Promise<z.infer<typeof workflowReviewResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/reviews`,
      requestWorkflowReviewRequestSchema.parse(input),
      workflowReviewResponseSchema,
    );
  }

  async decideWorkflowReview(
    worldId: string,
    reviewId: string,
    input: z.input<typeof decideWorkflowReviewRequestSchema>,
  ): Promise<z.infer<typeof workflowReviewResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/reviews/${encodeURIComponent(reviewId)}/decision`,
      decideWorkflowReviewRequestSchema.parse(input),
      workflowReviewResponseSchema,
    );
  }

  async requestWorkflowApproval(
    worldId: string,
    input: z.input<typeof requestWorkflowApprovalRequestSchema>,
  ): Promise<z.infer<typeof workflowApprovalResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/approvals`,
      requestWorkflowApprovalRequestSchema.parse(input),
      workflowApprovalResponseSchema,
    );
  }

  async decideWorkflowApproval(
    worldId: string,
    approvalId: string,
    input: z.input<typeof decideWorkflowApprovalRequestSchema>,
  ): Promise<z.infer<typeof workflowApprovalResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/approvals/${encodeURIComponent(approvalId)}/decision`,
      decideWorkflowApprovalRequestSchema.parse(input),
      workflowApprovalResponseSchema,
    );
  }

  async proposeProjectPatch(
    worldId: string,
    input: z.input<typeof proposeProjectPatchRequestSchema>,
  ): Promise<z.infer<typeof projectPatchResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/project-patches`,
      proposeProjectPatchRequestSchema.parse(input),
      projectPatchResponseSchema,
    );
  }

  async applyProjectPatch(
    worldId: string,
    patchId: string,
    input: z.input<typeof applyProjectPatchRequestSchema>,
  ): Promise<z.infer<typeof projectPatchResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/workflow/project-patches/${encodeURIComponent(patchId)}/apply`,
      applyProjectPatchRequestSchema.parse(input),
      projectPatchResponseSchema,
    );
  }
}
