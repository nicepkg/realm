import type { RealmHttpClient } from "@realm/client-sdk";
import { parseTrustCommandArg, TUI_TRUST_TIERS } from "./commands.ts";
import { renderConfigPatchPreview } from "./config-patch-preview.ts";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommandHandlers } from "./tui-command-router.ts";
import { armModelChange, armOrRunSimAction } from "./tui-extended-confirmations.ts";
import { proposeRoleFromTui, proposeWorldFromTui } from "./tui-world-actions.ts";

/**
 * Elevates project trust live via `POST /api/trust`. Closes the TUI's trust
 * dead-end: under `requireTrust:true` the fake runtime boots read-only, so the
 * operator needs an in-app way to leave read-only instead of every write being
 * silently rejected. Validates the requested tier first and returns a localized
 * notice (success) or error (unknown tier) without throwing.
 */
export async function runTrustElevation(
  client: RealmHttpClient,
  dictionary: TuiDictionary,
  arg: string | undefined,
): Promise<string> {
  const parsed = parseTrustCommandArg(arg);
  if (!parsed.tier) {
    return dictionary.trustInvalidTier(parsed.invalid ?? "", TUI_TRUST_TIERS.join(" | "));
  }
  const response = await client.setTrust(parsed.tier);
  return dictionary.trustElevated(response.trustTier);
}

/**
 * Minimal surface of `RealmTuiApp` that the command-handler wiring needs. Kept
 * here (rather than importing the class) so the handler factory stays decoupled
 * from the app's private internals and the two files don't import each other.
 */
export interface CommandHandlerApp {
  client: import("@realm/client-sdk").RealmHttpClient;
  dictionary: import("./i18n.ts").TuiDictionary;
  locale: import("./i18n.ts").TuiLocale;
  load(): Promise<import("./types.ts").TuiState>;
  switchWorld(worldId: string): Promise<string>;
  switchRoom(roomId: string): Promise<string>;
  createRoom(
    command: Extract<import("./types.ts").TuiCommand, { kind: "createRoom" }>,
  ): Promise<string>;
  stageProposal(result: import("./tui-world-actions.ts").TuiProposalResult): Promise<string>;
  extendedConfirmationContext(): import("./tui-extended-confirmations.ts").ExtendedConfirmationContext;
  rollbackConfig(historyId?: string): Promise<string>;
  switchLocale(locale: import("./i18n.ts").TuiLocale): Promise<string>;
  requestRoleTurn(
    command: Extract<import("./types.ts").TuiCommand, { kind: "runRole" }>,
  ): Promise<string>;
  requestIdentitySwitch(identity: string): Promise<string>;
  inspectWorldState(path?: string): Promise<string>;
  inspectRoleMemory(roleId: string): Promise<string>;
  setAssistantProposal(proposal: undefined): Promise<void>;
  applyPendingConfigPatch(confirmation?: string): Promise<string>;
  requestGodAction(
    command: Extract<import("./types.ts").TuiCommand, { kind: "god" }>,
  ): Promise<string>;
  handle(command: import("./types.ts").TuiCommand): Promise<string>;
}

/**
 * Builds the command-router handler table for a `RealmTuiApp`. Extracted from
 * the app class to keep the class under the file-size budget while preserving
 * the exact same routing behavior.
 */
export function buildTuiCommandHandlers(app: CommandHandlerApp): TuiCommandHandlers {
  return {
    switchWorld: (worldId) => app.switchWorld(worldId),
    switchRoom: (roomId) => app.switchRoom(roomId),
    createRoom: (command) => app.createRoom(command),
    createWorld: async (command) =>
      app.stageProposal(await proposeWorldFromTui(app.client, command, app.dictionary)),
    createRole: async (command) =>
      app.stageProposal(await proposeRoleFromTui(app.client, command, app.dictionary)),
    controlSimulation: (command) =>
      armOrRunSimAction(app.extendedConfirmationContext(), command.action),
    rollbackConfig: (command) => app.rollbackConfig(command.historyId),
    switchLocale: (command) => app.switchLocale(command.locale),
    requestRoleTurn: (command) => app.requestRoleTurn(command),
    requestIdentitySwitch: (identity) => app.requestIdentitySwitch(identity),
    inspectWorldState: (path) => app.inspectWorldState(path),
    inspectRoleMemory: (roleId) => app.inspectRoleMemory(roleId),
    patchPreview: async () =>
      renderConfigPatchPreview((await app.load()).assistantProposal, app.locale),
    patchReject: async () => {
      await app.setAssistantProposal(undefined);
      return app.dictionary.patchRejected;
    },
    patchApply: (command) => app.applyPendingConfigPatch(command.confirmation),
    requestModelChange: (command) =>
      armModelChange(app.extendedConfirmationContext(), command.provider, command.model),
    requestGodAction: (command) => app.requestGodAction(command),
    fallthrough: (command) => app.handle(command),
  };
}
