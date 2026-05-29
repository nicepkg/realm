import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";
import {
  applyMention,
  detectMentionTrigger,
  filterMentionCandidates,
  type MentionCandidate,
  type MentionTrigger,
  mentionCandidates,
  resizeComposer,
} from "./composer-mentions.ts";
import { MentionPopover, ReadOnlyHint } from "./composer-parts.tsx";
import { EmojiPicker } from "./emoji-picker.tsx";
import {
  canRunRoleTurn,
  RoleTurnActionGroup,
  roleIsMemberOfRoom,
  runTurnBlockReason,
} from "./role-turn-action.tsx";
import { useProjectTrust } from "./use-project-trust.ts";

/**
 * Bottom composer. The Send button is ALWAYS rendered: muted+disabled when
 * there is no sendable draft, WeChat green when there is. Clicking it submits;
 * Enter submits; Shift+Enter inserts a newline. This is the direct fix for
 * "发消息全无响应" — the primary control is now unmissable and never hidden.
 *
 * Typing "@" opens a mention popover of the room's role members; arrow keys
 * navigate, Enter/Tab/click inserts "@<displayName> " at the caret, Escape
 * closes. The popover only assists drafting — it never changes how sends work.
 */
export function Composer({ app, onOpenGod }: { app: RealmAppController; onOpenGod: () => void }) {
  const { t, locale } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const trust = useProjectTrust(app);

  // The God/adjudication channel is not a chat: if it is ever the active room,
  // suppress the live composer and route operators to the God controller.
  const isGodChannel = app.selectedRoom?.type === "god-channel";
  const isImpersonating = app.viewerIdentity !== "owner";
  // MC-R4-1: send-as-role obeys the SAME room-membership constraint as run-turn —
  // you can never speak as a role into a room it does not belong to. The owner
  // (non-impersonating) operator is always allowed; god is blocked elsewhere.
  // Reuses the shared `roleIsMemberOfRoom` predicate so the send path and the
  // run-turn path name the EXACT same rule (Don Norman: constraints + consistency).
  const identityIsMember =
    !isImpersonating ||
    (app.selectedRoom
      ? roleIsMemberOfRoom(app, { id: app.viewerIdentity }, app.selectedRoom)
      : false);
  // Read-only projects can view but never write: Send AND Run are gated before
  // they can fire by accident (MC-2 / Don Norman: constraints + error prevention).
  const canSend =
    Boolean(app.selectedRoom && app.draft.trim()) && !trust.isReadOnly && identityIsMember;
  // Surface the inline run-turn affordance whenever a turn needs in-context
  // attention (running → Cancel, error → Retry).
  const isTurnInFlight = app.turnRun.status === "running" || app.turnRun.status === "error";
  // DISC-R7-1: a populated room must carry a STANDING run affordance — the
  // empty-room CTA only covers the empty case. Once a room has messages, the
  // empty CTA is gone, so the composer becomes the home of the run control.
  // It is rendered only when the room is non-empty so it never doubles up with
  // RoleTurnEmptyCta in the timeline (shared gate, item 5).
  const roomIsPopulated = app.state.status === "ready" && app.state.messages.length > 0;
  const canRun = canRunRoleTurn(app, trust.isReadOnly);
  // When a role genuinely cannot run (not a member / no selection), name the
  // constraint instead of hiding the affordance silently (Don Norman: feedback).
  const idleRunBlockReason = runTurnBlockReason(app, trust.isReadOnly, locale);
  const showIdleRun = !isTurnInFlight && roomIsPopulated;
  // The ONLY blocker is non-membership when everything else that would let an
  // impersonated role send is satisfied — so we can name WHY the green button is
  // withheld instead of leaving a silently-disabled control (Don Norman: feedback).
  const sendBlockedByMembership = Boolean(
    isImpersonating &&
      app.selectedRoom &&
      app.draft.trim() &&
      !trust.isReadOnly &&
      !identityIsMember,
  );
  const notMemberReason =
    locale === "zh-CN" ? "该角色不在当前房间" : "This role is not in the current room";
  const accountLabel = isImpersonating
    ? displayNameForIdentity(app.viewerIdentity, app.state.roles)
    : t("workspace.bossPersona");
  const sendLabel = isImpersonating
    ? t("workspace.sendAsRole")(accountLabel)
    : t("workspace.sendAsBoss");

  const candidates = useMemo(
    () => mentionCandidates(app.selectedRoom, app.state.roles),
    [app.selectedRoom, app.state.roles],
  );
  const matches = useMemo(
    () => (mention ? filterMentionCandidates(candidates, mention.query) : []),
    [candidates, mention],
  );
  const mentionOpen = mention !== null;

  useEffect(() => {
    resizeComposer(inputRef.current, app.draft.length);
  }, [app.draft.length]);

  // Keep the highlighted option valid as the filtered list shrinks/grows.
  useEffect(() => {
    setActiveIndex((current) => (current >= matches.length ? 0 : current));
  }, [matches.length]);

  function syncMention(value: string, caret: number) {
    setMention(detectMentionTrigger(value, caret));
    setActiveIndex(0);
  }

  function closeMention() {
    setMention(null);
    setActiveIndex(0);
  }

  function chooseMention(candidate: MentionCandidate) {
    if (!mention) {
      return;
    }
    const next = applyMention(app.draft, mention, candidate);
    app.setDraft(next.value);
    closeMention();
    const textarea = inputRef.current;
    if (textarea) {
      // Restore focus + caret after React commits the new value.
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(next.caret, next.caret);
        resizeComposer(textarea);
      });
    }
  }

  /**
   * Insert `emoji` at the textarea caret (replacing any selection) and place the
   * caret right after it, so the picker behaves like real typing rather than the
   * old stub that blindly appended a single fixed face to the end of the draft.
   */
  function insertEmoji(emoji: string) {
    const textarea = inputRef.current;
    const value = app.draft;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    const caret = start + emoji.length;
    app.setDraft(next);
    if (textarea) {
      // Restore the caret after React commits the new value.
      requestAnimationFrame(() => {
        textarea.setSelectionRange(caret, caret);
        resizeComposer(textarea);
      });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    await app.sendMessage(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && matches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const candidate = matches[activeIndex];
        if (candidate) {
          event.preventDefault();
          chooseMention(candidate);
          return;
        }
      }
    }
    if (mentionOpen && event.key === "Escape") {
      event.preventDefault();
      closeMention();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  if (isGodChannel) {
    return (
      <footer
        className="shrink-0 border-[var(--realm-line)] border-t bg-[var(--realm-surface)] px-4 py-3"
        data-god-channel="true"
        data-testid="composer"
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#fcfbf8] px-4 py-3 text-[#5a4a1f] text-[13px]"
          data-testid="god-channel-notice"
        >
          <span>{t("workspace.godRoomNotChat")}</span>
          <Button
            className="h-8 bg-[#efe7d4] px-3 text-[#5a4a1f] hover:bg-[#e7dcc2]"
            data-testid="god-channel-open"
            onClick={onOpenGod}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("workspace.godController")}
          </Button>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="shrink-0 border-[var(--realm-line)] border-t bg-[var(--realm-surface)]"
      data-testid="composer"
    >
      <form className="w-full" onSubmit={submit}>
        {trust.isReadOnly ? <ReadOnlyHint trust={trust} /> : null}
        <div className="relative flex items-end gap-2 px-3 py-2.5">
          {mentionOpen ? (
            <MentionPopover
              activeIndex={activeIndex}
              matches={matches}
              onChoose={chooseMention}
              onHover={setActiveIndex}
              roles={app.state.roles}
            />
          ) : null}
          <EmojiPicker inputRef={inputRef} onInsert={insertEmoji} />
          {/* DISC-R7-1: a populated room always carries the run-turn control so
              "run a role turn" is discoverable without docs (Don Norman:
              discoverability + mapping — it sits next to the chat it acts on).
              While a turn is running/errored we surface Cancel/Retry inline; when
              idle and runnable we show the calm green named run button; when a
              role cannot run we NAME the constraint rather than hiding silently
              (Don Norman: feedback). Read-only is already explained by the
              ReadOnlyHint banner above, so we don't double-message it here. The
              empty-room case is owned by RoleTurnEmptyCta in the timeline, hence
              the roomIsPopulated gate keeps the two from doubling up. */}
          {isTurnInFlight ? (
            <div className="flex shrink-0 items-center" data-testid="composer-run-turn">
              <RoleTurnActionGroup app={app} readOnly={trust.isReadOnly} variant="row" />
            </div>
          ) : showIdleRun && canRun ? (
            <div className="flex shrink-0 items-center" data-testid="composer-run-turn">
              <RoleTurnActionGroup app={app} readOnly={trust.isReadOnly} variant="row" />
            </div>
          ) : showIdleRun && !trust.isReadOnly && idleRunBlockReason ? (
            <span
              className="max-w-[14rem] shrink-0 self-center truncate text-[12px] text-[var(--realm-fg-muted)]"
              data-testid="composer-run-turn-block"
              role="note"
              title={idleRunBlockReason}
            >
              {idleRunBlockReason}
            </span>
          ) : null}
          <textarea
            aria-activedescendant={
              mentionOpen && matches[activeIndex]
                ? `composer-mention-option-${matches[activeIndex].id}`
                : undefined
            }
            aria-autocomplete="list"
            aria-controls={mentionOpen ? "composer-mention-popover" : undefined}
            aria-expanded={mentionOpen}
            aria-label={t("workspace.messageInput")}
            role="combobox"
            className="max-h-32 min-h-[40px] min-w-0 flex-1 resize-none rounded-[8px] bg-[var(--realm-surface-muted)] px-3 py-[9px] text-[15px] leading-[22px] outline-none placeholder:text-[var(--realm-fg-faint)] focus-visible:!ring-0"
            data-testid="message-input"
            disabled={!app.selectedRoom}
            name="message"
            onBlur={closeMention}
            onChange={(event) => {
              app.setDraft(event.currentTarget.value);
              syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
            }}
            onClick={(event) =>
              syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
            }
            onInput={(event) => resizeComposer(event.currentTarget)}
            onKeyDown={handleKeyDown}
            placeholder={t("workspace.messageInput")}
            ref={inputRef}
            rows={1}
            value={app.draft}
          />
          {/* MC-R4-1: when membership is the only thing withholding Send, NAME the
              constraint next to the button (mirrors composer-run-turn-block) so the
              disabled green button is never an unexplained dead control. The button
              stays disabled via canSend; this chip says WHY. */}
          {sendBlockedByMembership ? (
            <span
              className="max-w-[14rem] shrink-0 self-center truncate text-[12px] text-[var(--realm-fg-muted)]"
              data-testid="composer-send-block"
              role="note"
              title={notMemberReason}
            >
              {notMemberReason}
            </span>
          ) : null}
          <Button
            aria-disabled={!canSend}
            className={cn(
              "h-9 shrink-0 rounded-[8px] px-4 text-[14px]",
              canSend
                ? "bg-[var(--realm-green)] text-white hover:bg-[var(--realm-green-strong)]"
                : "bg-[var(--realm-surface-muted)] text-[var(--realm-fg-faint)]",
              isImpersonating && canSend && "bg-[var(--realm-impersonate)] hover:bg-[#e6850e]",
            )}
            data-testid="composer-send"
            disabled={!canSend}
            type="submit"
          >
            {canSend ? sendLabel : t("common.send")}
          </Button>
        </div>
      </form>
    </footer>
  );
}
