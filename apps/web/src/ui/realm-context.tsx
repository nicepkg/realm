import type { RoleSummary, Room, StatePatchResult, WorldSummary } from "@realm/api-contract";
import { Activity, Bot, Braces, Gavel, MessageSquareText, Play, ShieldCheck } from "lucide-react";
import { Button } from "./button.tsx";
import { Avatar, MiniStat, PanelTitle } from "./realm-atoms.tsx";
import { describeTraceEvent, type TraceEvent } from "./realm-view-model.ts";

export function ContextPanelHeader({ room, world }: { room?: Room; world?: WorldSummary }) {
  return (
    <header className="border-realm-border border-b px-4 py-4">
      <div className="text-xs text-zinc-500">Context</div>
      <div className="mt-1 truncate font-semibold">{room?.name ?? "No room selected"}</div>
      <div className="mt-1 truncate text-xs text-zinc-500">
        {world?.name ?? "No world selected"}
      </div>
    </header>
  );
}

export function RoleRunPanel({
  error,
  onRoleChange,
  onCancel,
  onRun,
  roles,
  selectedRole,
  selectedRoleId,
  selectedRoom,
  status,
}: {
  error?: string;
  roles: RoleSummary[];
  selectedRole?: RoleSummary;
  selectedRoleId: string;
  selectedRoom?: Room;
  status: "idle" | "running" | "error";
  onRoleChange: (roleId: string) => void;
  onCancel: () => void;
  onRun: () => void;
}) {
  return (
    <section data-testid="role-run-panel">
      <PanelTitle icon={<Play size={16} aria-hidden="true" />} title="Role Runner" />
      <div className="mt-3 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="mb-3 flex items-center gap-3">
          <Avatar label={selectedRole?.displayName ?? "Role"} tone="role" />
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">
              {selectedRole?.displayName ?? "No role"}
            </div>
            <div className="truncate text-xs text-zinc-500">
              {selectedRole?.model ?? "default model"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            className="min-w-0 flex-1 rounded-md border border-realm-border bg-white px-2 py-1 text-sm"
            name="run-role"
            value={selectedRoleId}
            onChange={(event) => onRoleChange(event.target.value)}
            aria-label="Run role"
            data-testid="run-role-select"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.displayName}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="primary"
            onClick={onRun}
            disabled={!selectedRoom || !selectedRoleId || status === "running"}
            data-testid="run-role-turn"
          >
            <Bot size={14} aria-hidden="true" />
            {status === "running" ? "Running" : "Run"}
          </Button>
          {status === "running" ? (
            <Button size="sm" variant="secondary" onClick={onCancel} data-testid="cancel-turn">
              Cancel
            </Button>
          ) : null}
        </div>
        {status === "error" ? <p className="mt-2 text-realm-danger text-xs">{error}</p> : null}
      </div>
    </section>
  );
}

export function ContextSummary({
  eventsCount,
  rolesCount,
  stateVersion,
  world,
}: {
  eventsCount: number;
  rolesCount: number;
  stateVersion?: number;
  world?: WorldSummary;
}) {
  return (
    <section>
      <PanelTitle icon={<ShieldCheck size={16} aria-hidden="true" />} title="World Status" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="Mode" value={world?.mode.type ?? "none"} />
        <MiniStat label="Roles" value={String(rolesCount)} />
        <MiniStat label="Events" value={String(eventsCount)} />
        <MiniStat label="State" value={stateVersion === undefined ? "v0" : `v${stateVersion}`} />
      </div>
      <div className="mt-3 rounded-md bg-realm-primary/10 px-3 py-2 text-realm-primary text-xs">
        Shell, broad project file access, and network are disabled unless a world policy explicitly
        allows them.
      </div>
    </section>
  );
}

export type CreateRoomKind = "group" | "dm" | "god-channel" | "system";

export function CreateRoomPanel({
  disabled,
  memberText,
  name,
  onCreate,
  onMemberTextChange,
  onNameChange,
  onTypeChange,
  roles,
  type,
}: {
  disabled: boolean;
  type: CreateRoomKind;
  name: string;
  memberText: string;
  roles: RoleSummary[];
  onTypeChange: (value: CreateRoomKind) => void;
  onNameChange: (value: string) => void;
  onMemberTextChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <section data-testid="create-room-panel">
      <PanelTitle icon={<MessageSquareText size={16} aria-hidden="true" />} title="New Chat" />
      <div className="mt-3 space-y-2 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-500">
            Type
            <select
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="create-room-type"
              value={type}
              onChange={(event) => onTypeChange(event.target.value as CreateRoomKind)}
              data-testid="create-room-type"
            >
              <option value="group">Group</option>
              <option value="dm">DM</option>
              <option value="god-channel">God</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-500">
            Name
            <input
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="create-room-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              data-testid="create-room-name"
            />
          </label>
        </div>
        <label className="block text-xs text-zinc-500">
          Members
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="create-room-members"
            value={memberText}
            onChange={(event) => onMemberTextChange(event.target.value)}
            list="realm-role-members"
            data-testid="create-room-members"
          />
        </label>
        <datalist id="realm-role-members">
          <option value={`owner,${roles.map((role) => role.id).join(",")}`} />
          {roles.map((role) => (
            <option key={role.id} value={`owner,${role.id}`} />
          ))}
        </datalist>
        <Button
          size="sm"
          variant="primary"
          onClick={onCreate}
          disabled={disabled || !name.trim()}
          data-testid="create-room-apply"
        >
          Create Chat
        </Button>
      </div>
    </section>
  );
}

export function AdminStatePatchPanel({
  disabled,
  onApply,
  onPathChange,
  onReasonChange,
  onValueChange,
  path,
  reason,
  result,
  value,
}: {
  disabled: boolean;
  path: string;
  value: string;
  reason: string;
  result?: StatePatchResult;
  onPathChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section data-testid="admin-state-patch-panel">
      <PanelTitle icon={<Braces size={16} aria-hidden="true" />} title="Admin State Patch" />
      <div className="mt-3 space-y-2 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <label className="block text-xs text-zinc-500">
          JSON Pointer
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="admin-state-path"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            data-testid="admin-state-path"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Value
          <textarea
            className="mt-1 min-h-16 w-full resize-none rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="admin-state-value"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            data-testid="admin-state-value"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Reason
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="admin-state-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            data-testid="admin-state-reason"
          />
        </label>
        <Button
          size="sm"
          variant="primary"
          onClick={onApply}
          disabled={disabled || !path.trim() || !reason.trim()}
          data-testid="admin-state-apply"
        >
          Apply Patch
        </Button>
        {result ? (
          <p className="text-xs text-zinc-500" data-testid="admin-state-result">
            {result.status === "committed"
              ? `Committed state v${result.version}`
              : result.status === "duplicate"
                ? `Duplicate state v${result.version}`
                : `Rejected: ${result.reason}`}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export type GodRoleAction = "kill" | "mute" | "revive";

export function GodActionPanel({
  action,
  disabled,
  onActionChange,
  onApply,
  onReasonChange,
  onRoleChange,
  reason,
  result,
  roles,
  targetRoleId,
}: {
  action: GodRoleAction;
  disabled: boolean;
  roles: RoleSummary[];
  targetRoleId: string;
  reason: string;
  result?: StatePatchResult;
  onActionChange: (value: GodRoleAction) => void;
  onRoleChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section data-testid="god-action-panel">
      <PanelTitle icon={<Gavel size={16} aria-hidden="true" />} title="God Actions" />
      <div className="mt-3 space-y-2 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-500">
            Action
            <select
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="god-action-type"
              value={action}
              onChange={(event) => onActionChange(event.target.value as GodRoleAction)}
              data-testid="god-action-type"
            >
              <option value="kill">Kill</option>
              <option value="mute">Mute</option>
              <option value="revive">Revive</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-500">
            Role
            <select
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="god-action-role"
              value={targetRoleId}
              onChange={(event) => onRoleChange(event.target.value)}
              data-testid="god-action-role"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-zinc-500">
          Reason
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="god-action-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            data-testid="god-action-reason"
          />
        </label>
        <Button
          size="sm"
          variant="primary"
          onClick={onApply}
          disabled={disabled || roles.length === 0 || !targetRoleId || !reason.trim()}
          data-testid="god-action-apply"
        >
          Apply Action
        </Button>
        {result ? (
          <p className="text-xs text-zinc-500" data-testid="god-action-result">
            {result.status === "committed"
              ? `Committed state v${result.version}`
              : result.status === "duplicate"
                ? `Duplicate state v${result.version}`
                : `Rejected: ${result.reason}`}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function TracePanel({ events }: { events: TraceEvent[] }) {
  return (
    <section>
      <PanelTitle icon={<Activity size={16} aria-hidden="true" />} title="Trace" />
      <div className="mt-3 space-y-2" data-testid="trace-events">
        {events.length === 0 ? (
          <p className="rounded-md bg-[#fafafa] px-3 py-2 text-sm text-zinc-500">
            No turn trace yet.
          </p>
        ) : (
          events.map((event) => {
            const item = describeTraceEvent(event);
            return (
              <div
                key={event.seq}
                className="rounded-md border border-realm-border bg-[#fafafa] px-3 py-2"
              >
                <div className="truncate font-medium text-xs">{item.title}</div>
                <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.body}</div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
