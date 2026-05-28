import type { RealmHttpClient } from "@realm/client-sdk";
import type { SavedTuiDraft } from "./draft-store.ts";
import { saveFailedDraft } from "./draft-store.ts";
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
    const draft = await saveStateDraft(state, content, errorMessage(error), draftsDir);
    if (draft) {
      throw new Error(dictionary.draftSaved(draft.record.id, draft.filePath));
    }
    throw error;
  }
}

export async function sendOneShotWithDraft(
  client: RealmHttpClient,
  state: TuiState,
  content: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<void> {
  const pending = createRoleSendConfirmation(state, content);
  if (pending) {
    const draft = await savePendingRoleDraft(
      pending,
      dictionary.draftRoleTakeoverCannotConfirm,
      draftsDir,
    );
    throw new Error(
      `${formatRoleSendConfirmation(pending)} ${dictionary.draftSaved(draft.record.id, draft.filePath)}`,
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
    const draft = await savePendingRoleDraft(pending, errorMessage(error), draftsDir);
    throw new Error(dictionary.draftSaved(draft.record.id, draft.filePath));
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
