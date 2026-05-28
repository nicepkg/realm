import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary, TuiLocale } from "./i18n.ts";
import { renderMemoryInspection, renderWorldStateInspection } from "./state-inspection.ts";
import type { TuiState } from "./types.ts";

export function inspectWorldStateForTui(
  state: TuiState,
  locale: TuiLocale,
  path: string | undefined,
  dictionary: TuiDictionary,
): { notice: string; state: TuiState } {
  return {
    notice: dictionary.worldStateLoaded,
    state: {
      ...state,
      stateInspection: renderWorldStateInspection(state.worldState, locale, path),
    },
  };
}

export async function inspectRoleMemoryForTui(
  client: RealmHttpClient,
  state: TuiState,
  roleId: string,
  locale: TuiLocale,
  dictionary: TuiDictionary,
): Promise<{ notice: string; state: TuiState }> {
  try {
    if (!state.world) {
      return { notice: dictionary.noWorld, state };
    }
    const memory = await client.readRoleMemory(state.world.id, roleId);
    return {
      notice: dictionary.memoryLoaded(roleId),
      state: { ...state, memoryInspection: renderMemoryInspection(roleId, memory.content, locale) },
    };
  } catch (error) {
    const notice = error instanceof Error ? error.message : String(error);
    return {
      notice,
      state: { ...state, memoryInspection: `${dictionary.memory}: ${roleId}\n${notice}` },
    };
  }
}
