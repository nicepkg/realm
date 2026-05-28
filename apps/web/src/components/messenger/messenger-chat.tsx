import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.tsx";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
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

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-center border-[var(--realm-line)] border-b bg-[#f7f7f8] px-4">
      <Button
        aria-label={t("common.backToWorlds")}
        className="absolute left-4 rounded-full"
        onClick={onBackToWorlds}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="size-5" />
      </Button>
      <h1 className="max-w-[52%] truncate text-center font-semibold text-[17px] leading-6 sm:max-w-[60%]">
        {title}
      </h1>
      <Button
        aria-label={t("common.command")}
        className="absolute right-4 rounded-full"
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
        {app.state.messages.length === 0 && app.state.status === "ready" ? (
          <ConversationEmptyState
            title={t("workspace.noMessages")}
            description={t("workspace.emptyChat")}
          />
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
