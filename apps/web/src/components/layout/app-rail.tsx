import { Boxes, ContactRound, MessageCircle, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";
import type { AppRailDestination } from "./app-rail-model.ts";

type AppRailProps = {
  app: RealmAppController;
  active: AppRailDestination;
  onNavigate: (destination: AppRailDestination) => void;
  onOpenSettings: () => void;
  onOpenAccountSwitcher: () => void;
};

/**
 * Narrow desktop app rail (56px). Holds the primary destinations (chats /
 * contacts / worlds), then Settings + the current-account avatar at the bottom.
 * Every icon-only control has a tooltip + aria-label (taste/a11y rule).
 */
export function AppRail({
  app,
  active,
  onNavigate,
  onOpenSettings,
  onOpenAccountSwitcher,
}: AppRailProps) {
  const { t } = useI18n();
  const accountLabel =
    app.viewerIdentity === "owner"
      ? t("workspace.bossPersona")
      : displayNameForIdentity(app.viewerIdentity, app.state.roles);

  return (
    <nav
      aria-label={t("common.navigation")}
      className="hidden h-full w-14 shrink-0 flex-col items-center gap-1 bg-[var(--realm-surface-rail)] py-3 lg:flex"
      data-testid="app-rail"
    >
      <RailButton
        active={active === "chats"}
        icon={<MessageCircle className="size-[22px]" />}
        label={t("rail.chats")}
        onClick={() => onNavigate("chats")}
        testId="rail-chats"
      />
      <RailButton
        active={active === "roles"}
        icon={<ContactRound className="size-[22px]" />}
        label={t("rail.contacts")}
        onClick={() => onNavigate("roles")}
        testId="rail-contacts"
      />
      <RailButton
        active={active === "worlds"}
        icon={<Boxes className="size-[22px]" />}
        label={t("rail.worlds")}
        onClick={() => onNavigate("worlds")}
        testId="rail-worlds"
      />
      <div className="flex-1" />
      <RailButton
        active={false}
        icon={<Settings className="size-[22px]" />}
        label={t("rail.settings")}
        onClick={onOpenSettings}
        testId="rail-settings"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`${t("rail.account")}: ${accountLabel}`}
            className={cn(
              "mt-1 flex size-10 items-center justify-center rounded-[8px] transition hover:bg-[var(--realm-hover)] active:scale-95",
              app.viewerIdentity !== "owner" && "ring-2 ring-[var(--realm-impersonate)]",
            )}
            data-testid="account-switcher-trigger"
            onClick={onOpenAccountSwitcher}
            type="button"
          >
            <IdentityAvatar
              identity={app.viewerIdentity}
              label={accountLabel}
              roles={app.state.roles}
              size="sm"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{`${t("workspace.viewingAs")}: ${accountLabel}`}</TooltipContent>
      </Tooltip>
    </nav>
  );
}

function RailButton({
  active,
  icon,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-[8px] text-[#56565a] transition hover:bg-[var(--realm-hover)] active:scale-95",
            active && "bg-[var(--realm-selected)] text-[var(--realm-fg)]",
          )}
          data-testid={testId}
          onClick={onClick}
          type="button"
        >
          {active ? (
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-[-6px] h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--realm-green)]"
            />
          ) : null}
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
