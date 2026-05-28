import type { RealmHttpClient } from "@realm/client-sdk";
import { deleteDraft, listDrafts, loadDraft, updateDraftContent } from "./draft-store.ts";
import type { TuiDictionary } from "./i18n.ts";

export async function renderDraftList(
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  const drafts = await listDrafts(draftsDir);
  if (drafts.length === 0) {
    return dictionary.draftListEmpty;
  }
  return [
    dictionary.draftListTitle,
    ...drafts
      .slice(0, 8)
      .map(({ filePath, record }) =>
        [
          record.id,
          `${record.worldName}/${record.roomName}`,
          `as:${record.identity}`,
          record.content.replace(/\s+/g, " ").slice(0, 80),
          filePath,
          dictionary.draftListActions(record.id),
        ].join(" · "),
      ),
  ].join("\n");
}

export async function renderDraftDetails(
  id: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  const draft = await loadDraft(id, draftsDir);
  if (!draft) {
    return dictionary.draftRetryMissing(id);
  }
  const { filePath, record } = draft;
  return [
    dictionary.draftDetailsTitle(record.id),
    `${dictionary.world}: ${record.worldName} (${record.worldId})`,
    `${dictionary.room}: ${record.roomName} (${record.roomId})`,
    `${dictionary.identity}: ${record.identity}`,
    `${dictionary.draftCreatedAt}: ${record.createdAt}`,
    `${dictionary.draftError}: ${record.error}`,
    `${dictionary.draftPath}: ${filePath}`,
    `${dictionary.messages}:`,
    record.content,
    dictionary.draftListActions(record.id),
  ].join("\n");
}

export async function renderDraftCopyDetails(
  id: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  const draft = await loadDraft(id, draftsDir);
  if (!draft) {
    return dictionary.draftRetryMissing(id);
  }
  return [
    dictionary.draftCopyTitle(draft.record.id),
    JSON.stringify({ filePath: draft.filePath, ...draft.record }, null, 2),
  ].join("\n");
}

export async function editDraft(
  id: string,
  content: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  const draft = await updateDraftContent(id, content, draftsDir);
  if (!draft) {
    return dictionary.draftRetryMissing(id);
  }
  return dictionary.draftEditSaved(draft.record.id);
}

export async function retryDraft(
  client: RealmHttpClient,
  id: string,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  const draft = await loadDraft(id, draftsDir);
  if (!draft) {
    return dictionary.draftRetryMissing(id);
  }
  await client.sendMessage(draft.record.roomId, {
    worldId: draft.record.worldId,
    displayedAuthorId: draft.record.identity,
    content: draft.record.content,
    idempotencyKey: `tui-draft-${draft.record.id}-${Date.now()}`,
  });
  await deleteDraft(draft.record.id, draftsDir);
  return dictionary.draftRetrySent(draft.record.id);
}
