import type { RealmHttpClient } from "@realm/client-sdk";
import { deleteDraft, listDrafts, loadDraft } from "./draft-store.ts";
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
        ].join(" · "),
      ),
  ].join("\n");
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
