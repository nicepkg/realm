import { GitFork, Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/index.tsx";

/** Simulation status shape, derived from the SDK call so apps/web needs no zod. */
type SimulationStatus = Awaited<
  ReturnType<RealmAppController["client"]["simulation"]["getStatus"]>
>;

/**
 * First real web consumer of `RealmSimulationClient`: status row plus
 * run-ticks / pause / resume / fork / export controls. Previously the
 * simulation layer had zero UI consumers (only test fixtures).
 */
export function WorldSimulationTab({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const worldId = app.selectedWorld?.id;
  const [status, setStatus] = useState<SimulationStatus | undefined>();
  const [ticks, setTicks] = useState(1);
  const [forkLabel, setForkLabel] = useState("");
  const [exportedCount, setExportedCount] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refreshStatus = useCallback(async () => {
    if (!worldId) {
      return;
    }
    setStatus(await app.client.simulation.getStatus(worldId));
  }, [app.client, worldId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function runAction(action: () => Promise<unknown>) {
    if (!worldId) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await refreshStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="world-simulation-tab">
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Metric
          label={t("inspector.simStatus")}
          value={
            status?.paused
              ? t("inspector.simPaused")
              : status && status.activeRuns.length > 0
                ? t("inspector.simRunning")
                : t("inspector.simIdle")
          }
        />
        <Metric label={t("inspector.simTick")} value={String(status?.tick ?? 0)} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1" htmlFor="sim-ticks-count">
          <span className="text-[11px] text-[var(--realm-fg-muted)]">
            {t("inspector.simTicksCount")}
          </span>
          <Input
            className="w-24"
            data-testid="sim-ticks-count"
            id="sim-ticks-count"
            max={100}
            min={1}
            onChange={(event) =>
              setTicks(Math.max(1, Math.min(100, Number(event.currentTarget.value) || 1)))
            }
            type="number"
            value={ticks}
          />
        </label>
        <Button
          data-testid="sim-run-ticks"
          disabled={busy}
          onClick={() =>
            void runAction(() => app.client.simulation.runTicks(worldId ?? "", { ticks }))
          }
          size="sm"
          type="button"
        >
          <Play className="size-4" />
          {t("inspector.simRunTicks")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="sim-pause"
          disabled={busy}
          onClick={() => void runAction(() => app.client.simulation.pause(worldId ?? "", {}))}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Pause className="size-4" />
          {t("inspector.simPause")}
        </Button>
        <Button
          data-testid="sim-resume"
          disabled={busy}
          onClick={() => void runAction(() => app.client.simulation.resume(worldId ?? "", {}))}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Play className="size-4" />
          {t("inspector.simResume")}
        </Button>
        <Button
          data-testid="sim-export"
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              const result = await app.client.simulation.exportWorld(worldId ?? "");
              setExportedCount(result.events.length);
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          <Square className="size-4" />
          {t("inspector.simExport")}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 space-y-1" htmlFor="sim-fork-name">
          <span className="text-[11px] text-[var(--realm-fg-muted)]">
            {t("inspector.simForkName")}
          </span>
          <Input
            data-testid="sim-fork-name"
            id="sim-fork-name"
            onChange={(event) => setForkLabel(event.currentTarget.value)}
            value={forkLabel}
          />
        </label>
        <Button
          data-testid="sim-fork"
          disabled={busy || !forkLabel.trim()}
          onClick={() =>
            void runAction(() =>
              app.client.simulation.fork(worldId ?? "", { label: forkLabel.trim() }),
            )
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          <GitFork className="size-4" />
          {t("inspector.simFork")}
        </Button>
      </div>
      {exportedCount !== undefined ? (
        <div
          className="rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
          data-testid="sim-export-result"
        >
          {t("inspector.simExported")}: {exportedCount}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid="sim-error"
        >
          <div className="font-medium">{t("inspector.simFailed")}</div>
          <div>{error}</div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-[#f7f7f8] p-3">
      <div className="text-[11px] text-[var(--realm-fg-muted)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Badge className="border-transparent bg-white text-[#1f1f21]">{value}</Badge>
      </div>
    </div>
  );
}
