import type { RoleSummary, StatePatchResult } from "@realm/api-contract";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.tsx";
import { Shimmer } from "@/components/ai-elements/shimmer.tsx";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";
import { MessengerMessage, shouldShowMessageTime } from "./messenger-message.tsx";
import { IdentityAvatar, SystemNotice } from "./messenger-primitives.tsx";
import { formatElapsedSeconds, RoleTurnEmptyCta } from "./role-turn-action.tsx";
import { useProjectTrust } from "./use-project-trust.ts";

/**
 * Scrollable chat timeline. Adapts the AI-elements Conversation/Message stack to
 * Realm: alignment follows the viewer account, optimistic pending bubbles and a
 * recoverable send-error surface preserve the full send state cycle, and God
 * results render as in-timeline notices. Streaming must not shift layout.
 */
export function MessageTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const trust = useProjectTrust(app);
  const isEmpty =
    app.state.status === "ready" && app.state.messages.length === 0 && app.selectedRoom;

  // FB-1: a running turn only belongs in THIS timeline when it targets the
  // active world+room. A turn started elsewhere never paints a phantom bubble
  // here. The same scoping decides whether the error/retry surfaces inline.
  const turnInRoom =
    app.turnRun.roomId === app.selectedRoom?.id && app.turnRun.worldId === app.selectedWorld?.id;
  const showRunningBubble = app.turnRun.status === "running" && turnInRoom;
  const showTurnError = app.turnRun.status === "error" && turnInRoom;
  const runningRole = app.state.roles.find((role) => role.id === app.turnRun.roleId);

  // FB-3: a God ruling is scoped to the world it was issued in. Drop a stale
  // notice the instant the operator switches to an unrelated world so a ruling
  // never bleeds across worlds.
  const showGodResult = app.godActionResult?.worldId === app.selectedWorld?.id;

  // Track which message ids have already been painted so only genuine new
  // arrivals animate in. On first mount we seed every current id (history must
  // not animate); later ids are unseen → they play the entrance once.
  const seenIdsRef = useRef<Set<string> | null>(null);
  if (seenIdsRef.current === null) {
    seenIdsRef.current = new Set(app.state.messages.map((message) => message.id));
  }
  const seenIds = seenIdsRef.current;

  return (
    <Conversation className="min-h-0 flex-1 bg-[var(--realm-bg)]" data-testid="chat-stream">
      <ConversationContent className="min-h-full gap-3 px-4 py-4 md:px-6">
        {app.state.status === "loading" ? (
          <ConversationEmptyState
            title={t("common.loading")}
            description={t("manager.projectHint")}
          />
        ) : null}
        {app.state.status === "error" ? <ConnectionErrorBanner app={app} /> : null}
        {isEmpty ? (
          <div className="realm-rise flex flex-col items-center gap-3">
            <ConversationEmptyState
              title={t("workspace.emptyChat")}
              description={t("workspace.noMessages")}
            />
            {/* DISC-1: name the safe next action in an empty room — run the
                selected role through the same gated preview. */}
            <RoleTurnEmptyCta app={app} readOnly={trust.isReadOnly} />
          </div>
        ) : null}
        {app.state.messages.map((message, index) => {
          const previous = app.state.messages[index - 1];
          const isNew = !seenIds.has(message.id);
          if (isNew) {
            seenIds.add(message.id);
          }
          return (
            <MessengerMessage
              isNew={isNew}
              key={message.id}
              message={message}
              roles={app.state.roles}
              room={app.selectedRoom}
              showTimestamp={shouldShowMessageTime(message, previous)}
              viewerIdentity={app.viewerIdentity}
            />
          );
        })}
        {showRunningBubble ? (
          <RunningTurnBubble
            elapsedFrom={app.turnRun.startedAt}
            onCancel={() => void app.cancelActiveTurn()}
            cancelDisabled={!app.turnRun.turnId}
            role={runningRole}
            roles={app.state.roles}
            streamedText={app.turnRun.streamedText}
          />
        ) : showTurnError ? (
          <TurnErrorBubble
            error={app.turnRun.error}
            onDismiss={app.clearTurnError}
            onRetry={() => void app.runSelectedRoleTurn()}
            role={runningRole}
            roles={app.state.roles}
            trustRelated={app.turnRun.trustRelated}
          />
        ) : null}
        {showGodResult && app.godActionResult ? (
          <GodResultNotice result={app.godActionResult.result} />
        ) : null}
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
 * God/admin adjudication result rendered as an in-timeline notice. The treatment
 * is status-honest (Don Norman: feedback must report the real outcome, never a
 * false success). It mirrors GodResultPanel's branching exactly:
 *  - committed → green success carrying world-wide visibility + audit reference.
 *  - duplicate → neutral "state unchanged (idempotent)" — NO green visible/audit
 *    line, because nothing changed for the world to see.
 *  - rejected  → amber/danger "ruling did not take effect" + the rejection
 *    reason + a pointer back to the 上帝控制器 so the operator can recover. The
 *    green visibility/audit line is never shown.
 */
function GodResultNotice({ result }: { result: StatePatchResult }) {
  const { t } = useI18n();
  const status = result.status;

  if (status === "rejected") {
    return (
      <div
        className="mx-auto max-w-[680px] rounded-[10px] bg-[#fff4e5] px-3 py-2 text-center text-[12px] text-[#7a4a00]"
        data-status="rejected"
        data-testid="god-result-notice"
        role="alert"
      >
        <span className="font-medium">{t("god.resultRejectedTitle")}</span>
        {result.reason ? <span>: {result.reason}</span> : null}
        <div className="mt-0.5 text-[#9a6400]">{t("god.resultRejectedBody")}</div>
      </div>
    );
  }

  if (status === "duplicate") {
    return (
      <div data-status="duplicate" data-testid="god-result-notice">
        <SystemNotice body={t("god.resultDuplicateBody")} title={t("god.resultDuplicateTitle")} />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-[680px] rounded-full bg-[#e8f6ee] px-3 py-1.5 text-center text-[12px] text-[#087a43]"
      data-status="committed"
      data-testid="god-result-notice"
    >
      <span className="font-medium">{t("god.resultTitle")}</span>
      {": "}
      {`${t("god.resultVisibility")}: ${t("god.resultVisibilityWorld")} · ${t("god.resultAudit")}`}
    </div>
  );
}

/**
 * In-timeline streaming feedback (FB-1 / FB-401). While a role turn runs against
 * THIS room we paint a left-aligned assistant bubble using the running role's
 * avatar. Before the first token arrives it shows the Shimmer placeholder; once
 * live `turn.delta` tokens stream in (`streamedText`) the bubble body shows the
 * answer forming in place — the real token text, not an opaque "thinking…". A
 * live elapsed counter + inline Cancel stay available throughout. The body's
 * min-height is reserved so the bubble never collapses/jumps as tokens append
 * (taste rule: streaming must not shift layout). reduced-motion is handled by
 * Shimmer and the bubble entrance honors the global reduced-motion guard.
 */
function RunningTurnBubble({
  cancelDisabled,
  elapsedFrom,
  onCancel,
  role,
  roles,
  streamedText,
}: {
  cancelDisabled: boolean;
  elapsedFrom: string | undefined;
  onCancel: () => void;
  role: RoleSummary | undefined;
  roles: RoleSummary[];
  streamedText: string | undefined;
}) {
  const { t } = useI18n();
  const elapsed = useLiveElapsed(elapsedFrom);
  const hasTokens = Boolean(streamedText && streamedText.length > 0);
  return (
    <article
      className="realm-bubble-in flex w-full items-start gap-2 px-0.5"
      data-streaming={hasTokens ? "tokens" : "thinking"}
      data-testid="turn-running-bubble"
    >
      <IdentityAvatar identity={role?.id} label={role?.displayName} roles={roles} size="sm" />
      <div className="min-w-0 max-w-[74%] md:max-w-[58%]">
        <div className="flex min-h-[42px] flex-col gap-1.5 rounded-[4px] bg-white px-[14px] py-[9px] shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          {hasTokens ? (
            // Live answer forming in place. Keep the bubble's own min-height so the
            // very first token does not snap the layout; tokens then append below.
            <p
              className="whitespace-pre-wrap break-words text-[15px] text-[var(--realm-fg)] leading-[1.45]"
              data-testid="turn-streamed-text"
            >
              {streamedText}
            </p>
          ) : (
            <Shimmer className="text-[15px] leading-[1.45]" duration={1.6}>
              {t("workspace.turnThinking")}
            </Shimmer>
          )}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[12px] text-[var(--realm-fg-faint)] tabular-nums">
              {elapsed}
            </span>
            <Button
              aria-label={t("common.cancel")}
              className="ml-auto h-7 shrink-0 gap-1 rounded-[7px] px-2 text-[12px] text-[var(--realm-fg-muted)] hover:bg-[var(--realm-surface-muted)] hover:text-[var(--realm-fg)]"
              data-testid="turn-running-cancel"
              disabled={cancelDisabled}
              onClick={onCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Failure surfaced at the SAME in-timeline position the running bubble held, so
 * the operator's eye does not have to hunt for what happened (Don Norman:
 * mapping + recovery). Trust/policy failures point at the recovery path; retry
 * and dismiss live right here.
 */
function TurnErrorBubble({
  error,
  onDismiss,
  onRetry,
  role,
  roles,
  trustRelated,
}: {
  error: string | undefined;
  onDismiss: () => void;
  onRetry: () => void;
  role: RoleSummary | undefined;
  roles: RoleSummary[];
  trustRelated?: boolean;
}) {
  const { t } = useI18n();
  return (
    <article
      className="realm-bubble-in flex w-full items-start gap-2 px-0.5"
      data-testid="turn-error-bubble"
      role="alert"
    >
      <IdentityAvatar identity={role?.id} label={role?.displayName} roles={roles} size="sm" />
      <div className="min-w-0 max-w-[74%] space-y-2 md:max-w-[58%]">
        <div className="min-h-[42px] rounded-[8px] bg-[#ffe2dd] px-[14px] py-[9px] text-[14px] text-[#7a2018] leading-[1.45]">
          <p className="font-medium">{t("workspace.roleTurnFailed")}</p>
          <p className="mt-0.5 break-words text-[13px]">
            {error ?? (trustRelated ? t("roleTurn.failedReadOnly") : t("roleTurn.failedGeneric"))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="turn-error-retry" onClick={onRetry} size="sm" type="button">
            {t("common.retry")}
          </Button>
          <Button
            data-testid="turn-error-dismiss"
            onClick={onDismiss}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("common.dismiss")}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Tick a 1s elapsed clock while a turn runs; idle when there is no start time. */
function useLiveElapsed(startedAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return formatElapsedSeconds(startedAt, now);
}

/** Optimistic outgoing bubble: muted while pending, marked when it has failed. */
function PendingBubble({ content, status }: { content: string; status: "pending" | "failed" }) {
  const { t } = useI18n();
  return (
    <article
      className="realm-bubble-in realm-bubble-in-out flex w-full items-start justify-end px-0.5"
      data-status={status}
      data-testid="pending-message"
    >
      <div className="min-w-0 max-w-[74%] text-right md:max-w-[58%]">
        <div
          className={cn(
            "relative inline-block min-h-[42px] max-w-full rounded-[8px] px-[14px] py-[9px] text-left text-[15px] leading-[1.45] transition-colors",
            status === "failed"
              ? "realm-shake bg-[#ffe2dd] text-[#7a2018]"
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
 * Realm-load / connection failure surface with a Reload action that re-fetches
 * realm state and reconnects the event feed.
 */
function ConnectionErrorBanner({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  return (
    <div
      className="mx-auto w-full max-w-[640px] space-y-2 rounded-md bg-[var(--realm-impersonate-soft)] p-3 text-[#7a4a00] text-[13px]"
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
 * draft, distinguishes read-only/trust failures, and offers retry / copy / dismiss.
 */
function SendErrorBanner({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const isReadOnly = /read-only|raise trust/i.test(app.sendError?.message ?? "");
  return (
    <div
      className="mx-auto w-full max-w-[640px] space-y-2 rounded-md bg-[var(--realm-impersonate-soft)] p-3 text-[#7a4a00] text-[13px]"
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
