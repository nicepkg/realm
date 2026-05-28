import { stdout as output } from "node:process";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import { renderConfigPatchPreview, typedConfirmationMatches } from "./config-patch-preview.ts";
import { renderDraftList, retryDraft } from "./draft-actions.ts";
import {
  createGodActionConfirmation,
  decideGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import { resolveTuiLocale, type TuiDictionary, type TuiLocale, t } from "./i18n.ts";
import {
  createIdentitySwitchConfirmation,
  decideIdentitySwitchConfirmation,
  formatIdentitySwitchConfirmation,
} from "./identity-switch-confirmation.ts";
import { renderWhereami, slashToCommand } from "./interactive-helpers.ts";
import { runInteractiveSession } from "./interactive-session.ts";
import {
  createRoleSendConfirmation,
  decideRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import { renderMemoryInspection, renderWorldStateInspection } from "./state-inspection.ts";
import type { TuiOptions } from "./tui-options.ts";
import {
  confirmPendingRoleSend,
  savePendingRoleDraft,
  sendWithDraftOnFailure,
} from "./tui-send-actions.ts";
import type {
  TuiCommand,
  TuiPendingGodAction,
  TuiPendingIdentitySwitch,
  TuiPendingRoleSend,
  TuiSettingsItem,
  TuiState,
} from "./types.ts";
import { renderTui } from "./view-model.ts";

export class RealmTuiApp {
  private readonly client: RealmHttpClient;
  private pendingGodAction: TuiPendingGodAction | undefined;
  private pendingIdentitySwitch: TuiPendingIdentitySwitch | undefined;
  private pendingRoleSend: TuiPendingRoleSend | undefined;
  private selectedRoomId: string | undefined;
  private selectedWorldId: string | undefined;
  private state: TuiState | undefined;
  private readonly dictionary: TuiDictionary;
  private readonly locale: TuiLocale;

  constructor(private readonly options: TuiOptions = {}) {
    this.client = new RealmHttpClient({ baseUrl: options.baseUrl ?? "http://127.0.0.1:3737" });
    this.selectedRoomId = options.roomId;
    this.selectedWorldId = options.worldId;
    this.locale = resolveTuiLocale(options.locale ?? process.env.REALM_LOCALE);
    this.dictionary = t(this.locale);
  }

  async render(): Promise<string> {
    return renderTui(await this.load(), this.locale);
  }

  async send(content: string): Promise<void> {
    const state = await this.load();
    const pending = createRoleSendConfirmation(state, content);
    if (pending) {
      const draft = await savePendingRoleDraft(
        pending,
        this.dictionary.draftRoleTakeoverCannotConfirm,
        this.options.draftsDir,
      );
      throw new Error(
        `${formatRoleSendConfirmation(pending)} ${this.dictionary.draftSaved(
          draft.record.id,
          draft.filePath,
        )}`,
      );
    }
    await sendWithDraftOnFailure(
      this.client,
      state,
      content,
      this.options.draftsDir,
      this.dictionary,
    );
    await this.reload();
  }

  private async confirmPendingGodAction(pending: TuiPendingGodAction): Promise<void> {
    await this.client.applyGodRoleAction(pending.worldId, {
      action: pending.action,
      idempotencyKey: `tui-god-${pending.action}-${pending.targetRoleId}-${Date.now()}`,
      reason: pending.reason,
      targetRoleId: pending.targetRoleId,
    });
    await this.reload();
  }

  async proposeAssistant(goal: string): Promise<void> {
    const payload = await this.client.proposeAssistantConfig({ goal });
    this.state = { ...(await this.load()), assistantProposal: payload.patch };
  }

  async loadSettingsSummary(): Promise<void> {
    const settings = await this.client.getSettings();
    this.state = {
      ...(await this.load()),
      settingsSummary: `${settings.user.defaultProvider}/${settings.user.defaultModel}`,
    };
  }

  async updateDefaultModel(provider: string, model: string): Promise<void> {
    const settings = await this.client.getSettings();
    const updated = await this.client.updateUserSettings({
      ...settings.user,
      defaultProvider: provider,
      defaultModel: model,
    });
    this.state = {
      ...(await this.load()),
      settingsSummary: `${updated.user.defaultProvider}/${updated.user.defaultModel}`,
    };
  }

  async runInteractive(): Promise<void> {
    await runInteractiveSession({
      applyPaletteItem: (value) => this.applyPaletteItem(value),
      handleInteractiveInput: (input, showHelp, showSettings) =>
        this.handleInteractiveInput(input, showHelp, showSettings),
      load: () => this.load(),
      loadSettingsItems: () => this.loadSettingsItems(),
      locale: this.locale,
    });
  }

  async handleInteractiveInput(
    input: string,
    showHelp: () => void,
    showSettings: () => Promise<void>,
  ): Promise<string | undefined> {
    const trimmed = input.trim();
    if (!trimmed) {
      await this.reload();
      return "Reloaded.";
    }
    if (this.pendingRoleSend) {
      const decision = decideRoleSendConfirmation(trimmed);
      if (decision === "confirm") {
        const pending = this.pendingRoleSend;
        this.pendingRoleSend = undefined;
        try {
          await confirmPendingRoleSend(
            this.client,
            pending,
            this.options.draftsDir,
            this.dictionary,
          );
          await this.reload();
          return this.dictionary.messageSentAs(pending.identityLabel);
        } catch (error) {
          return errorMessage(error);
        }
      }
      if (decision === "cancel") {
        this.pendingRoleSend = undefined;
        return this.dictionary.roleSendCancelled;
      }
      return formatRoleSendConfirmation(this.pendingRoleSend);
    }
    if (this.pendingIdentitySwitch) {
      const decision = decideIdentitySwitchConfirmation(trimmed);
      if (decision === "confirm") {
        const pending = this.pendingIdentitySwitch;
        this.pendingIdentitySwitch = undefined;
        this.state = { ...(await this.load()), identity: pending.identity };
        return this.dictionary.roleSwitched(pending.identityLabel);
      }
      if (decision === "cancel") {
        this.pendingIdentitySwitch = undefined;
        return this.dictionary.roleSendCancelled;
      }
      return formatIdentitySwitchConfirmation(this.pendingIdentitySwitch);
    }
    if (this.pendingGodAction) {
      const decision = decideGodActionConfirmation(trimmed, this.pendingGodAction);
      if (decision === "confirm") {
        const pending = this.pendingGodAction;
        this.pendingGodAction = undefined;
        await this.confirmPendingGodAction(pending);
        return this.dictionary.godActionApplied(pending.action, pending.targetRoleLabel);
      }
      if (decision === "cancel") {
        this.pendingGodAction = undefined;
        return this.dictionary.godActionCancelled;
      }
      return formatGodActionConfirmation(this.pendingGodAction);
    }
    if (trimmed === "/help") {
      showHelp();
      return this.dictionary.helpOpened;
    }
    if (trimmed === "/settings") {
      await showSettings();
      return this.dictionary.settingsOpened;
    }
    if (trimmed === "/whereami") {
      return renderWhereami(await this.load(), this.locale);
    }
    const command = parseTuiCommand(trimmed.startsWith("/") ? slashToCommand(trimmed) : trimmed);
    if (command.kind === "quit") {
      return this.dictionary.useCtrlCToExit;
    }
    if (command.kind === "send") {
      const state = await this.load();
      const pending = createRoleSendConfirmation(state, command.content);
      if (pending) {
        this.pendingRoleSend = pending;
        return formatRoleSendConfirmation(pending);
      }
      try {
        await sendWithDraftOnFailure(
          this.client,
          state,
          command.content,
          this.options.draftsDir,
          this.dictionary,
        );
        await this.reload();
        return this.dictionary.messageSent;
      } catch (error) {
        return errorMessage(error);
      }
    }
    if (command.kind === "drafts") {
      return renderDraftList(this.options.draftsDir, this.dictionary);
    }
    if (command.kind === "retryDraft") {
      try {
        const notice = await retryDraft(
          this.client,
          command.draftId,
          this.options.draftsDir,
          this.dictionary,
        );
        await this.reload();
        return notice;
      } catch (error) {
        return errorMessage(error);
      }
    }
    if (command.kind === "identity") {
      return this.requestIdentitySwitch(command.identity);
    }
    if (command.kind === "state") {
      return this.inspectWorldState(command.path);
    }
    if (command.kind === "memory") {
      return this.inspectRoleMemory(command.roleId);
    }
    if (command.kind === "patchPreview") {
      return renderConfigPatchPreview((await this.load()).assistantProposal, this.locale);
    }
    if (command.kind === "patchReject") {
      this.state = { ...(await this.load()), assistantProposal: undefined };
      return this.dictionary.patchRejected;
    }
    if (command.kind === "patchApply") {
      return this.applyPendingConfigPatch(command.confirmation);
    }
    if (command.kind === "god") {
      const pending = createGodActionConfirmation(await this.load(), command);
      if (!pending) {
        return this.dictionary.cannotApplyGodWithoutWorld;
      }
      this.pendingGodAction = pending;
      this.pendingRoleSend = undefined;
      return formatGodActionConfirmation(pending);
    }
    await this.handle(command);
    return this.dictionary.commandApplied;
  }

  async applyPaletteItem(value: string): Promise<string> {
    if (value === "settings") {
      await this.loadSettingsSummary();
      return this.dictionary.settingsSummaryLoaded;
    }
    if (value === "whereami") {
      return renderWhereami(await this.load(), this.locale);
    }
    if (value === "god") {
      return this.dictionary.godConsoleOpened;
    }
    if (value.startsWith("world:")) {
      this.selectedWorldId = value.slice("world:".length);
      this.selectedRoomId = undefined;
      this.state = undefined;
      const state = await this.load();
      return this.dictionary.worldSwitched(state.world?.name ?? this.selectedWorldId);
    }
    if (value.startsWith("room:")) {
      const roomId = value.slice("room:".length);
      this.selectedRoomId = roomId;
      this.state = await this.load(roomId);
      return this.dictionary.roomSwitched(this.state.room?.name ?? roomId);
    }
    if (value.startsWith("role:")) {
      const identity = value.slice("role:".length);
      return this.requestIdentitySwitch(identity);
    }
    return this.dictionary.commandIgnored;
  }

  async loadSettingsItems(): Promise<TuiSettingsItem[]> {
    const settings = await this.client.getSettings();
    const state = await this.load();
    return [
      {
        currentValue: settings.user.defaultProvider,
        description: this.dictionary.providerDescription,
        id: "provider",
        label: this.dictionary.provider,
      },
      {
        currentValue: settings.user.defaultModel,
        description: this.dictionary.modelDescription,
        id: "model",
        label: this.dictionary.model,
      },
      {
        currentValue: state.identity,
        description: this.dictionary.identityDescription,
        id: "identity",
        label: this.dictionary.identity,
      },
    ];
  }

  async load(roomOverride?: string): Promise<TuiState> {
    if (this.state && !roomOverride) {
      return this.state;
    }
    const effective = await this.client.getEffectiveConfig();
    const world =
      effective.worlds.find((candidate) => candidate.id === this.selectedWorldId) ??
      effective.worlds.find((candidate) => candidate.id === effective.project.defaultWorldId) ??
      effective.worlds[0];
    const rooms = world ? (await this.client.listRooms(world.id)).rooms : [];
    const room =
      rooms.find(
        (candidate) =>
          candidate.id === (roomOverride ?? this.selectedRoomId ?? this.options.roomId),
      ) ??
      rooms.find((candidate) => candidate.id === world?.defaultRoomId) ??
      rooms[0];
    const messages = room ? (await this.client.listMessages(room.id)).messages : [];
    const events = (await this.client.listEvents()).events;
    const previous = this.state;
    const worldState = world ? await this.client.getWorldState(world.id) : undefined;
    this.state = {
      projectName: effective.project.name,
      worlds: effective.worlds,
      world,
      rooms,
      room,
      roles: effective.roles,
      messages,
      events,
      identity: this.options.identity ?? this.state?.identity ?? "owner",
      worldState: worldState
        ? {
            state: worldState.state,
            version: worldState.version,
          }
        : undefined,
      settingsSummary: this.state?.settingsSummary,
      assistantProposal: this.state?.assistantProposal,
      lastPatchApply: previous?.lastPatchApply,
      memoryInspection: previous?.memoryInspection,
      stateInspection: previous?.stateInspection,
    };
    return this.state;
  }

  private async handle(command: TuiCommand): Promise<void> {
    if (command.kind === "help") {
      output.write(`${renderTuiHelp(this.locale)}\n`);
      return;
    }
    if (command.kind === "refresh") {
      await this.reload();
      return;
    }
    if (command.kind === "settings") {
      await this.loadSettingsSummary();
      return;
    }
    if (command.kind === "model") {
      await this.updateDefaultModel(command.provider, command.model);
      return;
    }
    if (command.kind === "room") {
      this.state = await this.load(command.roomId);
      return;
    }
    if (command.kind === "assistant") {
      await this.proposeAssistant(command.goal);
      return;
    }
    if (command.kind === "god") {
      const pending = createGodActionConfirmation(await this.load(), command);
      if (!pending) {
        throw new Error(this.dictionary.cannotApplyGodWithoutWorld);
      }
      this.pendingGodAction = pending;
    }
  }

  private async reload(): Promise<void> {
    this.state = undefined;
    await this.load();
  }

  private async requestIdentitySwitch(identity: string): Promise<string> {
    const state = await this.load();
    if (identity === "owner") {
      this.pendingIdentitySwitch = undefined;
      this.state = { ...state, identity: "owner" };
      return this.dictionary.roleSwitched("Boss");
    }
    const pending = createIdentitySwitchConfirmation(identity, state.roles);
    if (!pending) {
      return this.dictionary.commandIgnored;
    }
    this.pendingIdentitySwitch = pending;
    this.pendingRoleSend = undefined;
    this.pendingGodAction = undefined;
    return formatIdentitySwitchConfirmation(pending);
  }

  private async inspectWorldState(path?: string): Promise<string> {
    const state = await this.load();
    const inspection = renderWorldStateInspection(state.worldState, this.locale, path);
    this.state = { ...state, stateInspection: inspection };
    return this.dictionary.worldStateLoaded;
  }

  private async inspectRoleMemory(roleId: string): Promise<string> {
    const state = await this.load();
    try {
      if (!state.world) {
        return this.dictionary.noWorld;
      }
      const memory = await this.client.readRoleMemory(state.world.id, roleId);
      this.state = {
        ...state,
        memoryInspection: renderMemoryInspection(roleId, memory.content, this.locale),
      };
      return this.dictionary.memoryLoaded(roleId);
    } catch (error) {
      this.state = {
        ...state,
        memoryInspection: `${this.dictionary.memory}: ${roleId}\n${errorMessage(error)}`,
      };
      return errorMessage(error);
    }
  }

  private async applyPendingConfigPatch(confirmation?: string): Promise<string> {
    const state = await this.load();
    const patch = state.assistantProposal;
    if (!patch) {
      return this.dictionary.noConfigPatch;
    }
    if (!typedConfirmationMatches(patch, confirmation)) {
      return this.dictionary.patchApplyNeedsConfirmation(patch.typedConfirmation ?? "");
    }
    const result = await this.client.applyConfigPatch(
      patch.id,
      confirmation ? { confirmation } : {},
    );
    this.state = undefined;
    const reloaded = await this.load();
    this.state = { ...reloaded, assistantProposal: undefined, lastPatchApply: result };
    return this.dictionary.patchApplied(result.historyId);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
