import type { RealmHttpClient } from "@realm/client-sdk";
import {
  editDraft,
  renderDraftCopyDetails,
  renderDraftDetails,
  renderDraftList,
  retryDraft,
} from "./draft-actions.ts";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand } from "./types.ts";

export async function handleDraftCommand(
  command: TuiCommand,
  client: RealmHttpClient,
  draftsDir: string | undefined,
  dictionary: TuiDictionary,
): Promise<string | undefined> {
  if (command.kind === "drafts") {
    return renderDraftList(draftsDir, dictionary);
  }
  if (command.kind === "draftDetails") {
    return renderDraftDetails(command.draftId, draftsDir, dictionary);
  }
  if (command.kind === "editDraft") {
    return editDraft(command.draftId, command.content, draftsDir, dictionary);
  }
  if (command.kind === "copyDraft") {
    return renderDraftCopyDetails(command.draftId, draftsDir, dictionary);
  }
  if (command.kind === "retryDraft") {
    return retryDraft(client, command.draftId, draftsDir, dictionary);
  }
  return undefined;
}
