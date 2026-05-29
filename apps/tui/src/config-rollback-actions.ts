import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";

/**
 * Rolls the project config back to a prior history entry and formats the notice
 * the operator sees. Mirrors the Web ConfigRollbackNotice: it surfaces the
 * restored paths so the operator can see exactly what changed. `historyId` is
 * optional at the command layer; when omitted we fall back to the last applied
 * patch's history id (tracked by the app) so the operator never has to copy it
 * by hand.
 */
export async function rollbackConfigFromTui(
  client: RealmHttpClient,
  historyId: string | undefined,
  dictionary: TuiDictionary,
): Promise<string> {
  if (!historyId) {
    return dictionary.rollbackNeedsHistoryId;
  }
  const result = await client.rollbackConfig(historyId);
  const paths = result.restoredPaths.length ? result.restoredPaths.join(", ") : dictionary.noValue;
  return dictionary.configRolledBack(result.historyId, paths);
}
