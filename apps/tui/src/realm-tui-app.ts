import { stdout as output } from "node:process";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import { applyPendingConfigPatchFromTui } from "./config-patch-actions.ts";
import { renderConfigPatchPreview } from "./config-patch-preview.ts";
import { handleDraftCommand } from "./draft-command-handler.ts";
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
import { inspectRoleMemoryForTui, inspectWorldStateForTui } from "./inspection-actions.ts";
import { renderWhereami, slashToCommand } from "./interactive-helpers.ts";
import { runInteractiveSession } from "./interactive-session.ts";
import { loadTuiState } from "./realm-tui-state-loader.ts";
import {
  createRoleSendConfirmation,
  decideRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import {
  createRoleTurnConfirmation,
  decideRoleTurnConfirmation,
  formatRoleTurnConfirmation,
} from "./role-turn-confirmation.ts";
import { applyGodActionFromTui, createRuntimeRoom, runRoleTurnFromTui } from "./runtime-actions.ts";
import {
  loadSettingsItems as loadSettingsItemsForTui,
  loadSettingsSummary as loadSettingsSummaryForTui,
  updateDefaultModelSettings,
} from "./settings-actions.ts";
import type { TuiOptions } from "./tui-options.ts";
import {
  confirmPendingRoleSend,
  sendOneShotWithDraft,
  sendWithDraftOnFailure,
} from "./tui-send-actions.ts";
import type {
  TuiCommand,
  TuiPendingGodAction,
  TuiPendingIdentitySwitch,
  TuiPendingRoleSend,
  TuiPendingRoleTurn,
  TuiSettingsItem,
  TuiState,
} from "./types.ts";
import { renderTui } from "./view-model.ts";

export class RealmTuiApp {
  private readonly client: RealmHttpClient;
  private pendingGodAction: TuiPendingGodAction | undefined;
  private pendingIdentitySwitch: TuiPendingIdentitySwitch | undefined;
  private pendingRoleSend: TuiPendingRoleSend | undefined;
  private pendingRoleTurn: TuiPendingRoleTurn | undefined;
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
    await sendOneShotWithDraft(
      this.client,
      await this.load(),
      content,
      this.options.draftsDir,
      this.dictionary,
    );
    await this.reload();
  }

  async proposeAssistant(goal: string): Promise<void> {
    const payload = await this.client.proposeAssistantConfig({ goal });
    this.state = { ...(await this.load()), assistantProposal: payload.patch };
  }

  async loadSettingsSummary(): Promise<void> {
    this.state = {
      ...(await this.load()),
      settingsSummary: await loadSettingsSummaryForTui(this.client),
    };
  }

  async updateDefaultModel(provider: string, model: string): Promise<void> {
    this.state = {
      ...(await this.load()),
      settingsSummary: await updateDefaultModelSettings(this.client, provider, model),
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
        await applyGodActionFromTui(this.client, pending);
        await this.reload();
        return this.dictionary.godActionApplied(pending.action, pending.targetRoleLabel);
      }
      if (decision === "cancel") {
        this.pendingGodAction = undefined;
        return this.dictionary.godActionCancelled;
      }
      return formatGodActionConfirmation(this.pendingGodAction);
    }
    if (this.pendingRoleTurn) {
      const decision = decideRoleTurnConfirmation(trimmed);
      if (decision === "confirm") {
        const pending = this.pendingRoleTurn;
        this.pendingRoleTurn = undefined;
        const notice = await this.runRoleTurn({
          kind: "runRole",
          ...(pending.prompt ? { prompt: pending.prompt } : {}),
          roleId: pending.roleId,
        });
        return notice;
      }
      if (decision === "cancel") {
        this.pendingRoleTurn = undefined;
        return this.dictionary.roleTurnCancelled;
      }
      return formatRoleTurnConfirmation(this.pendingRoleTurn);
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
    const draftNotice = await (async () => {
      try {
        return await handleDraftCommand(
          command,
          this.client,
          this.options.draftsDir,
          this.dictionary,
        );
      } catch (error) {
        return errorMessage(error);
      }
    })();
    if (draftNotice) {
      if (command.kind === "retryDraft") {
        await this.reload();
      }
      return draftNotice;
    }
    if (command.kind === "world") {
      return this.switchWorld(command.worldId);
    }
    if (command.kind === "room") {
      return this.switchRoom(command.roomId);
    }
    if (command.kind === "createRoom") {
      return this.createRoom(command);
    }
    if (command.kind === "runRole") {
      return this.requestRoleTurn(command);
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
      this.pendingRoleTurn = undefined;
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
      return this.switchWorld(value.slice("world:".length));
    }
    if (value.startsWith("room:")) {
      return this.switchRoom(value.slice("room:".length));
    }
    if (value.startsWith("role:")) {
      const identity = value.slice("role:".length);
      return this.requestIdentitySwitch(identity);
    }
    return this.dictionary.commandIgnored;
  }

  async loadSettingsItems(): Promise<TuiSettingsItem[]> {
    return loadSettingsItemsForTui(this.client, await this.load(), this.dictionary);
  }

  async load(roomOverride?: string): Promise<TuiState> {
    if (this.state && !roomOverride) {
      return this.state;
    }
    this.state = await loadTuiState(this.client, {
      options: this.options,
      previous: this.state,
      roomOverride,
      selectedRoomId: this.selectedRoomId,
      selectedWorldId: this.selectedWorldId,
    });
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
    if (command.kind === "assistant") {
      await this.proposeAssistant(command.goal);
      return;
    }
  }

  private async switchWorld(worldId: string): Promise<string> {
    this.selectedWorldId = worldId;
    this.selectedRoomId = undefined;
    this.pendingGodAction = undefined;
    this.pendingIdentitySwitch = undefined;
    this.pendingRoleSend = undefined;
    this.pendingRoleTurn = undefined;
    this.state = undefined;
    const state = await this.load();
    this.state = { ...state, identity: "owner" };
    return this.dictionary.worldSwitched(state.world?.name ?? worldId);
  }

  private async switchRoom(roomId: string): Promise<string> {
    this.selectedRoomId = roomId;
    this.state = await this.load(roomId);
    return this.dictionary.roomSwitched(this.state.room?.name ?? roomId);
  }

  private async createRoom(command: Extract<TuiCommand, { kind: "createRoom" }>): Promise<string> {
    const result = await createRuntimeRoom(
      this.client,
      await this.load(),
      command,
      this.dictionary,
    );
    if (result.roomId) {
      this.selectedRoomId = result.roomId;
      this.state = undefined;
      await this.load(result.roomId);
    }
    return result.notice;
  }

  private async runRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string> {
    const notice = await runRoleTurnFromTui(
      this.client,
      await this.load(),
      command,
      this.dictionary,
    );
    await this.reload();
    return notice;
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
    this.pendingRoleTurn = undefined;
    return formatIdentitySwitchConfirmation(pending);
  }

  private async requestRoleTurn(
    command: Extract<TuiCommand, { kind: "runRole" }>,
  ): Promise<string> {
    const state = await this.load();
    const pending = createRoleTurnConfirmation(state, command.roleId, command.prompt);
    if (!pending) {
      return state.roles.some((role) => role.id === command.roleId)
        ? this.dictionary.cannotSendWithoutContext
        : this.dictionary.unknownRole(command.roleId);
    }
    this.pendingRoleTurn = pending;
    this.pendingRoleSend = undefined;
    this.pendingGodAction = undefined;
    return formatRoleTurnConfirmation(pending);
  }

  private async inspectWorldState(path?: string): Promise<string> {
    const inspected = inspectWorldStateForTui(
      await this.load(),
      this.locale,
      path,
      this.dictionary,
    );
    this.state = inspected.state;
    return inspected.notice;
  }

  private async inspectRoleMemory(roleId: string): Promise<string> {
    const inspected = await inspectRoleMemoryForTui(
      this.client,
      await this.load(),
      roleId,
      this.locale,
      this.dictionary,
    );
    this.state = inspected.state;
    return inspected.notice;
  }

  private async applyPendingConfigPatch(confirmation?: string): Promise<string> {
    const state = await this.load();
    const applied = await applyPendingConfigPatchFromTui(
      this.client,
      state.assistantProposal,
      confirmation,
      this.dictionary,
    );
    if (!applied.result) {
      return applied.notice;
    }
    this.state = undefined;
    const reloaded = await this.load();
    this.state = { ...reloaded, assistantProposal: undefined, lastPatchApply: applied.result };
    return applied.notice;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
