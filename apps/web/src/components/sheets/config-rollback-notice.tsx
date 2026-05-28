import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import type { AppliedConfigPatch } from "./config-action-types.ts";

export function ConfigRollbackNotice({
  patch,
  onDismiss,
  onRollback,
}: {
  patch?: AppliedConfigPatch;
  onDismiss: () => void;
  onRollback: (historyId: string) => Promise<{ historyId: string; restoredPaths: string[] }>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [restoredPaths, setRestoredPaths] = useState<string[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!patch) {
    return null;
  }

  const activePatch = patch;

  async function rollback() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await onRollback(activePatch.historyId);
      setRestoredPaths(result.restoredPaths);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sr-only" data-testid="config-rollback-notice">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e6f7ee] text-[var(--realm-green-text)]">
          <RotateCcw className="size-4" />
        </span>
        <div className="sr-only">
          <div>
            {t("sheet.config.lastApplied")}: {activePatch.title}
          </div>
          <div title={activePatch.changedPaths.join(", ")}>
            {t("sheet.config.changedPaths")}: {activePatch.changedPaths.join(", ")}
          </div>
        </div>
        <Button
          className="h-8 rounded-full bg-white px-2.5 text-[13px] text-[var(--realm-green-text)] shadow-none hover:bg-[#f4fbf7]"
          disabled={busy || Boolean(restoredPaths)}
          onClick={() => void rollback()}
          type="button"
          variant="ghost"
        >
          {t("sheet.config.rollback")}
        </Button>
        <Button
          aria-label={t("sheet.config.dismiss")}
          className="size-8 rounded-full"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      {error ? (
        <div className="mt-2 max-w-[260px] rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]">
          {error}
        </div>
      ) : null}
      {restoredPaths ? (
        <div
          className="mt-2 max-w-[260px] rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
          data-testid="config-rollback-notice-result"
        >
          {t("sheet.config.rollbackDone")}: {restoredPaths.join(", ")}
        </div>
      ) : null}
      <span className="sr-only">{t("sheet.config.rollbackHelp")}</span>
    </aside>
  );
}
