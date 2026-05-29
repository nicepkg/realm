import { stdout as output } from "node:process";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import { handleDraftCommand } from "./draft-command-handler.ts";
import {
  createGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import { resolveTuiLocale, type TuiDictionary, type TuiLocale, t } from "./i18n.ts";
import { renderWhereami, slashToCommand } from "./interactive-helpers.ts";
import { runInteractiveSession } from "./interactive-session.ts";
import { buildTuiCommandHandlers } from "./realm-tui-command-handlers.ts";
import { loadTuiState } from "./realm-tui-state-loader.ts";
import {
  createRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import { createRuntimeRoom } from "./runtime-actions.ts";
import {
  loadSettingsItems as loadSettingsItemsForTui,
  loadSettingsSummary as loadSettingsSummaryForTui,
  updateDefaultModelSettings,
} from "./settings-actions.ts";
import { routeTuiCommand, type TuiCommandHandlers } from "./tui-command-router.ts";
import {
  type ExtendedConfirmationContext,
  resolveModelChangeConfirmation,
  resolveSimConfirmation,
  rollbackConfig,
  type TuiExtendedPending,
} from "./tui-extended-confirmations.ts";
import { detectSystemLocale, persistTuiLocale } from "./tui-locale.ts";
import type { TuiOptions } from "./tui-options.ts";
import { applyTuiPaletteItem } from "./tui-palette.ts";
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
  applyConfigPatchMutation,
  inspectRoleMemoryMutation,
  inspectWorldStateMutation,
  runRoleTurnMutation,
  type StateMutationDeps,
} from "./tui-state-mutations.ts";
import type { TuiProposalResult } from "./tui-world-actions.ts";
import type { TuiCommand, TuiSettingsItem, TuiState } from "./types.ts";
import { renderTui } from "./view-model.ts";

export class RealmTuiApp {
  private readonly client: RealmHttpClient;
  private readonly pending: TuiPendingConfirmations = {};
  // Two additional irreversible/medium-risk gates the shared TuiPendingConfirmations
  // bag does not cover yet (multi-tick/fork sim writes, default-model change).
  // Resolved before the shared resolver so the role-send/identity/God/role-turn
  // record stays untouched.
  private readonly extendedPending: TuiExtendedPending = {};
  // Last config patch history id applied this session, surfaced in the apply
  // notice and used as the implicit `:rollback` target so the operator never
  // has to copy it by hand.
  private lastConfigHistoryId: string | undefined;
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
        this.pending.roleTurn ||
        this.extendedPending.sim ||
        this.extendedPending.modelChange,
    );
    this.resetPendings();
    return hadPending;
  }

  /** Discards every armed transient confirmation across both pending bags. */
  private resetPendings(): void {
    this.pending.roleSend = undefined;
    this.pending.identitySwitch = undefined;
    this.pending.godAction = undefined;
    this.pending.roleTurn = undefined;
    this.extendedPending.sim = undefined;
    this.extendedPending.modelChange = undefined;
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
    if (this.extendedPending.sim) {
      return resolveSimConfirmation(this.extendedConfirmationContext(), trimmed);
    }
    if (this.extendedPending.modelChange) {
      return resolveModelChangeConfirmation(this.extendedConfirmationContext(), trimmed);
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
      return this.handleSend(command.content);
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
    return routeTuiCommand(this.commandHandlers(), command);
  }

  private commandHandlers(): TuiCommandHandlers {
    return buildTuiCommandHandlers({
      client: this.client,
      dictionary: this.dictionary,
      locale: this.locale,
      load: () => this.load(),
      switchWorld: (worldId) => this.switchWorld(worldId),
      switchRoom: (roomId) => this.switchRoom(roomId),
      createRoom: (command) => this.createRoom(command),
      stageProposal: (result) => this.stageProposal(result),
      extendedConfirmationContext: () => this.extendedConfirmationContext(),
      rollbackConfig: (historyId) => this.rollbackConfig(historyId),
      switchLocale: (locale) => this.switchLocale(locale),
      requestRoleTurn: (command) => this.requestRoleTurn(command),
      requestIdentitySwitch: (identity) => this.requestIdentitySwitch(identity),
      inspectWorldState: (path) => this.inspectWorldState(path),
      inspectRoleMemory: (roleId) => this.inspectRoleMemory(roleId),
      setAssistantProposal: async (proposal) => {
        this.state = { ...(await this.load()), assistantProposal: proposal };
      },
      applyPendingConfigPatch: (confirmation) => this.applyPendingConfigPatch(confirmation),
      requestGodAction: (command) => this.requestGodAction(command),
      handle: (command) => this.handle(command),
    });
  }

  private async handleSend(content: string): Promise<string> {
    const state = await this.load();
    const pending = createRoleSendConfirmation(state, content);
    if (pending && "blocked" in pending) {
      // Non-member identity: refuse with a named reason; never arm a y/n confirm.
      return this.dictionary.roleNotInRoom(pending.roleLabel, pending.roomName);
    }
    if (pending) {
      this.pending.roleSend = pending;
      return formatRoleSendConfirmation(pending, this.dictionary);
    }
    try {
      await sendWithDraftOnFailure(
        this.client,
        state,
        content,
        this.options.draftsDir,
        this.dictionary,
      );
      await this.reload();
      return this.dictionary.messageSent;
    } catch (error) {
      return errorMessage(error);
    }
  }

  private async requestGodAction(command: Extract<TuiCommand, { kind: "god" }>): Promise<string> {
    const pending = createGodActionConfirmation(await this.load(), command);
    if (!pending) {
      return this.dictionary.cannotApplyGodWithoutWorld;
    }
    this.pending.godAction = pending;
    this.pending.roleSend = undefined;
    this.pending.roleTurn = undefined;
    return formatGodActionConfirmation(pending, this.dictionary);
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
    return applyTuiPaletteItem(
      {
        dictionary: this.dictionary,
        loadSettingsSummary: () => this.loadSettingsSummary(),
        whereami: async () => renderWhereami(await this.load(), this.locale),
        switchWorld: (worldId) => this.switchWorld(worldId),
        switchRoom: (roomId) => this.switchRoom(roomId),
        requestIdentitySwitch: (identity) => this.requestIdentitySwitch(identity),
      },
      value,
    );
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

  private async handle(command: TuiCommand): Promise<string> {
    if (command.kind === "help") {
      output.write(`${renderTuiHelp(this.locale)}\n`);
    } else if (command.kind === "refresh") {
      await this.reload();
    } else if (command.kind === "settings") {
      await this.loadSettingsSummary();
    } else if (command.kind === "assistant") {
      await this.proposeAssistant(command.goal);
    }
    return this.dictionary.commandApplied;
  }

  private async switchWorld(worldId: string): Promise<string> {
    this.selectedWorldId = worldId;
    this.selectedRoomId = undefined;
    this.resetPendings();
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

  /** Stages a world/role create proposal as the active config patch. */
  private async stageProposal(result: TuiProposalResult): Promise<string> {
    this.state = { ...(await this.load()), assistantProposal: result.patch };
    return result.notice;
  }

  private extendedConfirmationContext(): ExtendedConfirmationContext {
    return {
      client: this.client,
      dictionary: this.dictionary,
      pending: this.extendedPending,
      load: () => this.load(),
      reload: () => this.reload(),
      updateDefaultModel: (provider, model) => this.updateDefaultModel(provider, model),
      clearRoleConfirmations: () => {
        this.pending.roleSend = undefined;
        this.pending.roleTurn = undefined;
        this.pending.godAction = undefined;
      },
    };
  }

  private async rollbackConfig(historyId?: string): Promise<string> {
    const result = await rollbackConfig(
      this.extendedConfirmationContext(),
      historyId,
      this.lastConfigHistoryId,
    );
    if (result.rolledBack) {
      // The rollback itself produces a new history entry; clear the stale
      // last-applied id so a follow-up `:rollback` does not silently reuse it.
      this.lastConfigHistoryId = undefined;
    }
    return result.notice;
  }

  private async switchLocale(locale: TuiLocale): Promise<string> {
    this.locale = locale;
    this.dictionary = t(locale);
    await persistTuiLocale(locale);
    return this.dictionary.localeSwitched(locale);
  }

  private runRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string> {
    return runRoleTurnMutation(this.stateMutationDeps(), command);
  }

  private stateMutationDeps(): StateMutationDeps {
    return {
      client: this.client,
      dictionary: this.dictionary,
      locale: this.locale,
      load: () => this.load(),
      reload: () => this.reload(),
    };
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
    const result = await inspectWorldStateMutation(this.stateMutationDeps(), path);
    this.state = result.state;
    return result.notice;
  }

  private async inspectRoleMemory(roleId: string): Promise<string> {
    const result = await inspectRoleMemoryMutation(this.stateMutationDeps(), roleId);
    this.state = result.state;
    return result.notice;
  }

  private async applyPendingConfigPatch(confirmation?: string): Promise<string> {
    const result = await applyConfigPatchMutation(this.stateMutationDeps(), confirmation);
    if (result.state) {
      this.state = result.state;
      // Remember the history id so a bare `:rollback` can undo this apply
      // without the operator copying the id out of the notice manually.
      this.lastConfigHistoryId = result.historyId;
    }
    return result.notice;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
