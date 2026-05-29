import type { Message as RealmMessage, RoleSummary, Room } from "@realm/api-contract";
import { Clipboard, Eye, Info } from "lucide-react";
import { VisibilityChips } from "@/components/messenger/visibility-chips.tsx";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import { IdentityAvatar, roomMembersForAvatar, SystemNotice } from "./messenger-primitives.tsx";

export function MessengerMessage({
  message,
  roles,
  room,
  showTimestamp,
  viewerIdentity = "owner",
  isNew = false,
}: {
  message: RealmMessage;
  roles: RoleSummary[];
  room?: Room;
  showTimestamp: boolean;
  /**
   * The logged-in account's perspective. Messages from this account are
   * right-aligned with the green outgoing bubble; everyone else is left. This
   * is the literal "different role's perspective" account switch (spec §7.2).
   */
  viewerIdentity?: string;
  /** True only for arrivals after first paint, so history never animates in. */
  isNew?: boolean;
}) {
  const { locale, t } = useI18n();
  // Localized labels for the protocol-id pseudo-identities so the most-looked-at
  // surface (avatar monogram, sr-only author/via line, Inspect popover) never
  // leaks the raw English defaults ("Boss"/"God") in the zh-CN UI.
  const labels = { god: t("common.god"), owner: t("common.boss") };
  const author = displayNameForIdentity(message.displayedAuthorId, roles, labels);
  const isGod = message.displayedAuthorId === "god";
  const isOwner = message.displayedAuthorId === viewerIdentity && !isGod;
  const from = isOwner ? "user" : "assistant";
  const visibleTo = room
    ? roomMembersForAvatar(room, roles, labels).map((member) => member.id)
    : ["owner"];
  // Humanize the real operator id (e.g. "owner"/"leijun") for the sr-only "via"
  // line — screen readers must hear the resolved name, never the protocol id.
  const operatorName = message.realOperatorId
    ? displayNameForIdentity(message.realOperatorId, roles, labels)
    : undefined;

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
              {operatorName ? (
                <span className="sr-only">
                  {t("common.via")} {operatorName}
                </span>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              "relative inline-block max-w-full",
              isNew && "realm-bubble-in",
              isNew && (isOwner ? "realm-bubble-in-out" : "realm-bubble-in-in"),
            )}
          >
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
                authorName={author}
                content={message.content}
                copyLabel={t("message.copy")}
                createdAt={message.createdAt}
                inspectLabel={t("message.actionInspect")}
                locale={locale}
                realOperatorId={message.realOperatorId}
                roleIds={visibleTo}
                roles={roles}
              />
            </div>
          </div>
        </div>
        {isOwner ? (
          <IdentityAvatar
            identity={message.displayedAuthorId}
            label={author}
            roles={roles}
            size="lg"
          />
        ) : null}
      </article>
    </>
  );
}

function MessageBubbleTools({
  align,
  authorName,
  content,
  copyLabel,
  createdAt,
  inspectLabel,
  locale,
  realOperatorId,
  roleIds,
  roles,
}: {
  align: "left" | "right";
  authorName: string;
  content: string;
  copyLabel: string;
  createdAt: string;
  inspectLabel: string;
  locale: string;
  realOperatorId?: string;
  roleIds: string[];
  roles: RoleSummary[];
}) {
  const toolButton =
    "flex size-6 items-center justify-center rounded-[3px] hover:bg-[#f1f1f2] focus-visible:outline-2 focus-visible:outline-[#07c160] focus-visible:outline-offset-1";

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
        className={toolButton}
        onClick={() => void navigator.clipboard?.writeText(content)}
        type="button"
      >
        <Clipboard className="size-3.5" />
      </button>
      <Popover>
        <PopoverTrigger
          aria-label={inspectLabel}
          className={toolButton}
          data-testid="message-inspect"
          type="button"
        >
          <Info className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align={align === "right" ? "end" : "start"} className="w-64">
          <MessageInspectPanel
            authorName={authorName}
            createdAt={createdAt}
            locale={locale}
            realOperatorId={realOperatorId}
            roleIds={roleIds}
            roles={roles}
          />
        </PopoverContent>
      </Popover>
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

/**
 * Per-message provenance/visibility detail. Shows the displayed author, the real
 * operator when it differs (identity-takeover audit), the created time, and who
 * can see the message. We intentionally do NOT show a turn trace: the Message
 * model has no message→turn linkage (see REPORTED GAP in the implementation
 * note), so any "trace lines" would be fabricated.
 */
function MessageInspectPanel({
  authorName,
  createdAt,
  locale,
  realOperatorId,
  roleIds,
  roles,
}: {
  authorName: string;
  createdAt: string;
  locale: string;
  realOperatorId?: string;
  roleIds: string[];
  roles: RoleSummary[];
}) {
  const { t } = useI18n();
  const labels = { god: t("common.god"), owner: t("common.boss") };
  // Real operator only matters when it diverges from the displayed author —
  // that is the identity-takeover case the audit copy warns about.
  const operatorName = realOperatorId
    ? displayNameForIdentity(realOperatorId, roles, labels)
    : undefined;
  const showOperator = Boolean(operatorName && operatorName !== authorName);

  return (
    <div className="flex flex-col gap-2" data-testid="message-inspect-panel">
      <PopoverHeader>
        <PopoverTitle className="text-[13px]">{t("workspace.speaking")}</PopoverTitle>
        <p className="text-[13px] text-[var(--realm-fg)]">{authorName}</p>
      </PopoverHeader>
      {showOperator ? (
        <p className="text-[12px] text-[#6e6e73]" data-testid="message-inspect-operator">
          <span className="font-medium text-[var(--realm-fg)]">{t("workspace.realOperator")}</span>{" "}
          <span>
            {t("common.via")} {operatorName}
          </span>
        </p>
      ) : null}
      <p className="text-[12px] text-[#6e6e73] tabular-nums">
        {formatTimelineTimestamp(createdAt, locale)}
      </p>
      <div className="border-[#eeeeef] border-t pt-2">
        <VisibilityChips maxVisible={6} roleIds={roleIds} roles={roles} />
      </div>
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
