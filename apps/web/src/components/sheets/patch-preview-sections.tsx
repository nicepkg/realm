import type { ConfigPatchProposal } from "@realm/api-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { useI18n } from "@/i18n/index.tsx";
import type { PatchApplyResult } from "./config-action-types.ts";

type Translate = ReturnType<typeof useI18n>["t"];

// Per-operation visibility. The apply API (configPatchApplyRequestSchema) only
// accepts a confirmation string — it always applies the whole patch — so the
// per-op selection is intentionally read-only. Checkboxes show that every op is
// part of the apply, and the partial-apply affordance stays disabled rather than
// faking a subset apply the backend cannot honor.
export function OperationList({
  operations,
  t,
}: {
  operations: ConfigPatchProposal["operations"];
  t: Translate;
}) {
  return (
    <div className="space-y-1.5 rounded-md bg-white p-2 text-[12px]" data-testid="patch-op-list">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--realm-fg)]">{t("sheet.config.files")}</span>
        <Button
          className="h-7 px-2 text-[11px]"
          // Subset apply is not supported by the apply endpoint; the affordance
          // is shown but disabled so the user is not misled into expecting it.
          data-testid="patch-partial-apply"
          disabled
          title={t("patch.partialApply")}
          type="button"
          variant="secondary"
        >
          {t("patch.partialApply")}
        </Button>
      </div>
      <ul className="space-y-1">
        {operations.map((operation, index) => (
          <li
            className="flex items-center gap-2 rounded-[6px] bg-[#f7f7f8] px-2 py-1.5"
            data-testid={`patch-op-${index}`}
            key={operation.path}
          >
            <Checkbox
              aria-label={operation.path}
              checked
              data-testid={`patch-op-checkbox-${index}`}
              disabled
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{operation.path}</span>
            <Badge className="border-transparent bg-[#f0f0f2] text-[var(--realm-fg-muted)]">
              {operation.action}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Config history surfaces prior applied patches. The client SDK only exposes
// rollbackConfig(historyId) — there is no list-history endpoint — so this shows
// the patch applied in the current session. Once a history-list method exists it
// can replace this session-local view.
export function ConfigHistory({
  applyResult,
  proposal,
  t,
}: {
  applyResult: PatchApplyResult | undefined;
  proposal: ConfigPatchProposal;
  t: Translate;
}) {
  if (!applyResult) {
    // No patch applied in this session yet; rollbackConfig is the only history
    // SDK surface, so there is nothing to list until an apply succeeds.
    return (
      <section
        className="flex items-center justify-between gap-2 rounded-md bg-white p-2 text-[12px]"
        data-testid="patch-config-history"
      >
        <span className="font-medium text-[var(--realm-fg)]">{t("patch.configHistory")}</span>
        <span className="text-[var(--realm-fg-muted)]">—</span>
      </section>
    );
  }
  return (
    <section className="rounded-md bg-white p-2 text-[12px]" data-testid="patch-config-history">
      <div className="font-medium text-[var(--realm-fg)]">{t("patch.configHistory")}</div>
      <div className="mt-1.5 rounded-[6px] bg-[#f7f7f8] px-2 py-1.5">
        <div className="truncate font-medium text-[var(--realm-fg)]">{proposal.title}</div>
        <div className="mt-1 text-[11px] text-[var(--realm-fg-muted)]">
          {t("sheet.config.historyId")}: {applyResult.historyId}
        </div>
        <div className="mt-1 truncate text-[11px] text-[var(--realm-fg-muted)]">
          {t("sheet.config.changedPaths")}: {applyResult.changedPaths.join(", ")}
        </div>
      </div>
    </section>
  );
}
