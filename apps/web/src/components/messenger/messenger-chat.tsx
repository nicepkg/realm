import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
}: {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { t } = useI18n();
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
    <header className="relative flex h-[72px] shrink-0 items-center justify-center border-[var(--realm-line)] border-b bg-[#f7f7f8] px-4">
      <Button
        aria-label={t("common.backToWorlds")}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full"
        onClick={onBackToWorlds}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="size-5" />
      </Button>
      <div className="flex max-w-[58%] min-w-0 flex-col items-center gap-1 text-center sm:max-w-[68%]">
        <h1
          className="max-w-full truncate font-semibold text-[17px] leading-5"
          data-testid="chat-title"
        >
          {title}
        </h1>
        <div
          className="flex max-w-full items-center justify-center gap-1.5 overflow-hidden text-[#8a8a8f] text-[11px] leading-3"
          data-testid="workspace-context-line"
        >
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
        aria-label={t("common.command")}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full"
        data-testid="operator-more"
        onClick={onOpenCommandPalette}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <MoreHorizontal className="size-5" />
      </Button>
    </header>
  );
}

export function MessengerTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  return (
    <Conversation className="min-h-0 flex-1 bg-[#ededee]" data-testid="chat-stream">
      <ConversationContent className="min-h-full gap-2.5 px-5 py-5 md:px-7">
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
