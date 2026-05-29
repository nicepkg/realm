import {
  ArrowLeft,
  Command,
  Database,
  Info,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { roomDisplayName } from "@/view-models/labels.ts";
import type { RealmAppController } from "../../app/types.ts";
import { roomMembersForAvatar } from "./messenger-primitives.tsx";

/**
 * Chat pane header. Carries the persistent operator context (project · world ·
 * viewer account · running state), a mobile back-to-list affordance, and the
 * lightweight actions (command palette, details/inspector, more → world
 * inspector / God / settings). God stays gated behind the menu, never a row.
 */
export function ChatHeader({
  app,
  onBackToList,
  onOpenInspector,
  onOpenCommandPalette,
  onOpenGod,
  onOpenWorldInspector,
  onOpenSettings,
}: {
  app: RealmAppController;
  onBackToList: () => void;
  onOpenInspector: () => void;
  onOpenCommandPalette: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const memberCount = app.selectedRoom
    ? roomMembersForAvatar(app.selectedRoom, app.state.roles).length
    : 0;
  const roomTitle = app.selectedRoom ? roomDisplayName(t, app.selectedRoom) : undefined;
  const title =
    roomTitle && memberCount > 1
      ? `${roomTitle} (${memberCount})`
      : (roomTitle ?? t("workspace.noConversation"));
  const switching = app.switching;
  const reconnecting = app.connection === "reconnecting";
  // The running-state slot tells the operator the truth, in priority order:
  // a pending switch ("loading conversation") outranks the steady turn state so a
  // stale title never reads as "ready" while the next room is still loading.
  const turnLabel = switching
    ? t("workspace.switching")
    : app.turnRun.status === "running"
      ? t("workspace.roleTurnRunning")
      : app.turnRun.status === "error"
        ? t("workspace.roleTurnFailed")
        : t("common.ready");

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-[var(--realm-line)] border-b bg-[var(--realm-surface)] px-3"
      data-testid="chat-header"
    >
      <Button
        aria-label={t("workspace.backToList")}
        className="size-9 rounded-[8px] lg:hidden"
        data-testid="chat-back-to-list"
        onClick={onBackToList}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1
          aria-busy={switching}
          className={cn(
            "truncate font-semibold text-[16px] leading-5 transition-opacity duration-200",
            // Calm pending treatment: the title dims while the next conversation
            // loads so the operator never mistakes stale content for the target.
            switching && "opacity-50",
          )}
          data-testid="chat-title"
        >
          {title}
        </h1>
        <div
          className="flex items-center gap-1.5 truncate text-[12px] text-[var(--realm-fg-muted)] leading-4"
          data-testid="workspace-context-line"
        >
          <span className="truncate" data-testid="context-project">
            {app.state.projectName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="hidden truncate sm:inline" data-testid="context-world">
            {app.selectedWorld?.name ?? t("common.world")}
          </span>
          {/* The viewer-identity / impersonation signal is authoritative in ONE
           * place — the composer Send label — so it is intentionally absent here
           * to avoid a duplicate, conflicting source of truth (error prevention). */}
          <span aria-hidden="true">·</span>
          <span
            aria-busy={switching}
            className="inline-flex shrink-0 items-center gap-1"
            data-testid="context-running-state"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                switching
                  ? "realm-breathe bg-[var(--realm-fg-muted)]"
                  : app.turnRun.status === "running"
                    ? "bg-[var(--realm-green)]"
                    : app.turnRun.status === "error"
                      ? "bg-[var(--realm-danger)]"
                      : "bg-[#b9b9bd]",
              )}
            />
            {turnLabel}
          </span>
          {reconnecting ? (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[var(--realm-fg-muted)]"
                data-testid="context-reconnecting"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="realm-breathe size-1.5 rounded-full bg-[#d8a200]"
                />
                {t("workspace.reconnecting")}
              </span>
            </>
          ) : null}
        </div>
      </div>
      {/* One clearly-purposed Details/Inspector control, mapped to the active
       * room, visible from `sm` up. On narrow widths it folds into the ⋯ menu
       * so the bar never carries 3+ trailing icon buttons (mapping + calm). */}
      <Button
        aria-label={t("workspace.openInspector")}
        className="hidden size-9 rounded-[8px] sm:inline-flex"
        data-testid="chat-open-inspector"
        onClick={onOpenInspector}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Info className="size-[18px]" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("workspace.moreActions")}
            className="size-9 rounded-[8px]"
            data-testid="topbar-more"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Details only appears here on narrow widths — its own button is
           * hidden below `sm`, so this is its single accessible home there. */}
          <MoreMenuItem
            className="sm:hidden"
            icon={<Info className="size-4" />}
            label={t("workspace.openInspector")}
            onSelect={onOpenInspector}
            testId="topbar-inspector"
          />
          {/* Command palette lives in the menu + the global ⌘K/Ctrl K shortcut +
           * the Manager hint — no standalone header icon (DISC-R6-3). */}
          <MoreMenuItem
            icon={<Command className="size-4" />}
            label={t("common.command")}
            onSelect={onOpenCommandPalette}
            testId="topbar-command-palette"
          />
          <MoreMenuItem
            icon={<Database className="size-4" />}
            label={t("inspector.world")}
            onSelect={onOpenWorldInspector}
            testId="topbar-world-inspector"
          />
          <MoreMenuItem
            icon={<ShieldCheck className="size-4" />}
            label={t("workspace.godController")}
            onSelect={onOpenGod}
            testId="topbar-god"
          />
          <MoreMenuItem
            icon={<Settings2 className="size-4" />}
            label={t("common.settings")}
            onSelect={onOpenSettings}
            testId="topbar-settings"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function MoreMenuItem({
  className,
  icon,
  label,
  onSelect,
  testId,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <DropdownMenuItem className={className} data-testid={testId} onSelect={onSelect}>
      {icon}
      {label}
    </DropdownMenuItem>
  );
}
