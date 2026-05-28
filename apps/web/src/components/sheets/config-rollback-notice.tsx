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
    <aside
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] left-4 z-40 rounded-full bg-white/95 px-2.5 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.12)] md:left-auto md:w-[min(360px,calc(100vw-32px))] md:rounded-[8px] md:px-3 md:py-2"
      data-testid="config-rollback-notice"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e6f7ee] text-[var(--realm-green-text)] md:size-8">
          <RotateCcw className="size-3.5 md:size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[12px] text-[var(--realm-fg)] md:text-[13px]">
            {t("sheet.config.lastApplied")} · {activePatch.title}
          </div>
          <div
            className="hidden truncate text-[11px] text-[var(--realm-fg-muted)] md:block"
            title={activePatch.changedPaths.join(", ")}
          >
            {t("sheet.config.changedPaths")}: {activePatch.changedPaths.join(", ")}
          </div>
        </div>
        <Button
          className="h-7 rounded-full px-2 text-[12px] md:h-8 md:rounded-[5px] md:text-[13px]"
          disabled={busy || Boolean(restoredPaths)}
          onClick={() => void rollback()}
          type="button"
        >
          {t("sheet.config.rollback")}
        </Button>
        <Button
          aria-label={t("sheet.config.dismiss")}
          className="size-7 rounded-full md:size-8"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      {error ? (
        <div className="mt-2 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]">{error}</div>
      ) : null}
      {restoredPaths ? (
        <div
          className="mt-2 rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
          data-testid="config-rollback-notice-result"
        >
          {t("sheet.config.rollbackDone")}: {restoredPaths.join(", ")}
        </div>
      ) : null}
      <span className="sr-only">{t("sheet.config.rollbackHelp")}</span>
    </aside>
  );
}
