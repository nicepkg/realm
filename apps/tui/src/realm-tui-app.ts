import { stdout as output } from "node:process";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import { applyPendingConfigPatchFromTui } from "./config-patch-actions.ts";
import { renderConfigPatchPreview } from "./config-patch-preview.ts";
import { handleDraftCommand } from "./draft-command-handler.ts";
import {
  createGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import { resolveTuiLocale, type TuiDictionary, type TuiLocale, t } from "./i18n.ts";
import { inspectRoleMemoryForTui, inspectWorldStateForTui } from "./inspection-actions.ts";
import { renderWhereami, slashToCommand } from "./interactive-helpers.ts";
import { runInteractiveSession } from "./interactive-session.ts";
import { loadTuiState } from "./realm-tui-state-loader.ts";
import {
  createRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import { createRuntimeRoom, runRoleTurnFromTui } from "./runtime-actions.ts";
import {
  loadSettingsItems as loadSettingsItemsForTui,
  loadSettingsSummary as loadSettingsSummaryForTui,
  updateDefaultModelSettings,
} from "./settings-actions.ts";
import { detectSystemLocale, persistTuiLocale } from "./tui-locale.ts";
import type { TuiOptions } from "./tui-options.ts";
import {
  armIdentitySwitch,
  armRoleTurn,
  type PendingConfirmationContext,
  resolvePendingConfirmation,
  type TuiPendingConfirmations,
} from "./tui-pending-confirmations.ts";
import {
  confirmPendingRoleSend,
  sendOneShotWithDraft,
  sendWithDraftOnFailure,
} from "./tui-send-actions.ts";
import {
  controlSimulationFromTui,
  proposeRoleFromTui,
  proposeWorldFromTui,
} from "./tui-world-actions.ts";
import type { TuiCommand, TuiSettingsItem, TuiSimAction, TuiState } from "./types.ts";
import { renderTui } from "./view-model.ts";

export class RealmTuiApp {
  private readonly client: RealmHttpClient;
  private readonly pending: TuiPendingConfirmations = {};
  private selectedRoomId: string | undefined;
  private selectedWorldId: string | undefined;
  private state: TuiState | undefined;
  private dictionary: TuiDictionary;
  private locale: TuiLocale;

  constructor(private readonly options: TuiOptions = {}) {
    this.client = new RealmHttpClient({ baseUrl: options.baseUrl ?? "http://127.0.0.1:3737" });
    this.selectedRoomId = options.roomId;
    this.selectedWorldId = options.worldId;
    this.locale = resolveTuiLocale(options.locale ?? detectSystemLocale());
    this.dictionary = t(this.locale);
  }

  /**
   * Current interface locale. Exposed so the interactive session can read the
   * live value after a `:locale` switch instead of capturing it once.
   */
  getLocale(): TuiLocale {
    return this.locale;
  }

  /**
   * Clears every armed transient confirmation. Returns true when at least one
   * pending confirmation was actually discarded.
   */
  clearTransient(): boolean {
    const hadPending = Boolean(
      this.pending.roleSend ||
        this.pending.identitySwitch ||
        this.pending.godAction ||
        this.pending.roleTurn,
    );
    this.pending.roleSend = undefined;
    this.pending.identitySwitch = undefined;
    this.pending.godAction = undefined;
    this.pending.roleTurn = undefined;
    return hadPending;
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
    const app = this;
    await runInteractiveSession({
      applyPaletteItem: (value) => app.applyPaletteItem(value),
      clearTransient: () => app.clearTransient(),
      handleInteractiveInput: (input, showHelp, showSettings) =>
        app.handleInteractiveInput(input, showHelp, showSettings),
      load: () => app.load(),
      loadSettingsItems: () => app.loadSettingsItems(),
      // Read live so a `:locale` switch re-renders in the new language.
      get locale() {
        return app.getLocale();
      },
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
    const confirmationNotice = await resolvePendingConfirmation(
      this.pendingConfirmationContext(),
      trimmed,
    );
    if (confirmationNotice !== undefined) {
      return confirmationNotice;
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
        this.pending.roleSend = pending;
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
    if (command.kind === "createWorld") {
      return this.createWorld(command);
    }
    if (command.kind === "createRole") {
      return this.createRole(command);
    }
    if (command.kind === "sim") {
      return this.controlSimulation(command.action);
    }
    if (command.kind === "locale") {
      return this.switchLocale(command.locale);
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
      this.pending.godAction = pending;
      this.pending.roleSend = undefined;
      this.pending.roleTurn = undefined;
      return formatGodActionConfirmation(pending);
    }
    await this.handle(command);
    return this.dictionary.commandApplied;
  }

  private pendingConfirmationContext(): PendingConfirmationContext {
    return {
      client: this.client,
      dictionary: this.dictionary,
      pending: this.pending,
      load: () => this.load(),
      reload: () => this.reload(),
      setState: (state) => {
        this.state = state;
      },
      confirmPendingRoleSend: (pending) =>
        confirmPendingRoleSend(this.client, pending, this.options.draftsDir, this.dictionary),
      runRoleTurn: (command) => this.runRoleTurn(command),
    };
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
    this.pending.godAction = undefined;
    this.pending.identitySwitch = undefined;
    this.pending.roleSend = undefined;
    this.pending.roleTurn = undefined;
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

  private async createWorld(
    command: Extract<TuiCommand, { kind: "createWorld" }>,
  ): Promise<string> {
    const proposal = await proposeWorldFromTui(this.client, command, this.dictionary);
    this.state = { ...(await this.load()), assistantProposal: proposal.patch };
    return proposal.notice;
  }

  private async createRole(command: Extract<TuiCommand, { kind: "createRole" }>): Promise<string> {
    const proposal = await proposeRoleFromTui(this.client, command, this.dictionary);
    this.state = { ...(await this.load()), assistantProposal: proposal.patch };
    return proposal.notice;
  }

  private async controlSimulation(action: TuiSimAction): Promise<string> {
    return controlSimulationFromTui(this.client, await this.load(), action, this.dictionary, () =>
      this.reload(),
    );
  }

  private async switchLocale(locale: TuiLocale): Promise<string> {
    this.locale = locale;
    this.dictionary = t(locale);
    await persistTuiLocale(locale);
    return this.dictionary.localeSwitched(locale);
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
    const result = armIdentitySwitch(this.pending, state, identity, this.dictionary);
    if (result.kind === "switchedToOwner") {
      this.state = { ...state, identity: "owner" };
    }
    return result.notice;
  }

  private async requestRoleTurn(
    command: Extract<TuiCommand, { kind: "runRole" }>,
  ): Promise<string> {
    return armRoleTurn(this.pending, await this.load(), command, this.dictionary);
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
