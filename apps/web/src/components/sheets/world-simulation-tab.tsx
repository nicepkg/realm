import { AlertTriangle, GitFork, Loader2, Pause, Play, Square } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { formatElapsedSeconds } from "@/components/messenger/role-turn-action.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/index.tsx";
import {
  consequenceCopy,
  type Outcome,
  outcomeText,
  type PendingConfirm,
  type SimulationCopy,
} from "./world-simulation-copy.tsx";

// Re-exported so existing consumers/tests keep importing from this entry point.
export { consequenceCopy, outcomeText };

/** Simulation status shape, derived from the SDK call so apps/web needs no zod. */
type SimulationStatus = Awaited<
  ReturnType<RealmAppController["client"]["simulation"]["getStatus"]>
>;

/**
 * First real web consumer of `RealmSimulationClient`: status row plus
 * run-ticks / pause / resume / fork / export controls. Run Ticks and Fork
 * mutate persisted world truth, so they sit at secondary weight and route
 * through a focus-Cancel confirmation that names the target world and states
 * the irreversible consequence before any write happens.
 */
export function WorldSimulationTab({ app }: { app: RealmAppController }) {
  const { t, locale } = useI18n();
  const copy = consequenceCopy[locale];
  const worldId = app.selectedWorld?.id;
  const worldName = app.selectedWorld?.name ?? worldId ?? "-";
  const [status, setStatus] = useState<SimulationStatus | undefined>();
  const [ticks, setTicks] = useState(1);
  const [forkLabel, setForkLabel] = useState("");
  const [outcome, setOutcome] = useState<Outcome>();
  const [pending, setPending] = useState<PendingConfirm>();
  const [busy, setBusy] = useState(false);
  // FB2-1: status is unknown until the first fetch resolves; default to loading
  // so the metric row shows placeholders instead of asserting 空闲/tick 0.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  // EP-R2-7: a Run Ticks write is a single uninterruptible promise. Track when
  // it started so we can surface an elapsed timer while it is in flight.
  const [runningTicks, setRunningTicks] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());

  // FB2-2: both the initial load and any mutator failure set the same `error`
  // state, so a single orange error box + Retry recovers either case.
  const refreshStatus = useCallback(async () => {
    if (!worldId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setStatus(await app.client.simulation.getStatus(worldId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [app.client, worldId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Keep the run-in-flight elapsed timer ticking once per second while busy.
  useEffect(() => {
    if (!runningTicks) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runningTicks]);

  const runAction = useCallback(
    async (action: () => Promise<Outcome>) => {
      if (!worldId) {
        return;
      }
      setBusy(true);
      setError(undefined);
      try {
        const next = await action();
        if (next) {
          setOutcome(next);
        }
        await refreshStatus();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [refreshStatus, worldId],
  );

  // Every Run Ticks writes irreversible persisted world truth, including the
  // default single tick (the most reachable control), so ALL runs route through
  // the confirm gate that names the world and states the consequence. There is
  // no fast-path for ticks === 1.
  function requestRunTicks() {
    setPending({ kind: "run", ticks });
  }

  function confirmPending() {
    const job = pending;
    setPending(undefined);
    if (!job) {
      return;
    }
    if (job.kind === "run") {
      // Re-read the clock from status after the run for an accurate delta. The
      // run-in-flight flags drive the uninterruptible notice + elapsed timer.
      setRunStartedAt(new Date().toISOString());
      setNow(Date.now());
      setRunningTicks(true);
      void runAction(async () => {
        try {
          const result = await app.client.simulation.runTicks(worldId ?? "", { ticks: job.ticks });
          const refreshed = await app.client.simulation.getStatus(worldId ?? "");
          return { kind: "run", clock: refreshed.tick, events: result.eventCount };
        } finally {
          setRunningTicks(false);
        }
      });
      return;
    }
    void runAction(async () => {
      const result = await app.client.simulation.fork(worldId ?? "", { label: job.label });
      return { kind: "fork", label: result.label };
    });
  }

  function onTicksKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // A bare Enter in the number field must never advance the world.
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  // FB2-1: idle/running/paused are only meaningful once status is defined; until
  // then the status metric shows a loading placeholder rather than a false 空闲.
  const isPaused = status?.paused === true;
  const isRunning = Boolean(status && status.activeRuns.length > 0);
  const statusValue = status
    ? isPaused
      ? t("inspector.simPaused")
      : isRunning
        ? t("inspector.simRunning")
        : t("inspector.simIdle")
    : undefined;
  const elapsed = useMemo(() => formatElapsedSeconds(runStartedAt, now), [runStartedAt, now]);

  return (
    <div className="space-y-4" data-testid="world-simulation-tab">
      {/* CL-5: altitude 1 — calm, read-only status. No mutating control lives
          here, so the default view reads as "what is the world doing now". */}
      <section aria-label={copy.groupStatus} className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Metric
            label={t("inspector.simStatus")}
            loading={loading}
            loadingLabel={copy.loading}
            value={statusValue}
          />
          <Metric
            label={t("inspector.simTick")}
            loading={loading}
            loadingLabel={copy.loading}
            value={status ? String(status.tick) : undefined}
          />
        </div>
        {/* EP-R2-7: a Run Ticks write is one uninterruptible promise, so instead
            of a silently-disabled UI we state it cannot be cancelled and show a
            live elapsed timer + the current tick readout. */}
        {runningTicks ? (
          <div
            className="flex flex-col gap-1 rounded-md bg-[#f7f7f8] p-2 text-[12px] text-[#1f1f21]"
            data-testid="sim-run-in-flight"
          >
            <div className="flex items-center gap-2">
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin text-[#07c160] motion-reduce:animate-none"
              />
              <span>{copy.runUninterruptible}</span>
            </div>
            <div className="text-[var(--realm-fg-muted)]" data-testid="sim-run-elapsed">
              {copy.runElapsed(elapsed)}
              {status ? ` · ${copy.runTickReadout(status.tick)}` : ""}
            </div>
          </div>
        ) : null}
        {outcome ? (
          <div
            className="rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
            data-testid="sim-outcome"
          >
            {outcomeText(outcome, copy, t)}
          </div>
        ) : null}
      </section>

      {/* CL-5: altitude 2 — mutating controls grouped at secondary weight under
          a clearly-labelled "Advance / branch" heading. */}
      <section aria-label={copy.groupAdvance} className="space-y-3">
        <div className="font-medium text-[11px] text-[var(--realm-fg-muted)] uppercase tracking-wide">
          {copy.groupAdvance}
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
              onKeyDown={onTicksKeyDown}
              type="number"
              value={ticks}
            />
          </label>
          <Button
            data-testid="sim-run-ticks"
            disabled={busy}
            onClick={requestRunTicks}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Play className="size-4" />
            {t("inspector.simRunTicks")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* CL-5 transport mapping: only the contextually-valid control shows —
              Pause while running, Resume while paused — instead of both. */}
          {isPaused ? (
            <Button
              data-testid="sim-resume"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await app.client.simulation.resume(worldId ?? "", {});
                  return { kind: "resume" };
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              <Play className="size-4" />
              {t("inspector.simResume")}
            </Button>
          ) : (
            <Button
              data-testid="sim-pause"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await app.client.simulation.pause(worldId ?? "", {});
                  return { kind: "pause" };
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              <Pause className="size-4" />
              {t("inspector.simPause")}
            </Button>
          )}
          <Button
            data-testid="sim-export"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                const result = await app.client.simulation.exportWorld(worldId ?? "");
                return { kind: "export", events: result.events.length };
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
            onClick={() => setPending({ kind: "fork", label: forkLabel.trim() })}
            size="sm"
            type="button"
            variant="secondary"
          >
            <GitFork className="size-4" />
            {t("inspector.simFork")}
          </Button>
        </div>
      </section>
      {error ? (
        // FB2-2: one recovery surface for both initial-load and mutator failures.
        // Retry simply re-runs refreshStatus.
        <div
          className="space-y-2 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid="sim-error"
        >
          <div className="font-medium">{t("inspector.simFailed")}</div>
          <div>{error}</div>
          <Button
            data-testid="sim-retry"
            disabled={busy || loading}
            onClick={() => void refreshStatus()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
      <SimulationConfirmDialog
        copy={copy}
        onCancel={() => setPending(undefined)}
        onConfirm={confirmPending}
        pending={pending}
        worldName={worldName}
      />
    </div>
  );
}

/**
 * Confirmation for the two irreversible mutators. Cancel is auto-focused and is
 * the Enter/Escape target, so a stray Enter dismisses rather than commits the
 * write (Don Norman error-prevention). The body names the target world and
 * states the consequence; an explicit irreversible line is always shown.
 */
function SimulationConfirmDialog({
  copy,
  onCancel,
  onConfirm,
  pending,
  worldName,
}: {
  copy: SimulationCopy;
  onCancel: () => void;
  onConfirm: () => void;
  pending: PendingConfirm;
  worldName: string;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isRun = pending?.kind === "run";
  const title = isRun ? copy.runTitle : copy.forkTitle;
  const body = pending
    ? pending.kind === "run"
      ? copy.runBody(worldName, pending.ticks)
      : copy.forkBody(pending.label)
    : "";

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onCancel())} open={Boolean(pending)}>
      <DialogContent
        data-testid="sim-confirm"
        onOpenAutoFocus={(event) => {
          // Move focus to Cancel instead of the first/Confirm button so Enter
          // cannot commit the irreversible write by reflex.
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <div
          className="flex items-start gap-2 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid="sim-confirm-irreversible"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{copy.irreversible}</span>
        </div>
        <DialogFooter>
          <Button
            data-testid="sim-confirm-cancel"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            data-testid="sim-confirm-accept"
            onClick={onConfirm}
            type="button"
            variant="secondary"
          >
            {isRun ? t("inspector.simRunTicks") : t("inspector.simFork")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * FB2-1: while `loading`, the metric renders an em-dash placeholder plus an
 * sr-only loading label, so screen readers announce the pending state and the
 * UI never asserts a false 空闲 / tick 0 before status resolves.
 */
function Metric({
  label,
  value,
  loading,
  loadingLabel,
}: {
  label: string;
  value: string | undefined;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const isLoading = Boolean(loading) || value === undefined;
  return (
    <div className="rounded-[6px] bg-[#f7f7f8] p-3">
      <div className="text-[11px] text-[var(--realm-fg-muted)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Badge className="border-transparent bg-white text-[#1f1f21]">
          {isLoading ? "—" : value}
        </Badge>
        {isLoading && loadingLabel ? (
          <span aria-live="polite" className="sr-only" role="status">
            {loadingLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
