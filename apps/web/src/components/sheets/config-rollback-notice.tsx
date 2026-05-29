import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import type { AppliedConfigPatch } from "./config-action-types.ts";

/** Auto-dismiss delay for the calm rollback toast (ms). */
const AUTO_DISMISS_MS = 8000;

/**
 * Calm bottom-anchored toast shown after a config patch applies. Surfaces the
 * applied title, the changed paths, and a one-click Rollback affordance with
 * busy / done / error states. Auto-dismisses after ~8s of inactivity but never
 * while a rollback is in flight or already shows a result, so the user keeps
 * the recovery affordance and the restored-paths confirmation on screen.
 *
 * WeChat-flat aesthetic: white card, --realm-line hairline border, restrained
 * green accent (--realm-green-text), no heavy shadow-wall. Anchored full-width
 * at the bottom on mobile and as a right-side card on desktop, with breathing
 * room from the viewport edge so it never clips or covers the composer.
 */
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
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Reset transient rollback state whenever a new patch arrives. The effect body
  // only calls stable setters, so biome flags historyId as "unnecessary" — but it
  // is the intentional reset trigger (fire whenever the applied patch changes).
  const historyId = patch?.historyId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: historyId is the reset trigger, not a body dependency.
  useEffect(() => {
    setBusy(false);
    setRestoredPaths(undefined);
    setError(undefined);
  }, [historyId]);

  // Auto-dismiss after a quiet window, but hold the toast open while the user
  // is rolling back or inspecting the restored-paths result.
  const settled = !busy && !restoredPaths;
  useEffect(() => {
    if (!historyId || !settled) {
      return;
    }
    const timer = window.setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [historyId, settled]);

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
      aria-live="polite"
      className="realm-fade-rise fixed inset-x-3 bottom-3 z-40 mx-auto w-auto max-w-[420px] rounded-2xl border border-[var(--realm-line)] bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:mx-0 sm:w-[360px]"
      data-testid="config-rollback-notice"
      role="status"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--realm-green-soft)] text-[var(--realm-green-text)]">
          <RotateCcw className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[13px] text-foreground">
            {t("sheet.config.lastApplied")}: {activePatch.title}
          </div>
          <div
            className="mt-0.5 truncate text-[12px] text-muted-foreground"
            title={activePatch.changedPaths.join(", ")}
          >
            {t("sheet.config.changedPaths")}: {activePatch.changedPaths.join(", ")}
          </div>
        </div>
        <Button
          aria-label={t("sheet.config.dismiss")}
          className="-mt-0.5 -mr-0.5 size-7 shrink-0 rounded-full text-muted-foreground"
          data-testid="config-rollback-notice-dismiss"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-2.5 flex items-center justify-end">
        <Button
          className="h-8 rounded-full bg-[var(--realm-green-soft)] px-3 text-[13px] text-[var(--realm-green-text)] shadow-none hover:bg-[#d6f1e3]"
          data-testid="config-rollback-notice-action"
          disabled={busy || Boolean(restoredPaths)}
          onClick={() => void rollback()}
          type="button"
          variant="ghost"
        >
          {busy ? `${t("sheet.config.rollback")}…` : t("sheet.config.rollback")}
        </Button>
      </div>
      {error ? (
        <div
          className="mt-2 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid="config-rollback-notice-error"
        >
          {error}
        </div>
      ) : null}
      {restoredPaths ? (
        <div
          className="mt-2 rounded-md bg-[var(--realm-green-soft)] p-2 text-[#087a43] text-[12px]"
          data-testid="config-rollback-notice-result"
        >
          {t("sheet.config.rollbackDone")}: {restoredPaths.join(", ")}
        </div>
      ) : null}
      <span className="sr-only">{t("sheet.config.rollbackHelp")}</span>
    </aside>
  );
}
