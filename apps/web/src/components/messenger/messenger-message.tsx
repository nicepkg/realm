import type { Message as RealmMessage, RoleSummary, Room } from "@realm/api-contract";
import { Clipboard, Eye } from "lucide-react";
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
        <time className="mx-auto my-3 px-2 py-0.5 text-[13px] text-[#9a9a9d] tabular-nums">
          {formatTimelineTimestamp(message.createdAt, locale)}
        </time>
      ) : null}
      <article
        className={cn(
          "group/message flex w-full items-start gap-3 px-0.5",
          isOwner ? "justify-end" : "justify-start",
        )}
        data-author={from}
        data-has-avatar="true"
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
            "min-w-0 max-w-[74%] md:max-w-[58%] xl:max-w-[54%]",
            isOwner && "text-right",
          )}
        >
          {!isOwner ? (
            <div className="sr-only">
              <span className="truncate">{author}</span>
              {message.realOperatorId ? (
                <span className="sr-only">
                  {t("common.via")} {message.realOperatorId}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="relative inline-block max-w-full">
            <div
              className={cn(
                "relative inline-block min-h-[42px] max-w-full rounded-[4px] px-[15px] py-[9px] text-left text-[16px] leading-[1.45] shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                "before:absolute before:top-[14px] before:h-0 before:w-0 before:border-y-[5px] before:border-y-transparent",
                isOwner
                  ? "bg-[var(--realm-bubble-outgoing)] text-[#10210a] before:right-[-7px] before:border-l-[7px] before:border-l-[var(--realm-bubble-outgoing)]"
                  : "bg-white text-[var(--realm-fg)] before:left-[-7px] before:border-r-[7px] before:border-r-white",
              )}
              data-testid="message-bubble"
            >
              <p className="relative whitespace-pre-wrap break-words">{message.content}</p>
              <MessageBubbleTools
                align={isOwner ? "right" : "left"}
                content={message.content}
                copyLabel={t("message.copy")}
                roleIds={visibleTo}
                roles={roles}
              />
            </div>
          </div>
        </div>
        {isOwner ? (
          <IdentityAvatar identity="owner" label={author} roles={roles} size="lg" />
        ) : null}
      </article>
    </>
  );
}

function MessageBubbleTools({
  align,
  content,
  copyLabel,
  roleIds,
  roles,
}: {
  align: "left" | "right";
  content: string;
  copyLabel: string;
  roleIds: string[];
  roles: RoleSummary[];
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-full z-10 mb-1 flex items-center gap-1 rounded-[4px] bg-white/95 px-1.5 py-1 text-[#606066] text-[11px] opacity-0 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition focus-within:pointer-events-auto focus-within:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100",
        align === "right" ? "right-0" : "left-0",
      )}
      data-testid="message-bubble-tools"
    >
      <button
        aria-label={copyLabel}
        className="flex size-6 items-center justify-center rounded-[3px] hover:bg-[#f1f1f2] focus-visible:outline-2 focus-visible:outline-[#07c160] focus-visible:outline-offset-1"
        onClick={() => void navigator.clipboard?.writeText(content)}
        type="button"
      >
        <Clipboard className="size-3.5" />
      </button>
      <span
        className="flex items-center gap-1 border-[#eeeeef] border-l pl-1"
        data-testid="message-visibility"
      >
        <Eye className="size-3.5" />
        <VisibilityChips maxVisible={2} roleIds={roleIds} roles={roles} />
      </span>
    </div>
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
