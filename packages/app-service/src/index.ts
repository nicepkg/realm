import path from "node:path";
import {
  type ConfigPatchApplyInput,
  type CreateRolePatchInput,
  type CreateWorldPatchInput,
  FileConfigPatchStore,
  type ProjectConfig,
  projectLayout,
  type UserConfig,
} from "@realm/config";
import type { ConfigPatchProposal, Message, RealmEvent, Room } from "@realm/core";
import { PackagePiBridge, type PiBridge } from "@realm/pi-bridge";
import { PiRoleTurnRunner } from "@realm/runtime";
import { type EventStore, InMemoryEventStore } from "@realm/storage";
import { ConfigPatchService } from "./config-patch-service.ts";
import { ConfigQueryService, type EffectivePolicyMatrix } from "./config-query-service.ts";
import {
  type ExtensionAccessDecision,
  type ExtensionAccessInput,
  ExtensionAccessService,
} from "./extension-access-service.ts";
import { FakeVerticalSliceService } from "./fake-vertical-slice-service.ts";
import { type CreateRoomInput, MessageService, type SendMessageInput } from "./message-service.ts";
import { resolveRoleModelSettings } from "./model-resolution-service.ts";
import { ServicePolicyGate } from "./policy-gate.ts";
import {
  type ApplyProjectPatchInput,
  ProjectPatchService,
  type ProposeProjectPatchInput,
} from "./project-patch-service.ts";
import {
  type RoleMemoryInput,
  RoleMemoryService,
  type RoleMemoryWriteInput,
} from "./role-memory-service.ts";
import {
  compileRoleSystemPrompt,
  loadRoleTurnContext,
  toPiAllowedSkills,
} from "./role-turn-context.ts";
import {
  type SettingsExportSnapshot,
  SettingsService,
  type SettingsSnapshot,
} from "./settings-service.ts";
import { assertSafePathSegment, OWNER_ID, resolvePiExtensionPaths } from "./support.ts";
import { type TurnCancelResult, TurnControlService } from "./turn-control-service.ts";
import type { RealmApplicationServiceOptions, RunRoleTurnInput } from "./types.ts";
import {
  type CreateWorkflowArtifactInput,
  type CreateWorkflowTaskInput,
  type DecideWorkflowApprovalInput,
  type DecideWorkflowReviewInput,
  type RequestWorkflowApprovalInput,
  type RequestWorkflowReviewInput,
  WorkflowService,
} from "./workflow-service.ts";
import { WorldEventService } from "./world-event-service.ts";
import { WorldSimulationService } from "./world-simulation-service.ts";
import {
  type AdminStatePatchInput,
  type GodRoleActionInput,
  type NaturalWorldEventInput,
  type RandomNaturalWorldEventInput,
  type StateQueryInput,
  WorldStateService,
  type WorldStateView,
} from "./world-state-service.ts";

export type {
  ExtensionAccessDecision,
  ExtensionAccessInput,
  ExtensionSessionScope,
} from "./extension-access-service.ts";
export type { CreateRoomInput, SendMessageInput } from "./message-service.ts";
export type { ApplyProjectPatchInput, ProposeProjectPatchInput } from "./project-patch-service.ts";
export type { RoleMemoryInput, RoleMemoryWriteInput } from "./role-memory-service.ts";
export type { RealmApplicationServiceOptions, RunRoleTurnInput } from "./types.ts";
export type {
  CreateWorkflowArtifactInput,
  CreateWorkflowTaskInput,
  DecideWorkflowApprovalInput,
  DecideWorkflowReviewInput,
  RequestWorkflowApprovalInput,
  RequestWorkflowReviewInput,
} from "./workflow-service.ts";
export type {
  AdminStatePatchInput,
  GodRoleActionInput,
  GodRoleActionResult,
  NaturalWorldEventInput,
  NaturalWorldEventResult,
  RandomNaturalWorldEventInput,
  StateQueryInput,
  WorldStateView,
} from "./world-state-service.ts";
export type { SettingsExportSnapshot, SettingsSnapshot, TurnCancelResult };
export { OWNER_ID };

export class RealmApplicationService {
  private readonly eventStore: EventStore;
  private readonly clock: () => Date;
  private readonly policyGate: ServicePolicyGate;
  private readonly piBridge: PiBridge;
  private readonly configPatchService: ConfigPatchService;
  private readonly configQueryService: ConfigQueryService;
  private readonly extensionAccessService: ExtensionAccessService;
  private readonly messageService: MessageService;
  private readonly projectPatchService: ProjectPatchService;
  private readonly roleMemoryService: RoleMemoryService;
  private readonly settingsService: SettingsService;
  private readonly turnControlService = new TurnControlService();
  private readonly worldStateService: WorldStateService;
  private readonly workflowService: WorkflowService;
  readonly worldEvents: WorldEventService;
  readonly worldSimulation: WorldSimulationService;
  private readonly fakeVerticalSliceService: FakeVerticalSliceService | undefined;

  constructor(private readonly options: RealmApplicationServiceOptions) {
    this.eventStore = options.eventStore ?? new InMemoryEventStore();
    const trustTier = options.trustTier ?? "read-only";
    this.clock = options.clock ?? (() => new Date());
    this.policyGate = new ServicePolicyGate({
      eventStore: this.eventStore,
      trustTier,
      clock: this.clock,
    });
    this.piBridge = options.piBridge ?? new PackagePiBridge();
    this.configQueryService = new ConfigQueryService(options.root, {
      env: options.env,
      trustTier,
    });
    this.configPatchService = new ConfigPatchService({
      eventStore: this.eventStore,
      clock: this.clock,
      patchStore: options.patchStore ?? new FileConfigPatchStore(options.root, this.clock),
      planner: options.configAssistantPlanner,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.extensionAccessService = new ExtensionAccessService({
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.messageService = new MessageService({
      root: options.root,
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.projectPatchService = new ProjectPatchService({
      root: options.root,
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
    });
    this.roleMemoryService = new RoleMemoryService({
      root: options.root,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.settingsService = new SettingsService(options.root, options.env);
    this.worldStateService = new WorldStateService({
      root: options.root,
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.worldEvents = new WorldEventService({
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
      commitStatePatch: (input) => this.worldStateService.adminPatchState(input),
      getWorldState: (worldId) => this.worldStateService.getWorldState(worldId),
      listWorldRoleIds: async (worldId) =>
        (await this.listWorlds()).find((world) => world.id === worldId)?.roleIds ?? [],
      sendMessage: (input) => this.messageService.sendMessage(input),
    });
    this.workflowService = new WorkflowService({
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
    });
    this.worldSimulation = new WorldSimulationService({
      root: options.root,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
      worldEvents: this.worldEvents,
      worldState: this.worldStateService,
      listWorldRoleIds: async (worldId) =>
        (await this.listWorlds()).find((world) => world.id === worldId)?.roleIds ?? [],
    });
    this.fakeVerticalSliceService = options.fakeVerticalSlice
      ? new FakeVerticalSliceService({
          eventStore: this.eventStore,
          clock: this.clock,
          commitGodPatch: (input) => this.adminPatchState(input),
          appendAudit: (input) => this.policyGate.appendAudit(input),
        })
      : undefined;
    for (const tokenScope of options.extensionStaticTokens ?? []) {
      this.extensionAccessService.registerStaticToken(tokenScope);
    }
  }

  async getProject(): Promise<{ root: string; name: string; defaultWorldId: string }> {
    return this.configQueryService.getProject();
  }

  getSettings(): Promise<SettingsSnapshot> {
    return this.settingsService.getSettings();
  }
  exportSettings(): Promise<SettingsExportSnapshot> {
    return this.settingsService.exportSettings(this.clock);
  }
  async importSettings(input: unknown): Promise<SettingsSnapshot> {
    const snapshot = await this.settingsService.importSettings(input);
    this.policyGate.appendAudit({
      actorId: "owner",
      action: "settings.imported",
      target: "settings",
      reason: "Settings imported without raw secrets.",
    });
    return snapshot;
  }
  async updateUserSettings(input: UserConfig): Promise<SettingsSnapshot> {
    const snapshot = await this.settingsService.updateUserSettings(input);
    this.policyGate.appendAudit({
      actorId: "owner",
      action: "settings.user.updated",
      target: "user-config",
      reason: "User settings updated from Web UI.",
    });
    return snapshot;
  }
  async updateProjectSettings(input: ProjectConfig): Promise<SettingsSnapshot> {
    const snapshot = await this.settingsService.updateProjectSettings(input);
    this.policyGate.appendAudit({
      actorId: "owner",
      action: "settings.project.updated",
      target: "project-config",
      reason: "Project settings updated from Web UI.",
    });
    return snapshot;
  }
  async getConfigStatus(): Promise<{ ok: boolean; errors: string[] }> {
    return this.configQueryService.getConfigStatus();
  }
  async getEffectiveConfig(): Promise<{
    project: Awaited<ReturnType<RealmApplicationService["getProject"]>>;
    worlds: Awaited<ReturnType<ConfigQueryService["listWorlds"]>>;
    roles: Awaited<ReturnType<ConfigQueryService["listRoles"]>>;
  }> {
    return this.configQueryService.getEffectiveConfig();
  }

  async getEffectivePolicy(): Promise<EffectivePolicyMatrix> {
    return this.configQueryService.getEffectivePolicy();
  }
  async listWorlds() {
    return this.configQueryService.listWorlds();
  }
  async listRooms(worldId: string): Promise<Room[]> {
    return this.messageService.listRooms(worldId);
  }

  async listRoles() {
    return this.configQueryService.listRoles();
  }

  listEvents(options: { afterSeq?: number; limit?: number } = {}): readonly RealmEvent[] {
    return this.eventStore.list(options);
  }
  lastEventSeq(): number {
    return this.eventStore.lastSeq();
  }

  createRoom(input: CreateRoomInput): Room {
    return this.messageService.createRoom(input);
  }

  listMessages(roomId: string): readonly Message[] {
    return this.messageService.listMessages(roomId);
  }

  sendMessage(input: SendMessageInput): Message {
    const message = this.messageService.sendMessage(input);
    if (this.fakeVerticalSliceService?.shouldTrigger(message)) {
      this.fakeVerticalSliceService.run(message);
    }
    return message;
  }

  async runRoleTurn(input: RunRoleTurnInput): Promise<{ turnId: string; message: Message }> {
    this.policyGate.assertAllowed("turn.run");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.roomId, "roomId");
    assertSafePathSegment(input.roleId, "roleId");
    const roleContext = await loadRoleTurnContext({
      root: this.options.root,
      worldId: input.worldId,
      roleId: input.roleId,
      roles: await this.listRoles(),
    });
    if (!roleContext.role) {
      throw new Error(`Unknown role: ${input.roleId}`);
    }
    const layout = projectLayout(this.options.root);
    const runner = new PiRoleTurnRunner(this.piBridge, this.eventStore, this.clock);
    const timeoutMs = input.timeoutMs ?? 60_000;
    const extensionSession = this.extensionAccessService.createSession({
      worldId: input.worldId,
      roleId: input.roleId,
      expiresAt: new Date(this.clock().getTime() + timeoutMs + 30_000),
    });
    const modelSettings = resolveRoleModelSettings({
      settings: await this.getSettings(),
      roleModel: roleContext.role.model,
      env: this.options.env,
    });

    try {
      const result = await runner.run({
        turnId: input.turnId,
        worldId: input.worldId,
        roomId: input.roomId,
        roleId: input.roleId,
        prompt:
          input.prompt ?? `Reply to the latest room context as ${roleContext.role.displayName}.`,
        cwd: this.options.root,
        sessionDir: path.join(
          layout.stateDir,
          "pi-sessions",
          input.worldId,
          input.roomId,
          input.roleId,
        ),
        systemPrompt: compileRoleSystemPrompt(roleContext),
        provider: modelSettings.provider,
        model: modelSettings.model,
        allowedSkills: toPiAllowedSkills(roleContext.callableSkills),
        allowedSkillPaths: roleContext.callableSkills.map((skill) => skill.path),
        extensionPaths: await resolvePiExtensionPaths(
          this.options.piExtensionPath ?? process.env.REALM_PI_EXTENSION_PATH,
        ),
        env: {
          ...modelSettings.env,
          REALM_EXTENSION_BASE_URL: this.options.extensionBaseUrl ?? "http://127.0.0.1:3737",
          REALM_EXTENSION_TOKEN: extensionSession.token,
          REALM_EXTENSION_WORLD_ID: input.worldId,
          REALM_EXTENSION_ROLE_ID: input.roleId,
        },
        signal: input.signal,
        timeoutMs,
      });

      return { turnId: result.turn.id, message: result.message };
    } finally {
      this.extensionAccessService.deleteSession(extensionSession.tokenHash);
    }
  }

  startRoleTurn(input: RunRoleTurnInput): { turnId: string } {
    return this.turnControlService.start((turnId, signal) =>
      this.runRoleTurn({ ...input, turnId, signal }),
    );
  }

  cancelTurn(turnId: string): TurnCancelResult {
    return this.turnControlService.cancel(turnId);
  }

  async queryRoleState(input: StateQueryInput): Promise<{ state: unknown }> {
    return this.worldStateService.queryRoleState(input);
  }

  async getWorldState(worldId: string): Promise<WorldStateView> {
    return this.worldStateService.getWorldState(worldId);
  }

  async adminPatchState(
    input: AdminStatePatchInput,
  ): ReturnType<WorldStateService["adminPatchState"]> {
    return this.worldStateService.adminPatchState(input);
  }

  async applyGodRoleAction(
    input: GodRoleActionInput,
  ): ReturnType<WorldStateService["applyGodRoleAction"]> {
    return this.worldStateService.applyGodRoleAction(input);
  }

  async triggerNaturalEvent(
    input: NaturalWorldEventInput,
  ): ReturnType<WorldStateService["triggerNaturalEvent"]> {
    return this.worldStateService.triggerNaturalEvent(input);
  }

  async triggerRandomNaturalEvent(
    input: RandomNaturalWorldEventInput,
  ): ReturnType<WorldStateService["triggerRandomNaturalEvent"]> {
    return this.worldStateService.triggerRandomNaturalEvent(input);
  }

  async readRoleMemory(input: RoleMemoryInput): Promise<{ content: string }> {
    return this.roleMemoryService.readRoleMemory(input);
  }

  async writeRoleMemory(input: RoleMemoryWriteInput): Promise<{ bytes: number }> {
    return this.roleMemoryService.writeRoleMemory(input);
  }

  async proposeRole(input: CreateRolePatchInput): Promise<ConfigPatchProposal> {
    return this.configPatchService.proposeRole(input);
  }

  async proposeWorld(input: CreateWorldPatchInput): Promise<ConfigPatchProposal> {
    return this.configPatchService.proposeWorld(input);
  }

  async proposeAssistantConfig(input: { goal: string }): Promise<ConfigPatchProposal> {
    return this.configPatchService.proposeAssistantConfig(input);
  }

  async applyConfigPatch(
    patchId: string,
    input: ConfigPatchApplyInput = {},
  ): Promise<{ patchId: string; historyId: string; changedPaths: string[] }> {
    return this.configPatchService.applyConfigPatch(patchId, input);
  }

  async rollbackConfigHistory(
    historyId: string,
  ): Promise<{ historyId: string; restoredPaths: string[] }> {
    return this.configPatchService.rollbackConfigHistory(historyId);
  }

  verifyExtensionAccess(input: ExtensionAccessInput): ExtensionAccessDecision {
    return this.extensionAccessService.verifyAccess(input);
  }

  createWorkflowArtifact(input: CreateWorkflowArtifactInput) {
    return this.workflowService.createArtifact(input);
  }

  createWorkflowTask(input: CreateWorkflowTaskInput) {
    return this.workflowService.createTask(input);
  }

  requestWorkflowReview(input: RequestWorkflowReviewInput) {
    return this.workflowService.requestReview(input);
  }

  decideWorkflowReview(input: DecideWorkflowReviewInput) {
    return this.workflowService.decideReview(input);
  }

  requestWorkflowApproval(input: RequestWorkflowApprovalInput) {
    return this.workflowService.requestApproval(input);
  }

  decideWorkflowApproval(input: DecideWorkflowApprovalInput) {
    return this.workflowService.decideApproval(input);
  }

  proposeProjectPatch(input: ProposeProjectPatchInput) {
    return this.projectPatchService.proposePatch(input);
  }

  applyProjectPatch(input: ApplyProjectPatchInput) {
    return this.projectPatchService.applyPatch(input);
  }
}
