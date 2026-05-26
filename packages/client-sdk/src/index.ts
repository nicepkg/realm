import {
  adminStatePatchRequestSchema,
  adminStatePatchResponseSchema,
  applyProjectPatchRequestSchema,
  cancelTurnResponseSchema,
  configPatchApplyResponseSchema,
  configPatchProposalResponseSchema,
  configRollbackResponseSchema,
  configStatusResponseSchema,
  createRoleRequestSchema,
  createRoomRequestSchema,
  createRoomResponseSchema,
  createWorkflowArtifactRequestSchema,
  createWorkflowArtifactResponseSchema,
  createWorkflowTaskRequestSchema,
  createWorkflowTaskResponseSchema,
  createWorldRequestSchema,
  decideWorkflowApprovalRequestSchema,
  decideWorkflowReviewRequestSchema,
  effectiveConfigResponseSchema,
  effectivePolicyResponseSchema,
  extensionMemoryReadRequestSchema,
  extensionMemoryReadResponseSchema,
  extensionMemoryWriteRequestSchema,
  extensionMemoryWriteResponseSchema,
  extensionStateQueryRequestSchema,
  extensionStateQueryResponseSchema,
  godRoleActionRequestSchema,
  godRoleActionResponseSchema,
  listEventsResponseSchema,
  listMessagesResponseSchema,
  listRolesResponseSchema,
  listRoomsResponseSchema,
  listWorldsResponseSchema,
  naturalWorldEventRequestSchema,
  naturalWorldEventResponseSchema,
  projectPatchResponseSchema,
  projectResponseSchema,
  proposeProjectPatchRequestSchema,
  randomNaturalWorldEventRequestSchema,
  randomWorldEventRequestSchema,
  requestWorkflowApprovalRequestSchema,
  requestWorkflowReviewRequestSchema,
  runRoleTurnRequestSchema,
  runRoleTurnResponseSchema,
  sendMessageRequestSchema,
  sendMessageResponseSchema,
  settingsExportResponseSchema,
  type settingsImportRequestSchema,
  settingsResponseSchema,
  startRoleTurnResponseSchema,
  tickWorldEventRequestSchema,
  updateProjectSettingsRequestSchema,
  updateUserSettingsRequestSchema,
  workflowApprovalResponseSchema,
  workflowReviewResponseSchema,
  worldEventConditionRequestSchema,
  worldEventReplayResponseSchema,
  worldEventTriggerRequestSchema,
  worldEventTriggerResponseSchema,
  worldStateResponseSchema,
  worldTickTriggerResponseSchema,
} from "@realm/api-contract";
import type { z } from "zod";

export type RealmClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class RealmHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RealmClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async getProject(): Promise<z.infer<typeof projectResponseSchema>> {
    return this.get("/api/project", projectResponseSchema);
  }

  async getConfigStatus(): Promise<z.infer<typeof configStatusResponseSchema>> {
    return this.get("/api/config/status", configStatusResponseSchema);
  }

  async getSettings(): Promise<z.infer<typeof settingsResponseSchema>> {
    return this.get("/api/settings", settingsResponseSchema);
  }

  async exportSettings(): Promise<z.infer<typeof settingsExportResponseSchema>> {
    return this.get("/api/settings/export", settingsExportResponseSchema);
  }

  async importSettings(
    input: z.input<typeof settingsImportRequestSchema>,
  ): Promise<z.infer<typeof settingsResponseSchema>> {
    return this.post("/api/settings/import", input, settingsResponseSchema);
  }

  async updateUserSettings(
    input: z.input<typeof updateUserSettingsRequestSchema>,
  ): Promise<z.infer<typeof settingsResponseSchema>> {
    return this.post(
      "/api/settings/user",
      updateUserSettingsRequestSchema.parse(input),
      settingsResponseSchema,
    );
  }

  async updateProjectSettings(
    input: z.input<typeof updateProjectSettingsRequestSchema>,
  ): Promise<z.infer<typeof settingsResponseSchema>> {
    return this.post(
      "/api/settings/project",
      updateProjectSettingsRequestSchema.parse(input),
      settingsResponseSchema,
    );
  }

  async getEffectiveConfig(): Promise<z.infer<typeof effectiveConfigResponseSchema>> {
    return this.get("/api/config/effective", effectiveConfigResponseSchema);
  }

  async getEffectivePolicy(): Promise<z.infer<typeof effectivePolicyResponseSchema>> {
    return this.get("/api/policy/effective", effectivePolicyResponseSchema);
  }

  async listEvents(afterSeq = 0): Promise<z.infer<typeof listEventsResponseSchema>> {
    return this.get(`/api/events?afterSeq=${afterSeq}`, listEventsResponseSchema);
  }

  async listWorlds(): Promise<z.infer<typeof listWorldsResponseSchema>> {
    return this.get("/api/worlds", listWorldsResponseSchema);
  }

  async listRooms(worldId: string): Promise<z.infer<typeof listRoomsResponseSchema>> {
    return this.get(`/api/worlds/${encodeURIComponent(worldId)}/rooms`, listRoomsResponseSchema);
  }

  async getWorldState(worldId: string): Promise<z.infer<typeof worldStateResponseSchema>> {
    return this.get(`/api/worlds/${encodeURIComponent(worldId)}/state`, worldStateResponseSchema);
  }

  async listRoles(): Promise<z.infer<typeof listRolesResponseSchema>> {
    return this.get("/api/roles", listRolesResponseSchema);
  }

  async listMessages(roomId: string): Promise<z.infer<typeof listMessagesResponseSchema>> {
    return this.get(
      `/api/rooms/${encodeURIComponent(roomId)}/messages`,
      listMessagesResponseSchema,
    );
  }

  async sendMessage(
    roomId: string,
    input: z.input<typeof sendMessageRequestSchema>,
  ): Promise<z.infer<typeof sendMessageResponseSchema>> {
    return this.post(
      `/api/rooms/${encodeURIComponent(roomId)}/messages`,
      sendMessageRequestSchema.parse(input),
      sendMessageResponseSchema,
    );
  }

  async runRoleTurn(
    roomId: string,
    input: z.input<typeof runRoleTurnRequestSchema>,
  ): Promise<z.infer<typeof runRoleTurnResponseSchema>> {
    return this.post(
      `/api/rooms/${encodeURIComponent(roomId)}/role-turns`,
      runRoleTurnRequestSchema.parse(input),
      runRoleTurnResponseSchema,
    );
  }

  async startRoleTurn(
    roomId: string,
    input: z.input<typeof runRoleTurnRequestSchema>,
  ): Promise<z.infer<typeof startRoleTurnResponseSchema>> {
    return this.post(
      `/api/rooms/${encodeURIComponent(roomId)}/role-turns/start`,
      runRoleTurnRequestSchema.parse(input),
      startRoleTurnResponseSchema,
    );
  }

  async cancelTurn(turnId: string): Promise<z.infer<typeof cancelTurnResponseSchema>> {
    return this.post(
      `/api/turns/${encodeURIComponent(turnId)}/cancel`,
      {},
      cancelTurnResponseSchema,
    );
  }

  async createRoom(
    worldId: string,
    input: z.input<typeof createRoomRequestSchema>,
  ): Promise<z.infer<typeof createRoomResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/rooms`,
      createRoomRequestSchema.parse(input),
      createRoomResponseSchema,
    );
  }

  async proposeRole(
    input: z.input<typeof createRoleRequestSchema>,
  ): Promise<z.infer<typeof configPatchProposalResponseSchema>> {
    return this.post(
      "/api/config/patches/role",
      createRoleRequestSchema.parse(input),
      configPatchProposalResponseSchema,
    );
  }

  async proposeWorld(
    input: z.input<typeof createWorldRequestSchema>,
  ): Promise<z.infer<typeof configPatchProposalResponseSchema>> {
    return this.post(
      "/api/config/patches/world",
      createWorldRequestSchema.parse(input),
      configPatchProposalResponseSchema,
    );
  }

  async applyConfigPatch(patchId: string): Promise<z.infer<typeof configPatchApplyResponseSchema>> {
    return this.post(
      `/api/config/patches/${encodeURIComponent(patchId)}/apply`,
      {},
      configPatchApplyResponseSchema,
    );
  }

  async rollbackConfig(historyId: string): Promise<z.infer<typeof configRollbackResponseSchema>> {
    return this.post(
      `/api/config/history/${encodeURIComponent(historyId)}/rollback`,
      {},
      configRollbackResponseSchema,
    );
  }

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

  async adminPatchState(
    input: z.input<typeof adminStatePatchRequestSchema>,
  ): Promise<z.infer<typeof adminStatePatchResponseSchema>> {
    return this.post(
      "/api/admin/state-patch",
      adminStatePatchRequestSchema.parse(input),
      adminStatePatchResponseSchema,
    );
  }

  async applyGodRoleAction(
    worldId: string,
    input: z.input<typeof godRoleActionRequestSchema>,
  ): Promise<z.infer<typeof godRoleActionResponseSchema>> {
    return this.post(
      `/api/god/${encodeURIComponent(worldId)}/actions`,
      godRoleActionRequestSchema.parse(input),
      godRoleActionResponseSchema,
    );
  }

  async triggerNaturalEvent(
    worldId: string,
    input: z.input<typeof naturalWorldEventRequestSchema>,
  ): Promise<z.infer<typeof naturalWorldEventResponseSchema>> {
    return this.post(
      `/api/god/${encodeURIComponent(worldId)}/natural-events`,
      naturalWorldEventRequestSchema.parse(input),
      naturalWorldEventResponseSchema,
    );
  }

  async triggerRandomNaturalEvent(
    worldId: string,
    input: z.input<typeof randomNaturalWorldEventRequestSchema>,
  ): Promise<z.infer<typeof naturalWorldEventResponseSchema>> {
    return this.post(
      `/api/god/${encodeURIComponent(worldId)}/natural-events/random`,
      randomNaturalWorldEventRequestSchema.parse(input),
      naturalWorldEventResponseSchema,
    );
  }

  async triggerManualWorldEvent(
    worldId: string,
    input: z.input<typeof worldEventTriggerRequestSchema>,
  ): Promise<z.infer<typeof worldEventTriggerResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/events/manual`,
      worldEventTriggerRequestSchema.parse(input),
      worldEventTriggerResponseSchema,
    );
  }

  async triggerGodAdjudicatedWorldEvent(
    worldId: string,
    input: z.input<typeof worldEventTriggerRequestSchema>,
  ): Promise<z.infer<typeof worldEventTriggerResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/events/god-adjudicated`,
      worldEventTriggerRequestSchema.parse(input),
      worldEventTriggerResponseSchema,
    );
  }

  async triggerRandomWorldEvent(
    worldId: string,
    input: z.input<typeof randomWorldEventRequestSchema>,
  ): Promise<z.infer<typeof worldEventTriggerResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/events/random`,
      randomWorldEventRequestSchema.parse(input),
      worldEventTriggerResponseSchema,
    );
  }

  async triggerWorldTick(
    worldId: string,
    input: z.input<typeof tickWorldEventRequestSchema>,
  ): Promise<z.infer<typeof worldTickTriggerResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/events/tick`,
      tickWorldEventRequestSchema.parse(input),
      worldTickTriggerResponseSchema,
    );
  }

  async triggerConditionWorldEvent(
    worldId: string,
    input: z.input<typeof worldEventConditionRequestSchema>,
  ): Promise<z.infer<typeof worldEventTriggerResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/events/condition`,
      worldEventConditionRequestSchema.parse(input),
      worldEventTriggerResponseSchema,
    );
  }

  async getWorldEventReplay(
    worldId: string,
    afterSeq = 0,
  ): Promise<z.infer<typeof worldEventReplayResponseSchema>> {
    return this.get(
      `/api/worlds/${encodeURIComponent(worldId)}/events/replay?afterSeq=${afterSeq}`,
      worldEventReplayResponseSchema,
    );
  }

  async queryExtensionState(
    input: z.input<typeof extensionStateQueryRequestSchema>,
  ): Promise<z.infer<typeof extensionStateQueryResponseSchema>> {
    return this.post(
      "/api/extension/state-query",
      extensionStateQueryRequestSchema.parse(input),
      extensionStateQueryResponseSchema,
    );
  }

  async readExtensionMemory(
    input: z.input<typeof extensionMemoryReadRequestSchema>,
  ): Promise<z.infer<typeof extensionMemoryReadResponseSchema>> {
    return this.post(
      "/api/extension/memory-read",
      extensionMemoryReadRequestSchema.parse(input),
      extensionMemoryReadResponseSchema,
    );
  }

  async writeExtensionMemory(
    input: z.input<typeof extensionMemoryWriteRequestSchema>,
  ): Promise<z.infer<typeof extensionMemoryWriteResponseSchema>> {
    return this.post(
      "/api/extension/memory-write",
      extensionMemoryWriteRequestSchema.parse(input),
      extensionMemoryWriteResponseSchema,
    );
  }

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    return this.parseResponse(response, schema);
  }

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.parseResponse(response, schema);
  }

  private async parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    const payload = await response.json();
    if (!response.ok) {
      const message =
        typeof payload?.error?.message === "string" ? payload.error.message : response.statusText;
      throw new Error(message);
    }
    return schema.parse(payload);
  }
}

export type RealmClient = RealmHttpClient;
