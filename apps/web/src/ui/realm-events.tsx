import { GitBranch, ListRestart, RotateCw, Sparkles } from "lucide-react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

export function WorldEventPanel({
  conditionPath,
  description,
  disabled,
  onConditionPathChange,
  onDescriptionChange,
  onPathChange,
  onRandom,
  onReplay,
  onTick,
  onTitleChange,
  onTriggerCondition,
  onTriggerManual,
  onValueChange,
  path,
  result,
  title,
  value,
}: {
  disabled: boolean;
  title: string;
  description: string;
  path: string;
  value: string;
  conditionPath: string;
  result?: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onConditionPathChange: (value: string) => void;
  onTriggerManual: () => void;
  onRandom: () => void;
  onTick: () => void;
  onTriggerCondition: () => void;
  onReplay: () => void;
}) {
  return (
    <section data-testid="world-event-panel">
      <PanelTitle icon={<Sparkles size={16} aria-hidden="true" />} title="World Events" />
      <div className="mt-3 space-y-2 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-500">
            Title
            <input
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              data-testid="world-event-title"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Patch Path
            <input
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={path}
              onChange={(event) => onPathChange(event.target.value)}
              data-testid="world-event-path"
            />
          </label>
        </div>
        <label className="block text-xs text-zinc-500">
          Description
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            data-testid="world-event-description"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-500">
            Value
            <input
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              data-testid="world-event-value"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Condition Path
            <input
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={conditionPath}
              onChange={(event) => onConditionPathChange(event.target.value)}
              data-testid="world-event-condition-path"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onTriggerManual}
            disabled={disabled || !title.trim() || !path.trim()}
            data-testid="world-event-manual"
          >
            <Sparkles size={14} aria-hidden="true" />
            Manual
          </Button>
          <Button size="sm" variant="secondary" onClick={onRandom} disabled={disabled}>
            <RotateCw size={14} aria-hidden="true" />
            Random
          </Button>
          <Button size="sm" variant="secondary" onClick={onTick} disabled={disabled}>
            <GitBranch size={14} aria-hidden="true" />
            Tick
          </Button>
          <Button size="sm" variant="secondary" onClick={onReplay} disabled={disabled}>
            <ListRestart size={14} aria-hidden="true" />
            Replay
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onTriggerCondition}
          disabled={disabled || !conditionPath.trim() || !path.trim()}
          data-testid="world-event-condition"
        >
          Trigger If Condition Matches
        </Button>
        {result ? (
          <p className="text-xs text-zinc-500" data-testid="world-event-result">
            {result}
          </p>
        ) : null}
      </div>
    </section>
  );
}
