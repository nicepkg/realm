import { Activity, Download, GitFork, Pause, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

type SimulationStatus = {
  paused: boolean;
  tick: number;
  activeRuns: string[];
};

export function WorldSimulationPanel({
  disabled,
  forkId,
  forkLabel,
  intervalMs,
  maxActivations,
  onExport,
  onFork,
  onForkIdChange,
  onForkLabelChange,
  onIntervalMsChange,
  onMaxActivationsChange,
  onPause,
  onRefresh,
  onResume,
  onRunTicks,
  onSeedChange,
  onStartBackground,
  onStopBackground,
  onTicksChange,
  result,
  runId,
  seed,
  status,
  ticks,
}: {
  disabled: boolean;
  ticks: string;
  maxActivations: string;
  intervalMs: string;
  seed: string;
  forkLabel: string;
  forkId: string;
  runId?: string;
  result?: string;
  status?: SimulationStatus;
  onTicksChange: (value: string) => void;
  onMaxActivationsChange: (value: string) => void;
  onIntervalMsChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  onForkLabelChange: (value: string) => void;
  onForkIdChange: (value: string) => void;
  onRefresh: () => void;
  onRunTicks: () => void;
  onPause: () => void;
  onResume: () => void;
  onExport: () => void;
  onFork: () => void;
  onStartBackground: () => void;
  onStopBackground: () => void;
}) {
  return (
    <section data-testid="world-simulation-panel">
      <PanelTitle icon={<Activity size={16} aria-hidden="true" />} title="Simulation" />
      <div className="mt-3 space-y-3 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="grid grid-cols-3 gap-2">
          <LabeledInput
            label="Ticks"
            value={ticks}
            onChange={onTicksChange}
            testId="simulation-ticks"
          />
          <LabeledInput
            label="@all cap"
            value={maxActivations}
            onChange={onMaxActivationsChange}
            testId="simulation-max-activations"
          />
          <LabeledInput
            label="Interval"
            value={intervalMs}
            onChange={onIntervalMsChange}
            testId="simulation-interval"
          />
        </div>
        <LabeledInput label="Seed" value={seed} onChange={onSeedChange} testId="simulation-seed" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onRunTicks}
            disabled={disabled}
            data-testid="simulation-run"
          >
            <Play size={14} aria-hidden="true" />
            Run Ticks
          </Button>
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={disabled}>
            <RefreshCw size={14} aria-hidden="true" />
            Status
          </Button>
          <Button size="sm" variant="secondary" onClick={onPause} disabled={disabled}>
            <Pause size={14} aria-hidden="true" />
            Pause
          </Button>
          <Button size="sm" variant="secondary" onClick={onResume} disabled={disabled}>
            <Play size={14} aria-hidden="true" />
            Resume
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={onExport} disabled={disabled}>
            <Download size={14} aria-hidden="true" />
            Export
          </Button>
          <Button size="sm" variant="secondary" onClick={onFork} disabled={disabled}>
            <GitFork size={14} aria-hidden="true" />
            Fork
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput
            label="Fork Label"
            value={forkLabel}
            onChange={onForkLabelChange}
            testId="simulation-fork-label"
          />
          <LabeledInput
            label="Resume Fork"
            value={forkId}
            onChange={onForkIdChange}
            testId="simulation-fork-id"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={onStartBackground} disabled={disabled}>
            <Activity size={14} aria-hidden="true" />
            Background
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onStopBackground}
            disabled={disabled || !runId}
          >
            <Square size={14} aria-hidden="true" />
            Stop
          </Button>
        </div>
        {status ? (
          <p className="text-xs text-zinc-500" data-testid="simulation-status">
            Tick {status.tick} · {status.paused ? "paused" : "running"} · {status.activeRuns.length}{" "}
            background run(s)
          </p>
        ) : null}
        {result ? (
          <p className="text-xs text-zinc-500" data-testid="simulation-result">
            {result}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  onChange,
  testId,
  value,
}: {
  label: string;
  value: string;
  testId: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      />
    </label>
  );
}
