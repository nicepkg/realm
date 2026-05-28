import type { ConfigPatchProposal } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { typedConfirmationMatches } from "./config-patch-preview.ts";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiConfigPatchApplyResult } from "./types.ts";

export async function applyPendingConfigPatchFromTui(
  client: RealmHttpClient,
  patch: ConfigPatchProposal | undefined,
  confirmation: string | undefined,
  dictionary: TuiDictionary,
): Promise<{ result?: TuiConfigPatchApplyResult; notice: string }> {
  if (!patch) {
    return { notice: dictionary.noConfigPatch };
  }
  if (!typedConfirmationMatches(patch, confirmation)) {
    return { notice: dictionary.patchApplyNeedsConfirmation(patch.typedConfirmation ?? "") };
  }
  const result = await client.applyConfigPatch(patch.id, confirmation ? { confirmation } : {});
  return { notice: dictionary.patchApplied(result.historyId), result };
}
