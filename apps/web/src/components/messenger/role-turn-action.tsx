import { Bot, RotateCcw, Square, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import type { Locale } from "@/i18n/messages.ts";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";
import { roomMembersForAvatar } from "./messenger-primitives.tsx";
import { RunTurnPreviewDialog } from "./run-turn-preview-dialog.tsx";

// Re-exported so the existing import surface stays stable: external callers
// (app-shell, role-turn-action.test) keep importing the preview from here even
// though it now lives in its own co-located module to keep this file in budget.
export { RunTurnPreviewBody, RunTurnPreviewDialog } from "./run-turn-preview-dialog.tsx";

/**
 * Resolve the run-turn target the same way every surface does: prefer the role /
 * room / world bound to an in-flight turn, otherwise fall back to the current
 * selection. Keeping this in one place is what lets the composer row, the empty
 * CTA, and the command palette share one mental model (MC6-2).
 */
function resolveRunTurnTarget(app: RealmAppController) {
  const role = app.state.roles.find((item) => item.id === app.turnRun.roleId) ?? app.selectedRole;
  const room = app.state.rooms.find((item) => item.id === app.turnRun.roomId) ?? app.selectedRoom;
  const world =
    app.state.worlds.find((item) => item.id === app.turnRun.worldId) ?? app.selectedWorld;
  return { role, room, world };
}

/**
 * Whether the bound role is actually a MEMBER of the target room. A non-member
 * run would post into a room the role does not belong to, so it is a hard
 * constraint shared across surfaces (MC-R4-1).
 */
export function roleIsMemberOfRoom(
  app: RealmAppController,
  role: { id: string } | undefined,
  room: Parameters<typeof roomMembersForAvatar>[0] | undefined,
): boolean {
  if (!role || !room) {
    return false;
  }
  return roomMembersForAvatar(room, app.state.roles).some((member) => member.id === role.id);
}

/**
 * The single source of truth for "can a role turn run right now?": role + room +
 * world all present, the runtime is not already running, the surface is not
 * read-only, and the role is a member of the target room. Exported so the
 * command palette enforces the EXACT same gate as the composer (MC6-2 + Don
 * Norman: constraints) instead of the old `selectedRole && !running` shortcut.
 */
export function canRunRoleTurn(app: RealmAppController, readOnly: boolean): boolean {
  const { role, room, world } = resolveRunTurnTarget(app);
  const isRunning = app.turnRun.status === "running";
  return Boolean(
    role && room && world && !isRunning && !readOnly && roleIsMemberOfRoom(app, role, room),
  );
}

/**
 * Bilingual, dict-free explanation of WHY a run turn is blocked, or `undefined`
 * when it can run. Returned so a disabled control can name its own constraint
 * next to itself (Don Norman: feedback + mapping). Order mirrors the composer's
 * status line: running → read-only → missing selection → not-a-member.
 */
export function runTurnBlockReason(
  app: RealmAppController,
  readOnly: boolean,
  locale: Locale,
): string | undefined {
  const zh = locale === "zh-CN";
  if (app.turnRun.status === "running") {
    return zh ? "正在运行一个回合" : "A role turn is already running";
  }
  if (readOnly) {
    return zh ? "只读模式：先提升信任级别" : "Read-only: raise trust to run roles";
  }
  const { role, room, world } = resolveRunTurnTarget(app);
  if (!role || !room || !world) {
    return zh ? "先选择世界、会话和角色" : "Select a world, room, and role first";
  }
  if (!roleIsMemberOfRoom(app, role, room)) {
    return zh ? "该角色不在当前房间" : "This role is not in the current room";
  }
  return undefined;
}

/**
 * Visual placement of the run/cancel/retry control:
 * - "tray"  : large WeChat plus-tray tiles (legacy secondary surface).
 * - "row"   : compact, always-visible control on the composer action row, so the
 *             primary "Run <role> Turn" affordance is never hidden (DISC-1).
 */
type RoleTurnVariant = "tray" | "row";

/**
 * Shared run-turn state machine. Owns the elapsed-time ticker and the preview
 * dialog so every placement (composer row, plus tray, empty-state CTA) drives
 * the exact same gated flow: a fresh run always opens the preview confirmation
 * (Don Norman: error prevention), a retry re-runs directly, and a running turn
 * exposes Cancel. `readOnly` disables a fresh run before it can start (MC-2).
 */
function useRoleTurn(app: RealmAppController, readOnly: boolean) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [previewOpen, setPreviewOpen] = useState(false);
  const { role: activeRole, room: activeRoom, world: activeWorld } = resolveRunTurnTarget(app);
  const elapsed = useMemo(
    () => formatElapsedSeconds(app.turnRun.startedAt, now),
    [app.turnRun.startedAt, now],
  );
  const isRunning = app.turnRun.status === "running";
  const isError = app.turnRun.status === "error";

  // The run gate and its constraint copy come from the shared pure helpers so
  // the composer and the command palette stay in lockstep (MC6-2).
  const canRun = canRunRoleTurn(app, readOnly);
  const roleIsRoomMember = roleIsMemberOfRoom(app, activeRole, activeRoom);
  const notMemberReason =
    locale === "zh-CN" ? "该角色不在当前房间" : "This role is not in the current room";
  const showNotMemberReason = Boolean(
    activeRole && activeRoom && activeWorld && !isRunning && !readOnly && !roleIsRoomMember,
  );
  const statusLabel = isRunning
    ? `${t("workspace.roleTurnRunning")} · ${elapsed}`
    : isError
      ? `${t("workspace.roleTurnFailed")}${app.turnRun.error ? ` · ${app.turnRun.error}` : ""}`
      : readOnly
        ? t("roleTurn.failedReadOnly")
        : showNotMemberReason
          ? notMemberReason
          : t("workspace.roleTurnReady");

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  return {
    activeRole,
    activeRoom,
    activeWorld,
    canRun,
    isError,
    isRunning,
    notMemberReason,
    previewOpen,
    setPreviewOpen,
    showNotMemberReason,
    statusLabel,
  };
}

/**
 * The run / cancel / retry control. `variant` chooses placement only — the
 * behavior (preview gate, cancel, retry, dismiss) is identical everywhere so
 * the operator builds one mental model. `readOnly` makes a fresh run a calm,
 * disabled affordance instead of a hidden one.
 */
export function RoleTurnActionGroup({
  app,
  readOnly = false,
  variant = "tray",
}: {
  app: RealmAppController;
  readOnly?: boolean;
  variant?: RoleTurnVariant;
}) {
  const { t } = useI18n();
  const turn = useRoleTurn(app, readOnly);
  const Action = variant === "row" ? RowActionButton : TrayActionButton;

  if (!turn.activeRole || !turn.activeRoom || !turn.activeWorld) {
    return null;
  }

  // Name the bound role on the visible control so the operator knows exactly
  // whose turn they are about to run before any preview opens (DISC-R3-1 /
  // DISC-R7-5 + Don Norman: mapping). Retry keeps the bare verb (the failed turn
  // is already named in the status line); RowActionButton truncates long names.
  const runLabel = turn.isError
    ? t("common.retry")
    : t("workspace.runTurnNamed")(turn.activeRole.displayName);

  if (turn.isRunning) {
    // EP-R7-6: Cancel must never be a silent dead control. Before the runtime
    // returns a turnId there is nothing to abort yet, so keep the button enabled
    // (cancelActiveTurn no-ops gracefully) and swap in calm micro-copy that names
    // the wait instead of greying out with no explanation.
    const preparing = !app.turnRun.turnId;
    return (
      <Action
        icon={<Square className="size-4" />}
        label={t("common.cancel")}
        onClick={() => void app.cancelActiveTurn()}
        status={preparing ? t("workspace.turnCancelPreparing") : turn.statusLabel}
        testId="role-turn-cancel"
        tone="active"
      />
    );
  }

  return (
    <>
      <Action
        disabled={!turn.canRun}
        icon={turn.isError ? <RotateCcw className="size-4" /> : <Bot className="size-4" />}
        label={runLabel}
        // EP-R7-5: BOTH retry and a fresh run go through the preview so role /
        // model / target are re-confirmed every time — a retry must never bypass
        // the gate and re-fire a turn that may now resolve to a different target
        // (Don Norman: error prevention + feedback).
        onClick={() => turn.setPreviewOpen(true)}
        status={turn.statusLabel}
        testId={turn.isError ? "role-turn-retry" : "role-turn-run"}
        tone="primary"
      />
      {turn.isError ? (
        <Action
          icon={<X className="size-4" />}
          label={t("common.dismiss")}
          onClick={app.clearTurnError}
          status={turn.statusLabel}
          testId="role-turn-dismiss"
          tone="muted"
        />
      ) : null}
      {turn.showNotMemberReason ? (
        <span
          className="max-w-[14rem] truncate text-[12px] text-[var(--realm-fg-muted)]"
          data-testid="role-turn-not-member"
          role="note"
          title={turn.notMemberReason}
        >
          {turn.notMemberReason}
        </span>
      ) : null}
      <RunTurnPreviewDialog
        activeRole={turn.activeRole}
        activeRoom={turn.activeRoom}
        activeWorld={turn.activeWorld}
        app={app}
        onConfirm={() => void app.runSelectedRoleTurn()}
        onOpenChange={turn.setPreviewOpen}
        open={turn.previewOpen}
      />
    </>
  );
}

/**
 * Empty-timeline call-to-action. Names the selected role and routes the run
 * through the same preview gate, so the very first thing a new operator sees in
 * an empty room is the safe next action (DISC-1 + Don Norman: discoverability).
 * Read-only renders it disabled rather than hiding it.
 */
export function RoleTurnEmptyCta({
  app,
  readOnly = false,
}: {
  app: RealmAppController;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const turn = useRoleTurn(app, readOnly);
  if (!turn.activeRole || !turn.activeRoom || !turn.activeWorld || turn.isRunning) {
    return null;
  }
  return (
    <>
      <Button
        className={cn(
          "h-9 rounded-[8px] px-4 text-[14px]",
          turn.canRun
            ? "bg-[var(--realm-green)] text-white hover:bg-[var(--realm-green-strong)]"
            : "bg-[var(--realm-surface-muted)] text-[var(--realm-fg-faint)]",
        )}
        data-testid="empty-run-turn"
        disabled={!turn.canRun}
        onClick={() => turn.setPreviewOpen(true)}
        title={turn.statusLabel}
        type="button"
      >
        <Bot className="size-4" />
        {t("workspace.runTurnNamed")(turn.activeRole.displayName)}
      </Button>
      <RunTurnPreviewDialog
        activeRole={turn.activeRole}
        activeRoom={turn.activeRoom}
        activeWorld={turn.activeWorld}
        app={app}
        onConfirm={() => void app.runSelectedRoleTurn()}
        onOpenChange={turn.setPreviewOpen}
        open={turn.previewOpen}
      />
    </>
  );
}

type ActionTone = "primary" | "active" | "muted";

type ActionButtonProps = {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  status: string;
  testId: string;
  tone: ActionTone;
};

/**
 * Compact composer-row control. Always visible, labelled, keyboard-focusable.
 * Cancel reads in WeChat green so an in-flight turn is obviously interruptible;
 * a fresh run stays calm so it never shouts over the Send button.
 */
function RowActionButton({
  disabled,
  icon,
  label,
  onClick,
  status,
  testId,
  tone,
}: ActionButtonProps) {
  return (
    <Button
      aria-disabled={disabled}
      className={cn(
        "h-9 shrink-0 gap-1.5 rounded-[8px] px-3 text-[13px]",
        tone === "active"
          ? "bg-[var(--realm-green)] text-white hover:bg-[var(--realm-green-strong)]"
          : "text-[var(--realm-fg-muted)] hover:bg-[var(--realm-surface-muted)] hover:text-[var(--realm-fg)]",
        disabled && "cursor-not-allowed opacity-45",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={status}
      type="button"
      variant={tone === "active" ? "default" : "ghost"}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="sr-only" data-testid="role-turn-status">
        {status}
      </span>
    </Button>
  );
}

function TrayActionButton({ disabled, icon, label, onClick, status, testId }: ActionButtonProps) {
  return (
    <button
      className={cn(
        "flex min-w-0 flex-col items-center gap-1.5 text-[#555] text-[12px] transition hover:text-[#111]",
        disabled && "cursor-not-allowed opacity-45",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={status}
      type="button"
    >
      <span className="flex size-[54px] items-center justify-center rounded-[9px] bg-white text-[#333] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
      <span className="sr-only" data-testid="role-turn-status">
        {status}
      </span>
    </button>
  );
}

export function formatElapsedSeconds(startedAt: string | undefined, now = Date.now()): string {
  if (!startedAt) {
    return "0:00";
  }
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started) || started > now) {
    return "0:00";
  }
  const totalSeconds = Math.floor((now - started) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
