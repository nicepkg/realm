import type { ConfigPatchProposal } from "@realm/api-contract";
import { type TuiLocale, t } from "./i18n.ts";

export function renderConfigPatchPreview(
  patch: ConfigPatchProposal | undefined,
  locale: TuiLocale = "en",
): string {
  const dict = t(locale);
  if (!patch) {
    return dict.noConfigPatch;
  }
  const confirmation = patch.typedConfirmation
    ? dict.patchApplyHint(patch.typedConfirmation)
    : dict.patchApplyNoConfirm;
  return [
    `${dict.configPatch}: ${patch.title}`,
    `${dict.patchSummary}: ${patch.summary}`,
    `${dict.patchRisk}: ${patch.riskLevel}`,
    `${dict.patchCapabilities}: ${patch.requiredCapabilities.join(", ") || dict.noValue}`,
    `${dict.patchFiles}:`,
    ...patch.operations.map((operation) => `  ${operation.action.padEnd(6)} ${operation.path}`),
    patch.riskReasons.length > 0
      ? `${dict.patchReasons}: ${patch.riskReasons.join("; ")}`
      : undefined,
    confirmation,
  ]
    .filter(Boolean)
    .join("\n");
}

export function typedConfirmationMatches(
  patch: ConfigPatchProposal,
  confirmation: string | undefined,
): boolean {
  return !patch.typedConfirmation || confirmation === patch.typedConfirmation;
}
