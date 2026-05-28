import type { Message as RealmMessage, RoleSummary, Room } from "@realm/api-contract";
import { VisibilityChips } from "@/components/messenger/visibility-chips.tsx";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import { IdentityAvatar, roomMembersForAvatar, SystemNotice } from "./messenger-primitives.tsx";

export function MessengerMessage({
  message,
  roles,
  room,
  showTimestamp,
}: {
  message: RealmMessage;
  roles: RoleSummary[];
  room?: Room;
  showTimestamp: boolean;
}) {
  const { locale, t } = useI18n();
  const author = displayNameForIdentity(message.displayedAuthorId, roles);
  const from = message.displayedAuthorId === "owner" ? "user" : "assistant";
  const isOwner = message.displayedAuthorId === "owner";
  const isGod = message.displayedAuthorId === "god";
  const visibleTo = room ? roomMembersForAvatar(room, roles).map((member) => member.id) : ["owner"];

  if (isGod) {
    return <SystemNotice title={t("common.god")} body={message.content} />;
  }

  return (
    <>
      {showTimestamp ? (
        <time className="mx-auto my-2 rounded-full px-2 py-0.5 text-[12px] text-[#9a9a9d] tabular-nums">
          {formatTimelineTimestamp(message.createdAt, locale)}
        </time>
      ) : null}
      <article
        className={cn(
          "group/message flex w-full items-start gap-3",
          isOwner ? "justify-end" : "justify-start",
        )}
        data-author={from}
        data-message-id={message.id}
      >
        {!isOwner ? (
          <IdentityAvatar
            identity={message.displayedAuthorId}
            label={author}
            roles={roles}
            size="lg"
          />
        ) : null}
        <div
          className={cn(
            "min-w-0 max-w-[76%] md:max-w-[55%] xl:max-w-[52%]",
            isOwner && "text-right",
          )}
        >
          {!isOwner ? (
            <div className="sr-only">
              <span className="truncate">{author}</span>
              {message.realOperatorId ? (
                <span className="sr-only">via {message.realOperatorId}</span>
              ) : null}
            </div>
          ) : null}
          <div className="relative inline-block max-w-full">
            <div
              className={cn(
                "relative inline-block max-w-full rounded-[4px] px-[14px] py-[8px] text-left text-[16px] leading-[1.45]",
                "before:absolute before:top-[14px] before:h-0 before:w-0 before:border-y-[5px] before:border-y-transparent",
                isOwner
                  ? "bg-[var(--realm-bubble-outgoing)] text-[#10210a] before:right-[-7px] before:border-l-[7px] before:border-l-[var(--realm-bubble-outgoing)]"
                  : "bg-white text-[var(--realm-fg)] before:left-[-7px] before:border-r-[7px] before:border-r-white",
              )}
              data-testid="message-bubble"
            >
              <p className="relative whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          </div>
          <div
            className={cn(
              "mt-1.5 flex max-w-full",
              isOwner ? "justify-end pr-1" : "justify-start pl-1",
            )}
            data-testid="message-visibility"
          >
            <VisibilityChips maxVisible={2} roleIds={visibleTo} roles={roles} />
          </div>
        </div>
        {isOwner ? (
          <IdentityAvatar identity="owner" label={author} roles={roles} size="lg" />
        ) : null}
      </article>
    </>
  );
}

export function shouldShowMessageTime(message: RealmMessage, previous?: RealmMessage): boolean {
  if (!previous) {
    return true;
  }
  const currentTime = new Date(message.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  if (Number.isNaN(currentTime) || Number.isNaN(previousTime)) {
    return false;
  }
  return currentTime - previousTime > 5 * 60 * 1000;
}

function formatTimelineTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const dateLocale = locale === "zh-CN" ? "zh-CN" : undefined;
  return date.toLocaleString(dateLocale, {
    weekday: locale === "zh-CN" ? "long" : "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "zh-CN" ? false : undefined,
  });
}
