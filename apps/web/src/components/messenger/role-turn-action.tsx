import { Bot, RotateCcw, Square, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";

export function RoleTurnActionGroup({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const activeRole =
    app.state.roles.find((role) => role.id === app.turnRun.roleId) ?? app.selectedRole;
  const activeRoom =
    app.state.rooms.find((room) => room.id === app.turnRun.roomId) ?? app.selectedRoom;
  const activeWorld =
    app.state.worlds.find((world) => world.id === app.turnRun.worldId) ?? app.selectedWorld;
  const elapsed = useMemo(
    () => formatElapsedSeconds(app.turnRun.startedAt, now),
    [app.turnRun.startedAt, now],
  );
  const canRun = Boolean(
    activeRole && activeRoom && activeWorld && app.turnRun.status !== "running",
  );
  const statusLabel =
    app.turnRun.status === "running"
      ? `${t("workspace.roleTurnRunning")} · ${elapsed}`
      : app.turnRun.status === "error"
        ? `${t("workspace.roleTurnFailed")}${app.turnRun.error ? ` · ${app.turnRun.error}` : ""}`
        : t("workspace.roleTurnReady");

  useEffect(() => {
    if (app.turnRun.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [app.turnRun.status]);

  if (!activeRole || !activeRoom || !activeWorld) {
    return null;
  }

  if (app.turnRun.status === "running") {
    return (
      <TrayActionButton
        icon={<Square className="size-6" />}
        label={t("common.cancel")}
        status={statusLabel}
        testId="role-turn-cancel"
        disabled={!app.turnRun.turnId}
        onClick={() => void app.cancelActiveTurn()}
      />
    );
  }

  return (
    <>
      <TrayActionButton
        icon={
          app.turnRun.status === "error" ? (
            <RotateCcw className="size-6" />
          ) : (
            <Bot className="size-6" />
          )
        }
        label={app.turnRun.status === "error" ? t("common.retry") : t("workspace.runRole")}
        status={statusLabel}
        testId={app.turnRun.status === "error" ? "role-turn-retry" : "role-turn-run"}
        disabled={!canRun}
        onClick={() => void app.runSelectedRoleTurn()}
      />
      {app.turnRun.status === "error" ? (
        <TrayActionButton
          icon={<X className="size-6" />}
          label={t("common.dismiss")}
          status={statusLabel}
          testId="role-turn-dismiss"
          onClick={app.clearTurnError}
        />
      ) : null}
    </>
  );
}

function TrayActionButton({
  disabled,
  icon,
  label,
  onClick,
  status,
  testId,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  status: string;
  testId: string;
}) {
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
