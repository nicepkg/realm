import { Bot, RotateCcw, Settings, ShieldCheck, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";
import { IdentityAvatar } from "./messenger-primitives.tsx";

export function RoleTurnStrip({
  app,
  onOpenGod,
  onOpenSettings,
}: {
  app: RealmAppController;
  onOpenGod: () => void;
  onOpenSettings: () => void;
}) {
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
      ? t("workspace.roleTurnRunning")
      : app.turnRun.status === "error"
        ? t("workspace.roleTurnFailed")
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

  return (
    <section
      className={cn(
        "pointer-events-none absolute top-[76px] right-5 z-20 hidden max-w-[min(560px,calc(100%-40px))] items-center gap-2 rounded-full bg-white/95 px-2 py-1.5 text-[12px] shadow-[0_8px_22px_rgba(0,0,0,0.12)] md:flex",
        app.turnRun.status === "error" && "bg-[#fff8f2]",
      )}
      data-testid="role-turn-strip"
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 pl-1">
        <IdentityAvatar identity={activeRole.id} label={activeRole.displayName} size="sm" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 font-medium text-[#1f1f21] leading-4">
            <Bot className="size-3.5 shrink-0 text-[#6e6e73]" />
            <span className="truncate">{activeRole.displayName}</span>
            <span className="text-[#9b9ba1]">·</span>
            <span className="hidden truncate text-[#6e6e73] lg:inline">{activeRoom.name}</span>
          </div>
          <div
            className={cn(
              "max-w-[220px] truncate text-[#8a8a8f] leading-4",
              app.turnRun.status === "error" && "text-[#b45309]",
            )}
            data-testid="role-turn-status"
          >
            {statusLabel}
            {app.turnRun.status === "running" ? ` · ${elapsed}` : null}
            {app.turnRun.status === "error" && app.turnRun.error ? ` · ${app.turnRun.error}` : null}
          </div>
        </div>
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
        {app.turnRun.status === "error" ? (
          <Button
            className="size-8 rounded-full bg-white px-0 text-[#8a4b00] shadow-none hover:bg-[#fff1dd]"
            data-testid="role-turn-dismiss"
            onClick={app.clearTurnError}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
        {app.turnRun.status === "running" ? (
          <Button
            className="h-8 rounded-full bg-[#f2f2f4] px-3 text-[#1f1f21] shadow-none hover:bg-[#eeeeef]"
            data-testid="role-turn-cancel"
            disabled={!app.turnRun.turnId}
            onClick={() => void app.cancelActiveTurn()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Square className="size-3.5" />
            {t("common.cancel")}
          </Button>
        ) : (
          <Button
            className="h-8 rounded-full bg-[#07c160] px-3 text-white shadow-none hover:bg-[#06ad55]"
            data-testid={app.turnRun.status === "error" ? "role-turn-retry" : "role-turn-run"}
            disabled={!canRun}
            onClick={() => void app.runSelectedRoleTurn()}
            size="sm"
            type="button"
          >
            {app.turnRun.status === "error" ? (
              <RotateCcw className="size-3.5" />
            ) : (
              <Bot className="size-3.5" />
            )}
            {app.turnRun.status === "error" ? t("common.retry") : t("workspace.runRole")}
          </Button>
        )}
        <Button
          aria-label={t("common.settings")}
          className="size-8 rounded-full bg-[#f2f2f4] text-[#333] shadow-none hover:bg-[#eeeeef]"
          data-testid="topbar-settings"
          onClick={onOpenSettings}
          size="icon-sm"
          type="button"
          variant="secondary"
        >
          <Settings className="size-3.5" />
        </Button>
        <Button
          aria-label={t("workspace.godController")}
          className="size-8 rounded-full bg-[#f2f2f4] text-[#333] shadow-none hover:bg-[#eeeeef]"
          data-testid="topbar-god"
          onClick={onOpenGod}
          size="icon-sm"
          type="button"
          variant="secondary"
        >
          <ShieldCheck className="size-3.5" />
        </Button>
      </div>
    </section>
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
