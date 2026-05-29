import type { TuiDictionary } from "./i18n.ts";

/**
 * A staged change to the default provider/model. `:model` writes user settings
 * that every future role turn reads from, so the TUI echoes the before/after
 * pair and requires an explicit confirm before calling `updateDefaultModel`,
 * mirroring the Web gate. The Web hard-gates the identical action.
 */
export type TuiPendingModelChange = {
  currentProvider: string;
  currentModel: string;
  nextProvider: string;
  nextModel: string;
};

export type ModelChangeDecision = "confirm" | "cancel" | "pending";

export function createModelChangeConfirmation(
  current: { provider: string; model: string },
  next: { provider: string; model: string },
): TuiPendingModelChange {
  return {
    currentProvider: current.provider,
    currentModel: current.model,
    nextProvider: next.provider,
    nextModel: next.model,
  };
}

/**
 * Confirm requires an explicit yes/y; only n/no/cancel aborts; anything else
 * stays pending. A model change has no natural id token to re-type, so it uses
 * the lighter yes/no gate (matching the brief's "at minimum echo before/after
 * and require explicit confirm") rather than the world-id pattern.
 */
export function decideModelChangeConfirmation(input: string): ModelChangeDecision {
  const lower = input.trim().toLowerCase();
  if (lower === "y" || lower === "yes" || lower === "confirm") {
    return "confirm";
  }
  if (lower === "n" || lower === "no" || lower === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatModelChangeConfirmation(
  pending: TuiPendingModelChange,
  dict: TuiDictionary,
): string {
  return [
    dict.modelChangePrompt(
      `${pending.currentProvider}/${pending.currentModel}`,
      `${pending.nextProvider}/${pending.nextModel}`,
    ),
    dict.confirmYesNo,
  ].join(" ");
}
