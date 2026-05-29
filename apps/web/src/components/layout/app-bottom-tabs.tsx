import { Boxes, ContactRound, MessageCircle, Settings, UserCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { AppRailDestination } from "./app-rail-model.ts";

type AppBottomTabsProps = {
  active: AppRailDestination;
  onNavigate: (destination: AppRailDestination) => void;
  onOpenSettings: () => void;
  onOpenAccountSwitcher: () => void;
};

/**
 * Mobile (<lg) bottom tab bar. Same destinations as the desktop {@link AppRail},
 * laid out as a familiar 5-up tab row so mobile users never lose navigation
 * when a single pane fills the screen.
 */
export function AppBottomTabs({
  active,
  onNavigate,
  onOpenSettings,
  onOpenAccountSwitcher,
}: AppBottomTabsProps) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("common.navigation")}
      className="flex shrink-0 items-stretch border-[var(--realm-line)] border-t bg-[var(--realm-surface-rail)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      data-testid="app-bottom-tabs"
    >
      <BottomTab
        active={active === "chats"}
        icon={<MessageCircle className="size-5" />}
        label={t("rail.chats")}
        onClick={() => onNavigate("chats")}
        testId="bottom-tab-chats"
      />
      <BottomTab
        active={active === "roles"}
        icon={<ContactRound className="size-5" />}
        label={t("rail.contacts")}
        onClick={() => onNavigate("roles")}
        testId="bottom-tab-contacts"
      />
      <BottomTab
        active={active === "worlds"}
        icon={<Boxes className="size-5" />}
        label={t("rail.worlds")}
        onClick={() => onNavigate("worlds")}
        testId="bottom-tab-worlds"
      />
      <BottomTab
        active={false}
        icon={<UserCircle2 className="size-5" />}
        label={t("rail.account")}
        onClick={onOpenAccountSwitcher}
        testId="bottom-tab-account"
      />
      <BottomTab
        active={false}
        icon={<Settings className="size-5" />}
        label={t("rail.settings")}
        onClick={onOpenSettings}
        testId="bottom-tab-settings"
      />
    </nav>
  );
}

function BottomTab({
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
    <button
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] text-[var(--realm-fg-muted)] transition active:scale-95",
        active && "text-[var(--realm-green-text)]",
      )}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
