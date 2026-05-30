import { stdout as output } from "node:process";
import type { ConfigPatchProposal } from "@realm/api-contract";
import { RealmHttpClient } from "@realm/client-sdk";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";
import { handleDraftCommand } from "./draft-command-handler.ts";
import { errorMessage } from "./error-message.ts";
import {
  createGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import { resolveTuiLocale, type TuiDictionary, type TuiLocale, t } from "./i18n.ts";
import {
  buildAppCommandHandlers,
  createNlHost,
  renderWhereami,
  routeFreeFormOrSend,
  slashToCommand,
} from "./interactive-helpers.ts";
import { runInteractiveSession } from "./interactive-session.ts";
import { matchTrustCommand } from "./realm-tui-app-trust.ts";
import { runTrustElevation } from "./realm-tui-command-handlers.ts";
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
import { routeTuiCommand } from "./tui-command-router.ts";
import {
  type ExtendedConfirmationContext,
  resolveModelChangeConfirmation,
  resolveSimConfirmation,
  rollbackConfig,
  type TuiExtendedPending,
} from "./tui-extended-confirmations.ts";
import { detectSystemLocale, persistTuiLocale } from "./tui-locale.ts";
import {
  type NlHost,
  resolveStatePatchConfirmation,
  type TuiPendingStatePatch,
} from "./tui-nl-router.ts";
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
  // Irreversible/medium-risk gates the shared pending bag does not cover (sim
  // tick/fork writes, default-model change); resolved before the shared resolver.
  private readonly extendedPending: TuiExtendedPending = {};
  // Last config patch history id applied this session; the implicit `:rollback` target.
  private lastConfigHistoryId: string | undefined;
  // NL-routed state-patch awaiting a typed world-id confirmation (write-gated).
  private pendingStatePatch: TuiPendingStatePatch | undefined;
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

  /** Current interface locale; read live so a `:locale` switch re-renders. */
  getLocale(): TuiLocale {
    return this.locale;
  }

  /** Clears every armed transient confirmation; true if at least one was discarded. */
  clearTransient(): boolean {
    const hadPending = Boolean(
      this.pending.roleSend ||
        this.pending.identitySwitch ||
        this.pending.godAction ||
        this.pending.roleTurn ||
        this.extendedPending.sim ||
        this.extendedPending.modelChange ||
        this.pendingStatePatch,
    );
    this.resetPendings();
    return hadPending;
  }

  /** Discards every armed transient confirmation across both pending bags. */
  resetPendings(): void {
    this.pending.roleSend = undefined;
    this.pending.identitySwitch = undefined;
    this.pending.godAction = undefined;
    this.pending.roleTurn = undefined;
    this.extendedPending.sim = undefined;
    this.extendedPending.modelChange = undefined;
    this.pendingStatePatch = undefined;
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
    if (this.pendingStatePatch) {
      return resolveStatePatchConfirmation(this.nlHost(), this.pendingStatePatch, trimmed);
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
    // `:trust [tier]` leaves read-only live; intercepted ahead of parseTuiCommand so
    // a bare token never posts as chat. Reload after so the new tier re-renders.
    const trustArg = matchTrustCommand(trimmed);
    if (trustArg !== undefined) {
      const notice = await runTrustElevation(this.client, this.dictionary, trustArg || undefined);
      await this.reload();
      return notice;
    }
    const command = parseTuiCommand(trimmed.startsWith("/") ? slashToCommand(trimmed) : trimmed);
    if (command.kind === "quit") {
      return this.dictionary.useCtrlCToExit;
    }
    if (command.kind === "send") {
      // Free-form text is the primary surface: route through the NL commander,
      // falling back to a verbatim chat message (explicit :send/:/send bypass it).
      return routeFreeFormOrSend(this.nlHost(), trimmed, () => this.handleSend(command.content));
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
    return this.dispatchCommand(command);
  }

  async setAssistantProposal(proposal: ConfigPatchProposal | undefined): Promise<void> {
    this.state = { ...(await this.load()), assistantProposal: proposal };
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

  // NL + state-patch host hooks: dispatch a command, arm/clear the state-patch gate.
  dispatchCommand(command: TuiCommand): Promise<string> {
    const handlers = buildAppCommandHandlers(this, {
      client: this.client,
      dictionary: this.dictionary,
      locale: this.locale,
    });
    return routeTuiCommand(handlers, command);
  }

  setPendingStatePatch(pending: TuiPendingStatePatch | undefined): void {
    this.pendingStatePatch = pending;
  }

  private nlHost(): NlHost {
    return createNlHost(this, { client: this.client, dictionary: this.dictionary });
  }

  async requestGodAction(command: Extract<TuiCommand, { kind: "god" }>): Promise<string> {
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

  async handle(command: TuiCommand): Promise<string> {
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

  async switchWorld(worldId: string): Promise<string> {
    this.selectedWorldId = worldId;
    this.selectedRoomId = undefined;
    this.resetPendings();
    this.state = undefined;
    const state = await this.load();
    this.state = { ...state, identity: "owner" };
    return this.dictionary.worldSwitched(state.world?.name ?? worldId);
  }

  async switchRoom(roomId: string): Promise<string> {
    this.selectedRoomId = roomId;
    this.state = await this.load(roomId);
    return this.dictionary.roomSwitched(this.state.room?.name ?? roomId);
  }

  async createRoom(command: Extract<TuiCommand, { kind: "createRoom" }>): Promise<string> {
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
  async stageProposal(result: TuiProposalResult): Promise<string> {
    this.state = { ...(await this.load()), assistantProposal: result.patch };
    return result.notice;
  }

  extendedConfirmationContext(): ExtendedConfirmationContext {
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

  async rollbackConfig(historyId?: string): Promise<string> {
    const ctx = this.extendedConfirmationContext();
    const result = await rollbackConfig(ctx, historyId, this.lastConfigHistoryId);
    if (result.rolledBack) {
      // Rollback creates a new history entry; clear the stale last-applied id.
      this.lastConfigHistoryId = undefined;
    }
    return result.notice;
  }

  async switchLocale(locale: TuiLocale): Promise<string> {
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

  async reload(): Promise<void> {
    this.state = undefined;
    await this.load();
  }

  async requestIdentitySwitch(identity: string): Promise<string> {
    const state = await this.load();
    const result = armIdentitySwitch(this.pending, state, identity, this.dictionary);
    if (result.kind === "switchedToOwner") {
      this.state = { ...state, identity: "owner" };
    }
    return result.notice;
  }

  async requestRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string> {
    return armRoleTurn(this.pending, await this.load(), command, this.dictionary);
  }

  async inspectWorldState(path?: string): Promise<string> {
    const result = await inspectWorldStateMutation(this.stateMutationDeps(), path);
    this.state = result.state;
    return result.notice;
  }

  async inspectRoleMemory(roleId: string): Promise<string> {
    const result = await inspectRoleMemoryMutation(this.stateMutationDeps(), roleId);
    this.state = result.state;
    return result.notice;
  }

  async applyPendingConfigPatch(confirmation?: string): Promise<string> {
    const result = await applyConfigPatchMutation(this.stateMutationDeps(), confirmation);
    if (result.state) {
      this.state = result.state;
      // Remember the history id so a bare `:rollback` can undo this apply.
      this.lastConfigHistoryId = result.historyId;
    }
    return result.notice;
  }
}
