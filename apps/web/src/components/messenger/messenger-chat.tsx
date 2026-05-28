import { ArrowLeft, Command, Database, MoreHorizontal, Settings2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.tsx";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";
import { MessengerMessage, shouldShowMessageTime } from "./messenger-message.tsx";
import { roomMembersForAvatar, SystemNotice } from "./messenger-primitives.tsx";

export { MessengerComposer } from "./messenger-composer.tsx";

export function ChatHeader({
  app,
  onBackToWorlds,
  onOpenCommandPalette,
  onOpenGod,
  onOpenSettings,
  onOpenWorldInspector,
}: {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onOpenCommandPalette: () => void;
  onOpenGod: () => void;
  onOpenSettings: () => void;
  onOpenWorldInspector: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const memberCount = app.selectedRoom
    ? roomMembersForAvatar(app.selectedRoom, app.state.roles).length
    : 0;
  const title =
    app.selectedRoom && memberCount > 1
      ? `${app.selectedRoom.name} (${memberCount})`
      : (app.selectedRoom?.name ?? t("workspace.noConversation"));
  const identityLabel =
    app.identity === "owner"
      ? t("common.boss")
      : displayNameForIdentity(app.identity, app.state.roles);
  const turnLabel =
    app.turnRun.status === "running"
      ? t("workspace.roleTurnRunning")
      : app.turnRun.status === "error"
        ? t("workspace.roleTurnFailed")
        : t("common.ready");

  return (
    <header className="relative flex h-[86px] shrink-0 items-center justify-center border-[#d9d9dc] border-b bg-[#f2f2f2] px-4">
      <Button
        aria-label={t("common.backToWorlds")}
        className="absolute left-5 top-1/2 size-10 -translate-y-1/2 rounded-full text-[#1f1f21]"
        onClick={onBackToWorlds}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="size-6" />
      </Button>
      <div className="flex max-w-[58%] min-w-0 flex-col items-center text-center sm:max-w-[68%]">
        <h1
          className="max-w-full truncate font-semibold text-[21px] leading-7"
          data-testid="chat-title"
        >
          {title}
        </h1>
        <div className="sr-only" data-testid="workspace-context-line">
          <span className="truncate" data-testid="context-project">
            {app.state.projectName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="hidden truncate sm:inline" data-testid="context-world">
            {app.selectedWorld?.name ?? t("common.world")}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span className="truncate" data-testid="context-identity">
            {identityLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span
            className="inline-flex shrink-0 items-center gap-1"
            data-testid="context-running-state"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                app.turnRun.status === "running"
                  ? "bg-[var(--realm-green)]"
                  : app.turnRun.status === "error"
                    ? "bg-[#ff3b30]"
                    : "bg-[#b9b9bd]",
              )}
            />
            {turnLabel}
          </span>
        </div>
      </div>
      <Button
        aria-expanded={menuOpen}
        aria-label={t("workspace.moreActions")}
        className="absolute right-5 top-1/2 size-10 -translate-y-1/2 rounded-full text-[#1f1f21]"
        data-testid="topbar-more"
        onClick={() => setMenuOpen((open) => !open)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <MoreHorizontal className="size-6" />
      </Button>
      {menuOpen ? (
        <div
          className="absolute top-[66px] right-4 z-30 w-[224px] overflow-hidden rounded-[6px] bg-white py-1 text-[#1f1f21] shadow-[0_10px_36px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
          data-testid="topbar-action-menu"
        >
          <TopbarMenuAction
            icon={<Command className="size-4" />}
            label={t("common.command")}
            onClick={() => {
              setMenuOpen(false);
              onOpenCommandPalette();
            }}
            testId="topbar-command"
          />
          <TopbarMenuAction
            icon={<Database className="size-4" />}
            label={t("inspector.world")}
            onClick={() => {
              setMenuOpen(false);
              onOpenWorldInspector();
            }}
            testId="topbar-world-inspector"
          />
          <TopbarMenuAction
            icon={<ShieldCheck className="size-4" />}
            label={t("workspace.godController")}
            onClick={() => {
              setMenuOpen(false);
              onOpenGod();
            }}
            testId="topbar-god"
          />
          <TopbarMenuAction
            icon={<Settings2 className="size-4" />}
            label={t("common.settings")}
            onClick={() => {
              setMenuOpen(false);
              onOpenSettings();
            }}
            testId="topbar-settings"
          />
        </div>
      ) : null}
    </header>
  );
}

function TopbarMenuAction({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="flex h-11 w-full items-center gap-3 px-4 text-left text-[14px] transition hover:bg-[#f5f5f5]"
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-6 items-center justify-center text-[#56565a]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function MessengerTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  return (
    <Conversation className="min-h-0 flex-1 bg-[#ededee]" data-testid="chat-stream">
      <ConversationContent className="min-h-full gap-3 px-5 py-4 md:px-8">
        {app.state.status === "loading" ? (
          <ConversationEmptyState
            title={t("common.loading")}
            description={t("manager.projectHint")}
          />
        ) : null}
        {app.state.status === "error" ? (
          <SystemNotice title={t("common.error")} body={app.state.error ?? t("common.error")} />
        ) : null}
        {app.state.messages.map((message, index) => {
          const previous = app.state.messages[index - 1];
          return (
            <MessengerMessage
              key={message.id}
              message={message}
              roles={app.state.roles}
              room={app.selectedRoom}
              showTimestamp={shouldShowMessageTime(message, previous)}
            />
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
