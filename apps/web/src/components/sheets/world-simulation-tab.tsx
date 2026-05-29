import { AlertTriangle, GitFork, Pause, Play, Square } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
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
import { type Locale, useI18n } from "@/i18n/index.tsx";

/** Simulation status shape, derived from the SDK call so apps/web needs no zod. */
type SimulationStatus = Awaited<
  ReturnType<RealmAppController["client"]["simulation"]["getStatus"]>
>;

/**
 * Consequence copy lives here, not in the shared i18n dicts: those dicts are
 * owned by the realm-i18n-leaks item, and the existing risk/confirm keys
 * (`sheet.god.*`, `sheet.config.*`) describe rollback-able patches, which is the
 * opposite of an irreversible tick advance. To keep new literals out of the
 * dicts while still rendering proper zh-CN/en, these are file-local, keyed by
 * the active locale. They follow the brief's required phrasing.
 */
export const consequenceCopy: Record<
  Locale,
  {
    runTitle: string;
    runBody: (world: string, ticks: number) => string;
    forkTitle: string;
    forkBody: (label: string) => string;
    irreversible: string;
    runNotice: (clock: number, events: number) => string;
    forkNotice: (label: string) => string;
  }
> = {
  "zh-CN": {
    runTitle: "推进世界？",
    runBody: (world, ticks) => `推进世界 ${world} ${ticks} 个回合将写入世界状态，无法自动撤销。`,
    forkTitle: "创建世界分支？",
    forkBody: (label) => `Fork 将创建世界分支 ${label}，并写入磁盘。`,
    irreversible: "运行时无法自动撤销推进的回合，请确认后再继续。",
    runNotice: (clock, events) => `已推进至时钟 ${clock}，写入 ${events} 个事件。`,
    forkNotice: (label) => `已创建分支 ${label}。`,
  },
  en: {
    runTitle: "Advance world?",
    runBody: (world, ticks) =>
      `Advancing world ${world} by ${ticks} ticks writes world state and cannot be automatically undone.`,
    forkTitle: "Create world fork?",
    forkBody: (label) => `Fork will create the world branch ${label} and write it to disk.`,
    irreversible:
      "The runtime cannot automatically revert advanced ticks. Confirm before you continue.",
    runNotice: (clock, events) => `Advanced to tick ${clock}, wrote ${events} events.`,
    forkNotice: (label) => `Created fork ${label}.`,
  },
};

type PendingConfirm = { kind: "run"; ticks: number } | { kind: "fork"; label: string } | undefined;

type Outcome =
  | { kind: "run"; clock: number; events: number }
  | { kind: "fork"; label: string }
  | { kind: "export"; events: number }
  | undefined;

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
      // Re-read the clock from status after the run for an accurate delta.
      void runAction(async () => {
        const result = await app.client.simulation.runTicks(worldId ?? "", { ticks: job.ticks });
        const refreshed = await app.client.simulation.getStatus(worldId ?? "");
        return { kind: "run", clock: refreshed.tick, events: result.eventCount };
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
        <Button
          data-testid="sim-pause"
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              await app.client.simulation.pause(worldId ?? "", {});
              return undefined;
            })
          }
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
          onClick={() =>
            void runAction(async () => {
              await app.client.simulation.resume(worldId ?? "", {});
              return undefined;
            })
          }
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
      {outcome ? (
        <div
          className="rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
          data-testid="sim-outcome"
        >
          {outcomeText(outcome, copy, t)}
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

export function outcomeText(
  outcome: NonNullable<Outcome>,
  copy: (typeof consequenceCopy)[Locale],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (outcome.kind === "run") {
    return copy.runNotice(outcome.clock, outcome.events);
  }
  if (outcome.kind === "fork") {
    return copy.forkNotice(outcome.label);
  }
  return `${t("inspector.simExported")}: ${outcome.events}`;
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
  copy: (typeof consequenceCopy)[Locale];
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
