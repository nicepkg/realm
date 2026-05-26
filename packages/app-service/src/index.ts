import path from "node:path";
import type { ConfigAssistantPlanner } from "@realm/assistant";
import {
  type CreateRolePatchInput,
  type CreateWorldPatchInput,
  FileConfigPatchStore,
  loadProjectConfig,
  loadRoleConfigs,
  loadWorldConfigs,
  type ProjectConfig,
  projectLayout,
  type UserConfig,
} from "@realm/config";
import type {
  ConfigPatchProposal,
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorldSummary,
} from "@realm/core";
import { PackagePiBridge, type PiBridge } from "@realm/pi-bridge";
import type { TrustTier } from "@realm/policy";
import { PiRoleTurnRunner } from "@realm/runtime";
import { type EventStore, InMemoryEventStore } from "@realm/storage";
import { ConfigPatchService } from "./config-patch-service.ts";
import {
  type ExtensionAccessDecision,
  type ExtensionAccessInput,
  ExtensionAccessService,
  type ExtensionSessionScope,
} from "./extension-access-service.ts";
import { FakeVerticalSliceService } from "./fake-vertical-slice-service.ts";
import { type CreateRoomInput, MessageService, type SendMessageInput } from "./message-service.ts";
import { resolveRoleModelSettings } from "./model-resolution-service.ts";
import { ServicePolicyGate } from "./policy-gate.ts";
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
import { SettingsService, type SettingsSnapshot } from "./settings-service.ts";
import { assertSafePathSegment, humanizeId, resolvePiExtensionPaths } from "./support.ts";
import { type TurnCancelResult, TurnControlService } from "./turn-control-service.ts";
import {
  type CreateWorkflowArtifactInput,
  type CreateWorkflowTaskInput,
  type DecideWorkflowApprovalInput,
  type DecideWorkflowReviewInput,
  type RequestWorkflowApprovalInput,
  type RequestWorkflowReviewInput,
  WorkflowService,
} from "./workflow-service.ts";
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
export type { RoleMemoryInput, RoleMemoryWriteInput } from "./role-memory-service.ts";
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
export type { SettingsSnapshot, TurnCancelResult };

export type RunRoleTurnInput = {
  turnId?: string;
  worldId: string;
  roomId: string;
  roleId: string;
  prompt?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type RealmApplicationServiceOptions = {
  root: string;
  eventStore?: EventStore;
  trustTier?: TrustTier;
  clock?: () => Date;
  patchStore?: FileConfigPatchStore;
  configAssistantPlanner?: ConfigAssistantPlanner;
  piBridge?: PiBridge;
  extensionBaseUrl?: string;
  piExtensionPath?: string;
  fakeVerticalSlice?: boolean;
  env?: NodeJS.ProcessEnv;
  extensionStaticTokens?: Array<ExtensionSessionScope & { token: string }>;
};

export class RealmApplicationService {
  private readonly eventStore: EventStore;
  private readonly clock: () => Date;
  private readonly policyGate: ServicePolicyGate;
  private readonly piBridge: PiBridge;
  private readonly configPatchService: ConfigPatchService;
  private readonly extensionAccessService: ExtensionAccessService;
  private readonly messageService: MessageService;
  private readonly roleMemoryService: RoleMemoryService;
  private readonly settingsService: SettingsService;
  private readonly turnControlService = new TurnControlService();
  private readonly worldStateService: WorldStateService;
  private readonly workflowService: WorkflowService;
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
    this.workflowService = new WorkflowService({
      eventStore: this.eventStore,
      clock: this.clock,
      assertAllowed: (capability) => this.policyGate.assertAllowed(capability),
      appendAudit: (input) => this.policyGate.appendAudit(input),
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
    const config = await loadProjectConfig(this.options.root);
    return {
      root: this.options.root,
      name: config.project.name,
      defaultWorldId: config.defaults.world,
    };
  }

  getSettings(): Promise<SettingsSnapshot> {
    return this.settingsService.getSettings();
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
    try {
      await loadProjectConfig(this.options.root);
      await loadWorldConfigs(this.options.root);
      await loadRoleConfigs(this.options.root);
      return { ok: true, errors: [] };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async getEffectiveConfig(): Promise<{
    project: Awaited<ReturnType<RealmApplicationService["getProject"]>>;
    worlds: WorldSummary[];
    roles: RoleSummary[];
  }> {
    return {
      project: await this.getProject(),
      worlds: await this.listWorlds(),
      roles: await this.listRoles(),
    };
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const worlds = await loadWorldConfigs(this.options.root);
    return worlds.map((world) => {
      const defaultRoomId =
        Object.entries(world.rooms).find(([, room]) => room.type === "world-main")?.[0] ??
        Object.keys(world.rooms)[0] ??
        "main";
      return {
        id: world.id,
        name: world.name,
        mode: world.mode,
        defaultRoomId,
        roleIds: world.roles.map((role) => role.id),
      };
    });
  }

  async listRooms(worldId: string): Promise<Room[]> {
    return this.messageService.listRooms(worldId);
  }

  async listRoles(): Promise<RoleSummary[]> {
    const roleConfigs = await loadRoleConfigs(this.options.root);
    const explicitRoles = new Map<string, RoleSummary>(
      roleConfigs.map((role) => [
        role.id,
        {
          id: role.id,
          displayName: role.displayName,
          model: role.model,
          source: "config" as const,
        },
      ]),
    );

    for (const world of await loadWorldConfigs(this.options.root)) {
      for (const role of world.roles) {
        if (!explicitRoles.has(role.id)) {
          explicitRoles.set(role.id, {
            id: role.id,
            displayName: humanizeId(role.id),
            model: role.model,
            source: "world",
          });
        }
      }
    }

    return [...explicitRoles.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  listEvents(options: { afterSeq?: number; limit?: number } = {}): readonly RealmEvent[] {
    return this.eventStore.list(options);
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
  ): Promise<{ patchId: string; historyId: string; changedPaths: string[] }> {
    return this.configPatchService.applyConfigPatch(patchId);
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
}
