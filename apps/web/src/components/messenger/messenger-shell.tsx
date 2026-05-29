import { useCallback, useEffect, useState } from "react";
import { AppBottomTabs } from "@/components/layout/app-bottom-tabs.tsx";
import { AppRail } from "@/components/layout/app-rail.tsx";
import type { AppRailDestination } from "@/components/layout/app-rail-model.ts";
import { AccountSwitcher } from "@/components/messenger/account-switcher.tsx";
import { ChatPane } from "@/components/messenger/chat-pane.tsx";
import { ConversationList } from "@/components/messenger/conversation-list.tsx";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { withViewTransition } from "@/lib/view-transition.ts";
import type { RealmAppController } from "../../app/types.ts";

export type MessengerShellProps = {
  app: RealmAppController;
  onNewDm: () => void;
  onNewGroup: () => void;
  onCreateWorld: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenCommandPalette: () => void;
  onInspectRole: (roleId: string) => void;
  onOpenSettings: () => void;
};

/**
 * Responsive messenger shell. Real breakpoints, no fixed phone frame:
 * - `<lg`: single pane (list ⇄ chat swap) + bottom tabs.
 * - `lg`: 56px rail + 280px list + flex chat (≥640px).
 * Owns the mobile pane state and the account switcher overlay.
 */
export function MessengerShell({
  app,
  onNewDm,
  onNewGroup,
  onCreateWorld,
  onOpenGod,
  onOpenWorldInspector,
  onOpenCommandPalette,
  onInspectRole,
  onOpenSettings,
}: MessengerShellProps) {
  const { t } = useI18n();
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [accountOpen, setAccountOpen] = useState(false);

  // Single entry point for list⇄chat pane swaps so every transition gets the
  // native View Transition crossfade (and a clean reduced-motion fallback).
  const swapPane = useCallback((pane: "list" | "chat") => {
    withViewTransition(() => setMobilePane(pane));
  }, []);

  // When a room becomes selected on mobile, swap to the chat pane.
  useEffect(() => {
    if (app.selectedRoom?.id) {
      swapPane("chat");
    }
  }, [app.selectedRoom?.id, swapPane]);

  const railActive: AppRailDestination =
    app.activeSection === "roles" ? "roles" : app.activeSection === "worlds" ? "worlds" : "chats";

  const navigate = (destination: AppRailDestination) => {
    app.setActiveSection(destination);
    swapPane("list");
  };

  return (
    <main
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--realm-bg)] text-[var(--realm-fg)]"
      data-testid="realm-shell"
    >
      <div className="flex min-h-0 flex-1">
        <AppRail
          active={railActive}
          app={app}
          onNavigate={navigate}
          onOpenAccountSwitcher={() => setAccountOpen(true)}
          onOpenSettings={onOpenSettings}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(440px,1fr)] xl:grid-cols-[280px_minmax(640px,1fr)]">
          <div
            className={cn(
              "realm-mobile-pane min-h-0 border-[var(--realm-line)] lg:flex lg:border-r",
              mobilePane === "list" ? "flex" : "hidden",
            )}
          >
            <ConversationList
              app={app}
              onCreateWorld={onCreateWorld}
              onInspectRole={onInspectRole}
              onNewDm={onNewDm}
              onNewGroup={onNewGroup}
              onOpenGod={onOpenGod}
              onSelect={() => swapPane("chat")}
            />
          </div>
          <div
            className={cn(
              "realm-mobile-pane min-h-0 lg:flex lg:flex-col",
              mobilePane === "chat" ? "flex flex-col" : "hidden",
            )}
          >
            <ChatPane
              app={app}
              onBackToList={() => swapPane("list")}
              onOpenCommandPalette={onOpenCommandPalette}
              onOpenGod={onOpenGod}
              onOpenInspector={onOpenWorldInspector}
              onOpenSettings={onOpenSettings}
              onOpenWorldInspector={onOpenWorldInspector}
            />
          </div>
        </div>
      </div>
      <AppBottomTabs
        active={railActive}
        onNavigate={navigate}
        onOpenAccountSwitcher={() => setAccountOpen(true)}
        onOpenSettings={onOpenSettings}
      />
      {/*
       * The account switcher anchors to a fixed point near the rail's account
       * avatar (lg) / bottom tab (mobile). A zero-size anchor keeps the popover
       * positioning stable across breakpoints without coupling to a single
       * trigger element (it is opened from the rail, bottom tabs, or palette).
       */}
      <AccountSwitcher
        anchor={
          <span
            aria-hidden="true"
            className="pointer-events-none fixed bottom-3 left-3 size-0 lg:left-14"
          />
        }
        app={app}
        onOpenChange={setAccountOpen}
        open={accountOpen}
      />
      <span className="sr-only">{t("workspace.localRuntime")}</span>
    </main>
  );
}
