import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand, TuiPendingGodAction, TuiState } from "./types.ts";

export async function applyGodActionFromTui(
  client: RealmHttpClient,
  pending: TuiPendingGodAction,
): Promise<void> {
  await client.applyGodRoleAction(pending.worldId, {
    action: pending.action,
    idempotencyKey: `tui-god-${pending.action}-${pending.targetRoleId}-${Date.now()}`,
    reason: pending.reason,
    targetRoleId: pending.targetRoleId,
  });
}

export async function createRuntimeRoom(
  client: RealmHttpClient,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "createRoom" }>,
  dictionary: TuiDictionary,
): Promise<{ notice: string; roomId?: string }> {
  if (!state.world) {
    return { notice: dictionary.noWorld };
  }
  const response = await client.createRoom(state.world.id, {
    idempotencyKey: `tui-room-${Date.now()}`,
    memberIds: command.memberIds,
    name: command.name,
    type: command.roomType,
  });
  return {
    notice: dictionary.roomCreated(response.room.name),
    roomId: response.room.id,
  };
}

/**
 * Blocking single-phase role turn kept for the one-shot/non-interactive path
 * (`runRoleTurnMutation`). The interactive session uses {@link
 * startRoleTurnFromTui} instead so the terminal never freezes for the whole LLM
 * turn. Returns the completion notice once the turn fully resolves.
 */
export async function runRoleTurnFromTui(
  client: RealmHttpClient,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "runRole" }>,
  dictionary: TuiDictionary,
): Promise<string> {
  if (!(state.world && state.room)) {
    return dictionary.cannotSendWithoutContext;
  }
  const role = state.roles.find((candidate) => candidate.id === command.roleId);
  if (!role) {
    return dictionary.unknownRole(command.roleId);
  }
  const response = await client.runRoleTurn(state.room.id, {
    prompt: command.prompt,
    roleId: role.id,
    worldId: state.world.id,
  });
  return dictionary.roleTurnCompleted(role.displayName, response.message.id);
}

/**
 * Phase-1 of the two-phase role turn: fire `startRoleTurn` (which returns the
 * server turn id without blocking on the whole LLM turn) so the interactive
 * session can immediately show a `running <role> · 0:00` line, tick elapsed, and
 * drive completion/failure/cancel from the polled event log. The returned
 * `turnId` is the cancel target for the FIRST Ctrl+C.
 *
 * `signal` lets the caller abort before the start request even lands (e.g. the
 * operator hit Ctrl+C between confirming and the request resolving). If the
 * turn already started by the time we observe the abort, we cancel it server
 * side so no orphan turn keeps running.
 */
export async function startRoleTurnFromTui(
  client: RealmHttpClient,
  state: TuiState,
  command: Extract<TuiCommand, { kind: "runRole" }>,
  dictionary: TuiDictionary,
  signal?: AbortSignal,
): Promise<StartRoleTurnResult> {
  if (!(state.world && state.room)) {
    return { kind: "error", notice: dictionary.cannotSendWithoutContext };
  }
  const role = state.roles.find((candidate) => candidate.id === command.roleId);
  if (!role) {
    return { kind: "error", notice: dictionary.unknownRole(command.roleId) };
  }
  if (signal?.aborted) {
    return { kind: "cancelled", notice: dictionary.roleTurnCancelled };
  }
  const response = await client.startRoleTurn(state.room.id, {
    prompt: command.prompt,
    roleId: role.id,
    worldId: state.world.id,
  });
  if (signal?.aborted) {
    // Aborted while the start request was in flight: cancel the now-live turn so
    // it does not keep running headless. Best-effort — surface the cancel notice
    // regardless of whether the cancel call itself raced to completion.
    await client.cancelTurn(response.turnId).catch(() => undefined);
    return { kind: "cancelled", notice: dictionary.roleTurnCancelled, turnId: response.turnId };
  }
  return {
    kind: "started",
    notice: dictionary.turnStarted(role.displayName),
    roleId: role.id,
    roleLabel: role.displayName,
    turnId: response.turnId,
  };
}

export type StartRoleTurnResult =
  | { kind: "error"; notice: string }
  | { kind: "cancelled"; notice: string; turnId?: string }
  | { kind: "started"; notice: string; turnId: string; roleId: string; roleLabel: string };

/** Cancels an in-flight role turn by id. Best-effort; resolves to the notice. */
export async function cancelRoleTurnFromTui(
  client: RealmHttpClient,
  turnId: string,
  dictionary: TuiDictionary,
): Promise<string> {
  await client.cancelTurn(turnId).catch(() => undefined);
  return dictionary.roleTurnCancelled;
}
