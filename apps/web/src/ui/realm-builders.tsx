import type { ConfigPatchProposal } from "@realm/api-contract";
import { Globe2, MessageSquareText, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

export type WorldBuilderMode = "debate" | "workflow" | "game" | "simulation" | "sandbox";

export function BuilderPanel({
  assistantGoal,
  onApplyProposal,
  onAssistantGoalChange,
  onProposeAssistant,
  onProposeRole,
  onProposeWorld,
  onRoleNameChange,
  onWorldModeChange,
  onWorldNameChange,
  onWorldRolesChange,
  proposal,
  roleName,
  worldMode,
  worldName,
  worldRoles,
}: {
  assistantGoal: string;
  roleName: string;
  worldName: string;
  worldMode: WorldBuilderMode;
  worldRoles: string;
  proposal?: ConfigPatchProposal;
  onAssistantGoalChange: (value: string) => void;
  onRoleNameChange: (value: string) => void;
  onWorldNameChange: (value: string) => void;
  onWorldModeChange: (value: WorldBuilderMode) => void;
  onWorldRolesChange: (value: string) => void;
  onProposeRole: () => void;
  onProposeWorld: () => void;
  onProposeAssistant: () => void;
  onApplyProposal: () => void;
}) {
  return (
    <section>
      <PanelTitle icon={<Sparkles size={16} aria-hidden="true" />} title="Create & Configure" />
      <div className="mt-3 space-y-3">
        <RoleBuilderCard
          roleName={roleName}
          onRoleNameChange={onRoleNameChange}
          onProposeRole={onProposeRole}
        />
        <WorldBuilderCard
          mode={worldMode}
          name={worldName}
          roles={worldRoles}
          onModeChange={onWorldModeChange}
          onNameChange={onWorldNameChange}
          onRolesChange={onWorldRolesChange}
          onPreview={onProposeWorld}
        />
        <AssistantBuilderCard
          assistantGoal={assistantGoal}
          onAssistantGoalChange={onAssistantGoalChange}
          onProposeAssistant={onProposeAssistant}
        />
        {proposal ? <ProposalPanel proposal={proposal} onApply={onApplyProposal} /> : null}
      </div>
    </section>
  );
}

function RoleBuilderCard({
  onProposeRole,
  onRoleNameChange,
  roleName,
}: {
  roleName: string;
  onRoleNameChange: (value: string) => void;
  onProposeRole: () => void;
}) {
  return (
    <div className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center gap-2 font-medium text-sm">
        <Plus size={15} aria-hidden="true" />
        Role Builder
      </div>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
          value={roleName}
          onChange={(event) => onRoleNameChange(event.target.value)}
          aria-label="Role name"
          data-testid="builder-role-name"
        />
        <Button size="sm" variant="secondary" onClick={onProposeRole}>
          Preview
        </Button>
      </div>
    </div>
  );
}

function WorldBuilderCard({
  mode,
  name,
  onModeChange,
  onNameChange,
  onPreview,
  onRolesChange,
  roles,
}: {
  name: string;
  mode: WorldBuilderMode;
  roles: string;
  onNameChange: (value: string) => void;
  onModeChange: (value: WorldBuilderMode) => void;
  onRolesChange: (value: string) => void;
  onPreview: () => void;
}) {
  return (
    <div className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center gap-2 font-medium text-sm">
        <Globe2 size={15} aria-hidden="true" />
        World Builder
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="min-w-0 rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="World name"
          data-testid="builder-world-name"
        />
        <select
          className="rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as WorldBuilderMode)}
          aria-label="World mode"
          data-testid="builder-world-mode"
        >
          <option value="debate">Debate</option>
          <option value="workflow">Workflow</option>
          <option value="game">Game</option>
          <option value="simulation">Simulation</option>
          <option value="sandbox">Sandbox</option>
        </select>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
          value={roles}
          onChange={(event) => onRolesChange(event.target.value)}
          aria-label="World roles"
          data-testid="builder-world-roles"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={onPreview}
          data-testid="builder-world-preview"
        >
          Preview
        </Button>
      </div>
    </div>
  );
}

function AssistantBuilderCard({
  assistantGoal,
  onAssistantGoalChange,
  onProposeAssistant,
}: {
  assistantGoal: string;
  onAssistantGoalChange: (value: string) => void;
  onProposeAssistant: () => void;
}) {
  return (
    <div className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center gap-2 font-medium text-sm">
        <MessageSquareText size={15} aria-hidden="true" />
        Assistant
      </div>
      <textarea
        className="min-h-20 w-full resize-none rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
        value={assistantGoal}
        onChange={(event) => onAssistantGoalChange(event.target.value)}
        aria-label="Assistant goal"
      />
      <Button size="sm" variant="secondary" onClick={onProposeAssistant} className="mt-2">
        Preview
      </Button>
    </div>
  );
}

function ProposalPanel({
  onApply,
  proposal,
}: {
  onApply: () => void;
  proposal: ConfigPatchProposal;
}) {
  return (
    <section
      className="rounded-md border border-realm-primary/30 bg-realm-primary/10 p-3"
      data-testid="config-proposal"
    >
      <div className="mb-1 flex items-center gap-2 font-medium text-sm">
        <RotateCcw size={16} aria-hidden="true" />
        {proposal.title}
      </div>
      <p className="mb-3 text-sm text-zinc-700">{proposal.summary}</p>
      <div className="mb-3 space-y-1 text-xs text-zinc-600">
        {proposal.operations.map((operation) => (
          <div key={operation.path} className="truncate">
            {operation.action}: {operation.path}
          </div>
        ))}
      </div>
      <Button size="sm" variant="primary" onClick={onApply} data-testid="apply-config-proposal">
        Apply
      </Button>
    </section>
  );
}
