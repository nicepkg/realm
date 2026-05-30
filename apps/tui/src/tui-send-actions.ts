import type { RealmHttpClient } from "@realm/client-sdk";
import type { SavedTuiDraft } from "./draft-store.ts";
import { saveFailedDraft } from "./draft-store.ts";
import { errorMessage } from "./error-message.ts";
import type { TuiDictionary } from "./i18n.ts";
import {
  createRoleSendConfirmation,
  formatRoleSendConfirmation,
} from "./role-send-confirmation.ts";
import type { TuiPendingRoleSend, TuiState } from "./types.ts";

export async function sendFromState(
  client: RealmHttpClient,
  state: TuiState,
  content: string,
  dictionary: TuiDictionary,
): Promise<void> {
  if (!state.world || !state.room) {
    throw new Error(dictionary.cannotSendWithoutContext);
  }
  await client.sendMessage(state.room.id, {
    worldId: state.world.id,
    displayedAuthorId: state.identity,
    content,
    idempotencyKey: `tui-message-${Date.now()}`,
  });
}

export async function sendWithDraftOnFailure(
  client: RealmHttpClient,
  state: TuiState,
  content: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<void> {
  try {
    await sendFromState(client, state, content, dictionary);
  } catch (error) {
    const reason = errorMessage(error);
    const draft = await saveStateDraft(state, content, reason, draftsDir);
    if (draft) {
      throw new Error(
        withReadOnlyHint(
          dictionary.draftSaved(draft.record.id, draft.filePath),
          reason,
          dictionary,
        ),
      );
    }
    throw new Error(withReadOnlyHint(reason, reason, dictionary));
  }
}

/**
 * Marker carried by the policy gate's read-only denial reason
 * ("Project is trusted for read-only inspection only"). Matched case-insensitively
 * so a send/role-turn blocked under `requireTrust:true` can be turned into an
 * actionable elevation hint instead of a dead-ending raw English gate error.
 */
const READ_ONLY_GATE_MARKER = "read-only inspection only";

/** True when an error message is the policy gate's read-only denial. */
export function isReadOnlyGateError(message: string): boolean {
  return message.toLowerCase().includes(READ_ONLY_GATE_MARKER);
}

/**
 * Appends the localized trust-elevation hint when the failure reason is the
 * read-only gate. Keeps the original notice (e.g. draft-saved) intact so the
 * operator both keeps their text and learns how to unblock writes.
 */
export function withReadOnlyHint(
  notice: string,
  reason: string,
  dictionary: TuiDictionary,
): string {
  if (!isReadOnlyGateError(reason)) {
    return notice;
  }
  return `${notice} ${dictionary.trustReadOnlyHint}`;
}

export async function sendOneShotWithDraft(
  client: RealmHttpClient,
  state: TuiState,
  content: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<void> {
  const pending = createRoleSendConfirmation(state, content);
  if (pending && "blocked" in pending) {
    // Non-member identity: refuse with a named reason; do not stage a draft for a
    // send the membership precondition would never let confirm.
    throw new Error(dictionary.roleNotInRoom(pending.roleLabel, pending.roomName));
  }
  if (pending) {
    const draft = await savePendingRoleDraft(
      pending,
      dictionary.draftRoleTakeoverCannotConfirm,
      draftsDir,
    );
    throw new Error(
      `${formatRoleSendConfirmation(pending, dictionary)} ${dictionary.draftSaved(draft.record.id, draft.filePath)}`,
    );
  }
  await sendWithDraftOnFailure(client, state, content, draftsDir, dictionary);
}

export async function confirmPendingRoleSend(
  client: RealmHttpClient,
  pending: TuiPendingRoleSend,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<void> {
  try {
    await client.sendMessage(pending.roomId, {
      worldId: pending.worldId,
      displayedAuthorId: pending.identity,
      content: pending.content,
      idempotencyKey: `tui-message-${Date.now()}`,
    });
  } catch (error) {
    const reason = errorMessage(error);
    const draft = await savePendingRoleDraft(pending, reason, draftsDir);
    throw new Error(
      withReadOnlyHint(dictionary.draftSaved(draft.record.id, draft.filePath), reason, dictionary),
    );
  }
}

export function savePendingRoleDraft(
  pending: TuiPendingRoleSend,
  error: string,
  draftsDir: string | undefined,
): Promise<SavedTuiDraft> {
  return saveFailedDraft(
    {
      content: pending.content,
      error,
      identity: pending.identity,
      roomId: pending.roomId,
      roomName: pending.roomName,
      worldId: pending.worldId,
      worldName: pending.worldName,
    },
    draftsDir,
  );
}

async function saveStateDraft(
  state: TuiState,
  content: string,
  error: string,
  draftsDir: string | undefined,
): Promise<SavedTuiDraft | undefined> {
  if (!state.world || !state.room) {
    return undefined;
  }
  return saveFailedDraft(
    {
      content,
      error,
      identity: state.identity,
      roomId: state.room.id,
      roomName: state.room.name,
      worldId: state.world.id,
      worldName: state.world.name,
    },
    draftsDir,
  );
}
