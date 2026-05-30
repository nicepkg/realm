import { matchesKey } from "@earendil-works/pi-tui";
import type { ConfigPatchProposal } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { type TuiDictionary, type TuiLocale, t } from "./i18n.ts";
import { buildTuiCommandHandlers, runTrustElevation } from "./realm-tui-command-handlers.ts";
import type { TuiCommandHandlers } from "./tui-command-router.ts";
import type { ExtendedConfirmationContext } from "./tui-extended-confirmations.ts";
import { handleNaturalLanguage, type NlHost, type TuiPendingStatePatch } from "./tui-nl-router.ts";
import type { TuiProposalResult } from "./tui-world-actions.ts";
import type { TuiCommand, TuiState } from "./types.ts";
import { renderRunState } from "./view-model.ts";

/**
 * Structural surface of {@link RealmTuiApp} the command-handler factory binds to.
 * Declared here (the factory lives outside the app class to keep it under the
 * file-size guard) so the app can pass `this` without this module importing the
 * class — keeping the two files free of a circular import.
 */
export type TuiCommandHandlerApp = {
  load(): Promise<TuiState>;
  switchWorld(worldId: string): Promise<string>;
  switchRoom(roomId: string): Promise<string>;
  createRoom(command: Extract<TuiCommand, { kind: "createRoom" }>): Promise<string>;
  stageProposal(result: TuiProposalResult): Promise<string>;
  extendedConfirmationContext(): ExtendedConfirmationContext;
  rollbackConfig(historyId?: string): Promise<string>;
  switchLocale(locale: TuiLocale): Promise<string>;
  requestRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string>;
  requestIdentitySwitch(identity: string): Promise<string>;
  inspectWorldState(path?: string): Promise<string>;
  inspectRoleMemory(roleId: string): Promise<string>;
  setAssistantProposal(proposal: ConfigPatchProposal | undefined): Promise<void>;
  applyPendingConfigPatch(confirmation?: string): Promise<string>;
  requestGodAction(command: Extract<TuiCommand, { kind: "god" }>): Promise<string>;
  handle(command: TuiCommand): Promise<string>;
};

/** Runtime values the handler table needs that change across a session (locale switch). */
export type TuiCommandHandlerRuntime = {
  client: RealmHttpClient;
  dictionary: TuiDictionary;
  locale: TuiLocale;
};

/** Builds the command-router handler table from the app's public action methods. */
export function buildAppCommandHandlers(
  app: TuiCommandHandlerApp,
  runtime: TuiCommandHandlerRuntime,
): TuiCommandHandlers {
  return buildTuiCommandHandlers({
    client: runtime.client,
    dictionary: runtime.dictionary,
    locale: runtime.locale,
    load: () => app.load(),
    switchWorld: (worldId) => app.switchWorld(worldId),
    switchRoom: (roomId) => app.switchRoom(roomId),
    createRoom: (command) => app.createRoom(command),
    stageProposal: (result) => app.stageProposal(result),
    extendedConfirmationContext: () => app.extendedConfirmationContext(),
    rollbackConfig: (historyId) => app.rollbackConfig(historyId),
    switchLocale: (locale) => app.switchLocale(locale),
    requestRoleTurn: (command) => app.requestRoleTurn(command),
    requestIdentitySwitch: (identity) => app.requestIdentitySwitch(identity),
    inspectWorldState: (path) => app.inspectWorldState(path),
    inspectRoleMemory: (roleId) => app.inspectRoleMemory(roleId),
    setAssistantProposal: (proposal) => app.setAssistantProposal(proposal),
    applyPendingConfigPatch: (confirmation) => app.applyPendingConfigPatch(confirmation),
    requestGodAction: (command) => app.requestGodAction(command),
    handle: (command) => app.handle(command),
  });
}

/** App surface the NL host binds to (write actions stay behind their typed-confirm gates). */
export type NlHostApp = {
  load(): Promise<TuiState>;
  reload(): Promise<void>;
  resetPendings(): void;
  setPendingStatePatch(pending: TuiPendingStatePatch | undefined): void;
  dispatchCommand(command: TuiCommand): Promise<string>;
};

/**
 * Builds the {@link NlHost} from the app + the session runtime (client/dictionary
 * that change on a locale switch). `elevateTrust` is wired to the shared
 * trust-elevation action so an NL "提升信任等级" leaves read-only live.
 */
export function createNlHost(
  app: NlHostApp,
  runtime: { client: RealmHttpClient; dictionary: TuiDictionary },
): NlHost {
  return {
    client: runtime.client,
    dictionary: runtime.dictionary,
    load: () => app.load(),
    reload: () => app.reload(),
    resetPendings: () => app.resetPendings(),
    setPendingStatePatch: (pending) => app.setPendingStatePatch(pending),
    elevateTrust: (tier) => runTrustElevation(runtime.client, runtime.dictionary, tier),
    dispatchCommand: (command) => app.dispatchCommand(command),
  };
}

/**
 * Routes a free-form composer line (NOT a colon/slash command) through the NL
 * commander, falling back to `sendFallback` when the classifier finds no
 * actionable intent. Explicit `:send`/`/send` never reach here. Write-bearing
 * intents stay behind their existing typed-confirm gates — NL never auto-writes.
 */
export async function routeFreeFormOrSend(
  host: NlHost,
  trimmed: string,
  sendFallback: () => Promise<string>,
): Promise<string> {
  if (!trimmed.startsWith(":") && !trimmed.startsWith("/")) {
    const handled = await handleNaturalLanguage(host, trimmed);
    if (handled !== undefined) {
      return handled;
    }
  }
  return sendFallback();
}

export function renderStatusLine(state: TuiState, locale: TuiLocale = "en"): string {
  const dict = t(locale);
  const world = state.world?.id ?? dict.noWorld;
  const room = state.room?.id ?? dict.noRoom;
  const provider = state.providerModel ?? dict.noValue;
  const running = renderRunState(state.events, dict);
  return `Realm | ${state.projectName} | ${dict.world}:${world} | ${dict.room}:${room} | ${dict.speaking}:${state.identity} | ${dict.provider}:${provider} | ${dict.running}:${running}`;
}

export function renderWhereami(state: TuiState, locale: TuiLocale = "en"): string {
  const dict = t(locale);
  const lines = [
    `${dict.project}: ${state.projectName}`,
    `${dict.world}: ${state.world?.name ?? dict.noValue}`,
    `${dict.room}: ${state.room?.name ?? dict.noValue}`,
    `${dict.speaking}: ${state.identity}`,
    `${dict.visibleRoles}: ${state.roles.map((role) => role.id).join(", ") || dict.noValue}`,
  ];
  if (state.policySummary) {
    lines.push(
      `${dict.trustTier}: ${state.policySummary.trustTier}`,
      dict.policyCapabilities(
        state.policySummary.allowedCapabilities,
        state.policySummary.deniedCapabilities,
        state.policySummary.highRiskAllowed,
      ),
      dict.policyWarnings(state.policySummary.warnings.length),
    );
  }
  return lines.join(" · ");
}

export function slashToCommand(input: string): string {
  const [head, ...tail] = input.slice(1).split(/\s+/);
  const rest = tail.join(" ").trim();
  if (head === "world" && rest) {
    return `:world ${rest}`;
  }
  if (head === "room" && rest) {
    return `:room ${rest}`;
  }
  if (head === "create-room" && rest) {
    return `:create-room ${rest}`;
  }
  if (head === "run-role" && rest) {
    return `:run-role ${rest}`;
  }
  if ((head === "as" || head === "id") && rest) {
    return `:id ${rest}`;
  }
  if (head === "assistant" && rest) {
    return `:assistant ${rest}`;
  }
  if (head === "state") {
    return rest ? `:state ${rest}` : ":state";
  }
  if (head === "memory" && rest) {
    return `:memory ${rest}`;
  }
  if (head === "patch") {
    return rest ? `:patch ${rest}` : ":patch";
  }
  if (head === "send" && rest) {
    return `:send ${rest}`;
  }
  if (head === "refresh") {
    return ":refresh";
  }
  if (head === "drafts") {
    return ":drafts";
  }
  return input;
}

export function isCtrlC(data: string): boolean {
  return (
    matchesKey(data, "ctrl+c") || data === "\x03" || data.includes("\x03") || data.includes("[99;5")
  );
}
