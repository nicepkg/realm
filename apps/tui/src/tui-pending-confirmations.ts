import type { RealmHttpClient } from "@realm/client-sdk";
import {
  decideGodActionConfirmation,
  formatGodActionConfirmation,
} from "./god-action-confirmation.ts";
import type { TuiDictionary } from "./i18n.ts";
import {
  createIdentitySwitchConfirmation,
  decideIdentitySwitchConfirmation,
  formatIdentitySwitchConfirmation,
} from "./identity-switch-confirmation.ts";
import {
  decideRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import {
  createRoleTurnConfirmation,
  decideRoleTurnConfirmation,
  formatRoleTurnConfirmation,
} from "./role-turn-confirmation.ts";
import { applyGodActionFromTui } from "./runtime-actions.ts";
import type {
  TuiCommand,
  TuiPendingGodAction,
  TuiPendingIdentitySwitch,
  TuiPendingRoleSend,
  TuiPendingRoleTurn,
  TuiState,
} from "./types.ts";

/**
 * Mutable bag of the four transient confirmations the TUI can have armed at any
 * one time. Held as a single record (rather than four loose fields) so the app
 * and this resolver can share one reference and mutate it in place without
 * getter/setter plumbing. At most one is set at a time in practice.
 */
export type TuiPendingConfirmations = {
  roleSend?: TuiPendingRoleSend;
  identitySwitch?: TuiPendingIdentitySwitch;
  godAction?: TuiPendingGodAction;
  roleTurn?: TuiPendingRoleTurn;
};

/**
 * Collaborator interface the pending-confirmation resolver needs from
 * {@link RealmTuiApp}. The app owns the transient pending state and reload
 * lifecycle; this module only resolves an armed confirmation against the user's
 * latest input. Keeping the resolution here (instead of inline in the app)
 * isolates the four near-identical confirm/cancel/reprompt branches behind a
 * single entry point without changing observable behavior.
 */
export type PendingConfirmationContext = {
  readonly client: RealmHttpClient;
  readonly dictionary: TuiDictionary;
  readonly pending: TuiPendingConfirmations;
  load(): Promise<TuiState>;
  reload(): Promise<void>;
  setState(state: TuiState): void;
  confirmPendingRoleSend(pending: TuiPendingRoleSend): Promise<void>;
  runRoleTurn(command: Extract<TuiCommand, { kind: "runRole" }>): Promise<string>;
};

/**
 * Resolves whichever confirmation is currently armed against `trimmed`. Returns
 * the notice to surface when a confirmation was active, or `undefined` when no
 * confirmation is pending and the caller should continue normal command
 * dispatch. Mirrors the original inline ordering exactly: role send → identity
 * switch → God action → role turn.
 */
export async function resolvePendingConfirmation(
  context: PendingConfirmationContext,
  trimmed: string,
): Promise<string | undefined> {
  const { pending } = context;
  if (pending.roleSend) {
    return resolveRoleSend(context, pending.roleSend, trimmed);
  }
  if (pending.identitySwitch) {
    return resolveIdentitySwitch(context, pending.identitySwitch, trimmed);
  }
  if (pending.godAction) {
    return resolveGodAction(context, pending.godAction, trimmed);
  }
  if (pending.roleTurn) {
    return resolveRoleTurn(context, pending.roleTurn, trimmed);
  }
  return undefined;
}

async function resolveRoleSend(
  context: PendingConfirmationContext,
  pending: TuiPendingRoleSend,
  trimmed: string,
): Promise<string> {
  const decision = decideRoleSendConfirmation(trimmed);
  if (decision === "confirm") {
    context.pending.roleSend = undefined;
    try {
      await context.confirmPendingRoleSend(pending);
      await context.reload();
      return context.dictionary.messageSentAs(pending.identityLabel);
    } catch (error) {
      return errorMessage(error);
    }
  }
  if (decision === "cancel") {
    context.pending.roleSend = undefined;
    return context.dictionary.roleSendCancelled;
  }
  return formatRoleSendConfirmation(pending, context.dictionary);
}

async function resolveIdentitySwitch(
  context: PendingConfirmationContext,
  pending: TuiPendingIdentitySwitch,
  trimmed: string,
): Promise<string> {
  const decision = decideIdentitySwitchConfirmation(trimmed);
  if (decision === "confirm") {
    context.pending.identitySwitch = undefined;
    context.setState({ ...(await context.load()), identity: pending.identity });
    return context.dictionary.roleSwitched(pending.identityLabel);
  }
  if (decision === "cancel") {
    context.pending.identitySwitch = undefined;
    return context.dictionary.roleSendCancelled;
  }
  return formatIdentitySwitchConfirmation(pending, context.dictionary);
}

async function resolveGodAction(
  context: PendingConfirmationContext,
  pending: TuiPendingGodAction,
  trimmed: string,
): Promise<string> {
  const decision = decideGodActionConfirmation(trimmed, pending);
  if (decision === "confirm") {
    context.pending.godAction = undefined;
    await applyGodActionFromTui(context.client, pending);
    await context.reload();
    return context.dictionary.godActionApplied(pending.action, pending.targetRoleLabel);
  }
  if (decision === "cancel") {
    context.pending.godAction = undefined;
    return context.dictionary.godActionCancelled;
  }
  return formatGodActionConfirmation(pending, context.dictionary);
}

async function resolveRoleTurn(
  context: PendingConfirmationContext,
  pending: TuiPendingRoleTurn,
  trimmed: string,
): Promise<string> {
  const decision = decideRoleTurnConfirmation(trimmed);
  if (decision === "confirm") {
    context.pending.roleTurn = undefined;
    return context.runRoleTurn({
      kind: "runRole",
      ...(pending.prompt ? { prompt: pending.prompt } : {}),
      roleId: pending.roleId,
    });
  }
  if (decision === "cancel") {
    context.pending.roleTurn = undefined;
    return context.dictionary.roleTurnCancelled;
  }
  return formatRoleTurnConfirmation(pending, context.dictionary);
}

/**
 * Result of arming an identity switch: either an immediate state mutation
 * (switching back to the owner needs no confirmation) or a notice with the
 * confirmation now stored on `pending`.
 */
export type ArmIdentitySwitchResult =
  | { kind: "switchedToOwner"; notice: string }
  | { kind: "notice"; notice: string };

/**
 * Arms an identity-switch confirmation on `pending`. Switching to "owner" is
 * immediate (returns `switchedToOwner` so the app can flip identity); any other
 * role stores a confirmation and clears the sibling confirmations, matching the
 * previous inline behavior exactly.
 */
export function armIdentitySwitch(
  pending: TuiPendingConfirmations,
  state: TuiState,
  identity: string,
  dictionary: TuiDictionary,
): ArmIdentitySwitchResult {
  if (identity === "owner") {
    pending.identitySwitch = undefined;
    return { kind: "switchedToOwner", notice: dictionary.roleSwitched("Boss") };
  }
  const confirmation = createIdentitySwitchConfirmation(identity, state.roles);
  if (!confirmation) {
    return { kind: "notice", notice: dictionary.commandIgnored };
  }
  pending.identitySwitch = confirmation;
  pending.roleSend = undefined;
  pending.godAction = undefined;
  pending.roleTurn = undefined;
  return { kind: "notice", notice: formatIdentitySwitchConfirmation(confirmation, dictionary) };
}

/**
 * Arms a role-turn confirmation on `pending` and returns the notice to surface.
 * When no confirmation can be built the role's existence decides whether the
 * blocker is missing context or an unknown role, matching the original body.
 */
export function armRoleTurn(
  pending: TuiPendingConfirmations,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "runRole" }>,
  dictionary: TuiDictionary,
): string {
  const confirmation = createRoleTurnConfirmation(
    state,
    command.roleId,
    dictionary,
    command.prompt,
  );
  if (!confirmation) {
    return state.roles.some((role) => role.id === command.roleId)
      ? dictionary.cannotSendWithoutContext
      : dictionary.unknownRole(command.roleId);
  }
  pending.roleTurn = confirmation;
  pending.roleSend = undefined;
  pending.godAction = undefined;
  return formatRoleTurnConfirmation(confirmation, dictionary);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
