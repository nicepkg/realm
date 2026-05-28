import {
  ArrowLeft,
  Command,
  Database,
  Menu,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
  UserCog,
} from "lucide-react";
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
  onOpenRail,
  onOpenSettings,
  onOpenWorldInspector,
}: {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onOpenCommandPalette: () => void;
  onOpenGod: () => void;
  /** Open the conversation rail. On mobile this is the only way to reach the
   * room list / tab bar; on desktop the rail is always visible so it is unused. */
  onOpenRail: () => void;
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
  const isImpersonating = app.identity !== "owner";

  return (
    <>
      {isImpersonating ? (
        <ImpersonationBanner
          displayedAuthor={identityLabel}
          onExitTakeover={() => app.setIdentity("owner")}
          roomName={app.selectedRoom?.name ?? t("common.room")}
          worldName={app.selectedWorld?.name ?? t("common.world")}
        />
      ) : null}
      <header className="relative flex h-[86px] shrink-0 items-center justify-center border-[#d9d9dc] border-b bg-[#f2f2f2] px-4">
        {/* Mobile (<md): the conversation rail is hidden, so the leading button
         * opens it (room list first) instead of jumping back to World Manager. */}
        <Button
          aria-label={t("workspace.openConversations")}
          className="absolute left-5 top-1/2 size-10 -translate-y-1/2 rounded-full text-[#1f1f21] md:hidden"
          data-testid="chat-open-rail"
          onClick={onOpenRail}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Menu className="size-6" />
        </Button>
        {/* Desktop (md+): rail is always present, so the leading button is the
         * back-to-World-Manager affordance. */}
        <Button
          aria-label={t("common.backToWorlds")}
          className="absolute left-5 top-1/2 hidden size-10 -translate-y-1/2 rounded-full text-[#1f1f21] md:inline-flex"
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
          <div
            className="mt-0.5 flex max-w-full items-center justify-center gap-1.5 truncate text-[12px] text-[var(--realm-fg-muted)] leading-4"
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
            <span
              className={cn(
                "truncate",
                app.identity !== "owner" && "font-medium text-[var(--realm-impersonate,#ff9500)]",
              )}
              data-testid="context-identity"
            >
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
    </>
  );
}

function ImpersonationBanner({
  displayedAuthor,
  onExitTakeover,
  roomName,
  worldName,
}: {
  displayedAuthor: string;
  onExitTakeover: () => void;
  roomName: string;
  worldName: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-[#ffd9a0] border-b bg-[#fff4e5] px-4 py-2 text-[#7a4a00] text-[12px]"
      data-testid="impersonation-banner"
      role="status"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <UserCog className="size-4 shrink-0 text-[var(--realm-impersonate,#ff9500)]" />
        {t("workspace.speakingAs")} {displayedAuthor}
      </span>
      <span className="text-[#9a6a20]">
        {t("workspace.realOperator")}: {t("common.boss")}
      </span>
      <span className="text-[#9a6a20]">
        {worldName} · {roomName}
      </span>
      <span className="hidden text-[#9a6a20] sm:inline">{t("workspace.takeoverBannerHint")}</span>
      <Button
        className="ml-auto h-7 rounded-[4px] bg-white px-2.5 text-[#7a4a00] hover:bg-[#ffe8bf]"
        data-testid="exit-takeover"
        onClick={onExitTakeover}
        size="sm"
        type="button"
        variant="secondary"
      >
        {t("workspace.exitTakeover")}
      </Button>
    </div>
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
        {app.state.status === "error" ? <ConnectionErrorBanner app={app} /> : null}
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
        {app.godActionResult ? <GodResultNotice /> : null}
        {app.pendingMessages.map((pending) => (
          <PendingBubble
            content={pending.content}
            key={pending.pendingId}
            status={pending.status}
          />
        ))}
        {app.sendError ? <SendErrorBanner app={app} /> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/**
 * God/admin adjudication result rendered as an in-timeline notice carrying its
 * world-wide visibility and an audit-log reference, so operators see God
 * outcomes in context instead of only in the inspector.
 */
function GodResultNotice() {
  const { t } = useI18n();
  return (
    <div data-testid="god-result-notice">
      <SystemNotice
        title={t("god.resultTitle")}
        body={`${t("god.resultVisibility")}: ${t("god.resultVisibilityWorld")} · ${t("god.resultAudit")}`}
      />
    </div>
  );
}

/** Optimistic outgoing bubble: muted while pending, marked when it has failed. */
function PendingBubble({ content, status }: { content: string; status: "pending" | "failed" }) {
  const { t } = useI18n();
  return (
    <article
      className="flex w-full items-start justify-end px-0.5"
      data-status={status}
      data-testid="pending-message"
    >
      <div className="min-w-0 max-w-[74%] text-right md:max-w-[58%]">
        <div
          className={cn(
            "relative inline-block min-h-[42px] max-w-full rounded-[4px] px-[15px] py-[9px] text-left text-[16px] leading-[1.45]",
            status === "failed"
              ? "bg-[#ffe2dd] text-[#7a2018]"
              : "bg-[var(--realm-bubble-outgoing)] text-[#10210a] opacity-60",
          )}
        >
          <p className="relative whitespace-pre-wrap break-words">{content}</p>
        </div>
        <div className="mt-1 text-[11px] text-[var(--realm-fg-muted)]">
          {status === "failed" ? t("send.failedBadge") : t("send.pending")}
        </div>
      </div>
    </article>
  );
}

/**
 * Realm-load / connection failure surface. Unlike the previous static notice,
 * this is recoverable: it exposes the underlying reason and a Reload action
 * that re-fetches realm state (and reconnects the event feed) instead of
 * leaving the UI stuck in a sticky error state.
 */
function ConnectionErrorBanner({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  return (
    <div
      className="mx-auto w-full max-w-[640px] space-y-2 rounded-md bg-[#fff4e5] p-3 text-[#7a4a00] text-[13px]"
      data-testid="connection-error"
      role="alert"
    >
      <div className="font-medium">{t("workspace.connectionLostTitle")}</div>
      <div>{app.state.error ?? t("workspace.connectionLostBody")}</div>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="connection-error-reload"
          onClick={() => void app.reload()}
          size="sm"
          type="button"
        >
          {t("common.reload")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline send-failure surface near the timeline tail. Preserves the failed
 * draft (carried by the state layer), distinguishes read-only/trust failures
 * from generic ones, and offers Retry / Copy-details / Dismiss without dropping
 * the message silently.
 */
function SendErrorBanner({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const isReadOnly = /read-only|raise trust/i.test(app.sendError?.message ?? "");
  return (
    <div
      className="mx-auto w-full max-w-[640px] space-y-2 rounded-md bg-[#fff4e5] p-3 text-[#7a4a00] text-[13px]"
      data-testid="send-error"
      role="alert"
    >
      <div className="font-medium">{t("send.failedTitle")}</div>
      <div>{isReadOnly ? t("send.failedReadOnly") : t("send.failedGeneric")}</div>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="send-error-retry"
          onClick={() => void app.retrySend()}
          size="sm"
          type="button"
        >
          {t("common.retry")}
        </Button>
        <Button
          data-testid="send-error-copy"
          onClick={() => void navigator.clipboard?.writeText(app.sendErrorDetails())}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("common.copyDetails")}
        </Button>
        <Button
          data-testid="send-error-dismiss"
          onClick={app.dismissSendError}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("common.dismiss")}
        </Button>
      </div>
    </div>
  );
}
