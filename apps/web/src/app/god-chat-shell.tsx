"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  OperatorMessage,
  PromptInput,
  Suggestions,
} from "@/components/ai-elements";
// Imported from the module path (not the barrel) because the barrel does not
// re-export ConversationAutoScroll, and this component owns only this file +
// its test — re-surfacing the already-unit-tested auto-stick affordance here is
// the minimal fix for the "stuck mid-history after send" bug.
import { ConversationAutoScroll } from "@/components/ai-elements/conversation.tsx";
import { WorldPulseGutter } from "@/components/messenger/world-pulse-gutter.tsx";
import { useI18n } from "@/i18n/index.tsx";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import type { UseGodChat } from "@/state/use-god-chat.ts";
// READ-ONLY import (owned by W2): the same world-scoping the hook applies, reused
// here so the rail + sheet receive the active world's MEMBERS — not the raw
// project-wide pool. Without this the surfaces ghost the prior world's cast after
// an NL world-switch into a roleless world (F1).
import { worldScopedRoles } from "@/state/use-god-chat-helpers.ts";
import { worldModeLabel } from "@/view-models/labels.ts";
import {
  defaultGodChatCardStrings,
  GodChatCard,
  type GodChatCardStrings,
} from "./god-chat-cards.tsx";
import {
  defaultGodChatContextRailStrings,
  GodChatContextRail,
  type GodChatContextRailStrings,
} from "./god-chat-context-rail.tsx";
import { GodChatContextSheet } from "./god-chat-context-sheet.tsx";
import { WorldIdentityStrip } from "./god-chat-identity-strip.tsx";
// Pure helpers extracted to keep this shell under the 500-line guard. Imported
// for the in-component `useMemo`s; re-exported below so existing test imports
// (`./god-chat-shell.tsx`) keep their single source.
import {
  buildSuggestions,
  deferAfterSheetClose,
  resolveLivePreviewTurnId,
  streamingDetailLength,
} from "./god-chat-shell-helpers.ts";
import type { RealmAppController } from "./types.ts";

/**
 * GodChatShell — the natural-language-first home screen (nl-first-vision). ONE
 * Apple-flat chat window is the center of gravity: the operator talks to God in
 * plain language to create worlds, set rules, control roles, run turns,
 * adjudicate, and inspect. The world / roles are shown quietly beside the
 * conversation (the lg+ context rail), never as a control wall.
 *
 * Layout:
 *  - top: a compact world-identity strip (world name + mode + provider/model)
 *    with a single small "高级" button. Per nl-first-vision this NO LONGER routes
 *    into the legacy 5-tab messenger/manager (the wall Boss rejected); it opens a
 *    minimal inline context sheet (GodChatContextSheet) — world-state + roles +
 *    at most two precise-tweak entries (command palette / settings).
 *  - center: Conversation rendering the `useGodChat` turns through OperatorMessage,
 *    with inline GodChatCard previews/results dropped into the system turns. The
 *    empty state seeds Suggestions with the vision's zh-CN example prompts.
 *  - bottom: PromptInput wired to the hook's draft / submit.
 *  - beside (lg+): the read-only GodChatContextRail. On small screens the rail is
 *    hidden, so the 高级 sheet is the only path to world-state — never the legacy app.
 *
 * This component owns NO routing, NO backend logic, and NO chat state: it
 * assembles AI Elements and renders the inline cards for a `useGodChat`
 * controller that is owned ABOVE it in AppShell and injected as the `chat` prop.
 * Lifting the controller out is what lets the conversation survive across surface
 * changes (F7). The two precise-tweak callbacks (`onOpenCommandPalette` /
 * `onOpenSettings`) are the only edges back to AppShell-owned overlays; the
 * legacy workspace/manager pages are no longer one tap away.
 */

/** Localized copy for the shell chrome. zh-CN defaults keep it usable before item 6's keys land. */
export type GodChatShellStrings = {
  advanced: string;
  placeholder: string;
  sendLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Shown in the identity strip when no world is selected. */
  noWorld: string;
  /** Shown in the identity strip when running on the mock/fake runtime. */
  mockRuntime: string;
  /**
   * The GENERIC empty-state starter chips — always valid regardless of world
   * scope (create-world, create-role, inspect). The role-CONTROL chip is NOT in
   * here: it is derived at render time from the active world's real members
   * (see {@link buildSuggestions}) so it never references a non-existent role
   * (F2). When the world has ≥1 member, the create-role chip is swapped for a
   * control chip naming the first real member.
   */
  suggestions: { label: string; prompt: string }[];
  /**
   * Template for the role-control chip shown ONLY when the active world has
   * members. `{name}` is replaced with a real member's display name, so the chip
   * never references a ghost role (F2). zh-CN default mirrors the vision's
   * "让<角色>心生退意" example.
   */
  roleControlChip: { label: string; prompt: string };
  cards: GodChatCardStrings;
  rail: GodChatContextRailStrings;
};

export const defaultGodChatShellStrings: GodChatShellStrings = {
  advanced: "高级",
  cards: defaultGodChatCardStrings,
  emptyDescription: "用一句话创造世界、设定规则、操控角色，或问它现在发生了什么。",
  emptyTitle: "对「天道」说点什么",
  mockRuntime: "模拟运行时",
  noWorld: "尚未进入世界",
  placeholder: "对天道说……",
  rail: defaultGodChatContextRailStrings,
  // Template for the role-control chip — only rendered once the world has a real
  // member to name (F2). `{name}` is the first scoped member's display name.
  roleControlChip: {
    label: "让{name}心生退意",
    prompt: "让{name}此刻心生退意",
  },
  sendLabel: "发送",
  // GENERIC always-valid chips. The create-role chip teaches the add-role flow
  // and stays valid in an empty world; the literal "顾辰风" role-control chip was
  // removed — it is now derived from real members at render time (F2).
  suggestions: [
    {
      label: "创建一个修真世界",
      prompt: "创建一个有宗门、对手和师父的修真世界",
    },
    {
      label: "加一个角色",
      prompt: "加一个谨慎、爱钱的炼丹师，叫云遥",
    },
    {
      label: "现在世界什么状态？",
      prompt: "现在世界什么状态？",
    },
  ],
};

type OperatorContext = {
  provider?: string;
  model?: string;
  isMockRuntime: boolean;
};

export type GodChatShellProps = {
  app: RealmAppController;
  /**
   * The god-chat controller, owned by AppShell so the conversation outlives any
   * overlay (F7). GodChatShell is a controlled view over it.
   */
  chat: UseGodChat;
  /** Open the command palette — the power-user precise-control + gated legacy route. */
  onOpenCommandPalette: () => void;
  /** Open the settings sheet (model / runtime / config import-export). */
  onOpenSettings: () => void;
  /** Override any localized string; defaults are zh-CN. */
  strings?: Partial<GodChatShellStrings>;
};

export function GodChatShell({
  app,
  chat,
  onOpenCommandPalette,
  onOpenSettings,
  strings: override,
}: GodChatShellProps) {
  const { t } = useI18n();
  // The 高级 button opens this minimal inline context sheet (world-state + roles
  // + precise tweaks), NOT the legacy messenger/manager. Owned here so the sheet
  // lives with the chat home; the AppShell only supplies the two tweak edges.
  const [contextSheetOpen, setContextSheetOpen] = useState(false);

  // Mobile «高级» sheet → 设置 handoff coordinator (NOT the raw upstream
  // onOpenSettings). The context sheet and the settings sheet are both Radix
  // `Sheet`s; closing one + opening the other in the same tick races the closing
  // Sheet's dismissable-layer + body scroll-lock (`pointer-events: none`)
  // teardown against the new Sheet's mount, pressing settings into an
  // invisible/non-interactive state at 390×844. This shell-owned coordinator is
  // the single ordering authority: close the context Sheet first, open settings
  // only after its layer/scroll-lock unwinds (see deferAfterSheetClose). The
  // context sheet keeps its onRequestClose contract; routing through here makes
  // the final order converge one-directionally. See god-chat-shell-helpers.ts.
  const handleOpenSettingsFromContextSheet = useCallback(() => {
    deferAfterSheetClose(() => setContextSheetOpen(false), onOpenSettings);
  }, [onOpenSettings]);

  const strings = useMemo<GodChatShellStrings>(
    () => ({ ...defaultGodChatShellStrings, ...override }),
    [override],
  );

  // Resolve provider / model / runtime for the identity strip via the SAME
  // read-only SDK pattern the manager uses. Settled so one failing call never
  // blanks the strip; never throws into render.
  const [operator, setOperator] = useState<OperatorContext>({ isMockRuntime: false });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settings, health] = await Promise.allSettled([
        app.client.getSettings(),
        app.client.getHealth(),
      ]);
      if (cancelled) {
        return;
      }
      setOperator({
        isMockRuntime: health.status === "fulfilled" && health.value.runtime.adapterKind === "fake",
        model: settings.status === "fulfilled" ? settings.value.user.defaultModel : undefined,
        provider: settings.status === "fulfilled" ? settings.value.user.defaultProvider : undefined,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [app.client]);

  // World-scope the role list fed to BOTH the rail and the advanced sheet so a
  // just-switched roleless world reads EMPTY, never the prior world's cast (F1).
  // `app.state.roles` is the raw project-wide pool; `worldScopedRoles` narrows it
  // to the selected world's MEMBERS using the SAME presence-flag the hook uses:
  //  - a resolved world  → its `roleIds` members (empty world → []).
  //  - selected-but-unresolved (just-switched / mid-reload) → [] (loading), so it
  //    never falls back to the pool. We reconstruct that flag the same way the hook
  //    does: a present `selectedWorld.id`, else a sentinel when ANY world exists
  //    (selection pending), else undefined (true manager view → full pool).
  //  - genuinely no world selected → the full project roster.
  const scopedRoles = useMemo(() => {
    const selectedWorldId =
      app.selectedWorld?.id ??
      (app.state.worlds.length > 0 ? "__selected-unresolved__" : undefined);
    return worldScopedRoles(app.state.roles, app.selectedWorld, selectedWorldId);
  }, [app.state.roles, app.selectedWorld, app.state.worlds.length]);

  const railContext = useMemo<GodChatContext>(
    () => ({
      roles: scopedRoles,
      roomId: app.selectedRoom?.id,
      rooms: app.state.rooms,
      worldId: app.selectedWorld?.id,
      worldState: app.state.worldState,
    }),
    [
      scopedRoles,
      app.state.rooms,
      app.state.worldState,
      app.selectedRoom?.id,
      app.selectedWorld?.id,
    ],
  );

  // F2 fix: derive the empty-state starter chips from the ACTIVE WORLD's real
  // members instead of the static role-specific chip. In a roleless world the
  // generic create-role chip is shown (valid + teaches the add-role flow); once
  // the world has members the role-control chip names a REAL member, never a
  // ghost like 顾辰风. Recomputed only when the scoped members change.
  const suggestions = useMemo(() => buildSuggestions(scopedRoles, strings), [scopedRoles, strings]);

  const isEmpty = chat.turns.length === 0;
  // The high-risk config patch carries its own typed-confirmation phrase; surface
  // it on the live preview card so the confirm gate matches the backend's rule.
  const confirmationPhrase =
    chat.pendingProposal?.kind === "config"
      ? chat.pendingProposal.proposal.typedConfirmation
      : null;
  // Resolve which single preview card is the LIVE pending one (so the timeline
  // never renders two confirm rows): the last preview turn whose kind matches the
  // pending proposal (the hook clears it + pushes a result card on confirm).
  const livePreviewTurnId = useMemo(
    () => resolveLivePreviewTurnId(chat.turns, chat.pendingProposal?.kind),
    [chat.turns, chat.pendingProposal?.kind],
  );
  // A second auto-scroll signal for IN-PLACE streaming: a streamed role bubble
  // grows its `card.detail` without appending a turn, so `chat.turns.length`
  // stays flat. Feed the live length so the viewport tracks the bottom mid-type.
  const streamSignal = useMemo(() => streamingDetailLength(chat.turns), [chat.turns]);

  return (
    // Wide-screen balance: the rail stays pinned to the viewport's right edge
    // (calm Apple Mail/Notes side-panel) and the chat column is centered over the
    // WHOLE shell width, so at ≥1440 the reading column sits at true horizontal
    // center with the rail flanking it — one balanced composition. `lg:pl-72`
    // reserves the rail's width (w-72 = 288px) as LEFT padding inside the flex-1
    // chat column, shifting its `mx-auto` content right by 144px to land at true
    // center. Dropped below lg, so the mobile single-column hero + docked composer
    // + max-w-4xl measure are untouched. Ultra-wide is gently capped + centered.
    <div
      className="relative mx-auto flex h-dvh max-h-dvh w-full max-w-[1680px] bg-[var(--realm-bg)]"
      data-testid="god-chat-shell"
    >
      {/*
       * F7 ultra-wide gutter. At >=1536px the shell is capped + centered (see
       * styles.css 2xl cap) while the conversation stays at its max-w-4xl reading
       * measure, so the left gutter sits empty. The WorldPulseGutter floats a slim
       * LIVE world-pulse there to make wide screens read as intentional. It is
       * `hidden 2xl:flex` (never appears below 1536px → the converged <1536px
       * layout is pixel-identical) and absolutely pinned to the left edge inside
       * the chat column's lg:pl-72 (288px) gutter, vertically centered, so it never
       * overlaps the centered conversation content (which begins after that pad).
       * It is fed the SAME `railContext` the rail/sheet read, so it updates live as
       * the state version bumps; it renders nothing when no world is active.
       */}
      <WorldPulseGutter
        className="-translate-y-1/2 absolute top-1/2 left-0 z-10 max-h-[80dvh]"
        context={railContext}
        worldName={app.selectedWorld?.name}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
        <WorldIdentityStrip
          advancedLabel={strings.advanced}
          modeLabel={app.selectedWorld ? worldModeLabel(t, app.selectedWorld.mode.type) : undefined}
          onOpenAdvanced={() => setContextSheetOpen(true)}
          operator={operator}
          strings={strings}
          worldName={app.selectedWorld?.name}
        />

        {isEmpty ? (
          // F2 fix: the empty state must NOT live inside <Conversation>. That is
          // a use-stick-to-bottom <StickToBottom> scroll viewport, so an inner
          // `h-full` resolves to the (bottom-stuck) scroll *content* container,
          // not the visible viewport — which dropped the greeting at ~44% height
          // with dead space below. Instead we render it as its OWN flex child of
          // the column: `flex-1 min-h-0` claims exactly the real chat area
          // (viewport − header − composer), and `items-center justify-center`
          // then centers the greeting against that true height. Single-column on
          // mobile (390×844), dead-center on desktop (1440×900); the composer
          // below stays docked with its safe-area padding.
          //
          // True-optical-center: the FOCAL TITLE GROUP (title+description) is the
          // single `justify-center` child, so ITS midpoint lands near the
          // viewport's true vertical center. The suggestions are taken OUT of the
          // centering math via absolute positioning (anchored to the title
          // group's BOTTOM, not a fixed offset) so they never re-bias the title
          // and a wrapped mobile description can never overlap them. The
          // container KEEPS `flex-1 min-h-0 items-center justify-center` (asserted
          // by the empty-state test).
          //
          // R8 optical-center fix: the container KEEPS the asserted
          // `flex-1 min-h-0 items-center justify-center` invariant (no `pt-*`
          // padding, which would tug the title off true center). The optical
          // compensation lives on the title group as a translate that moves it UP.
          // The chips are absolutely anchored to the title group's BOTTOM
          // (`top-full` + `mt-7`), so `justify-center` centers ONLY the title
          // group; but the eye centers on the whole cluster (title + description +
          // chips), whose midpoint sits ~28–32px BELOW the title-group center
          // because the chip block (28px gap + ~32px chip) extends downward with
          // nothing balancing it above. `-translate-y-10` (≈40px UP) lands the
          // COMBINED cluster midpoint on the viewport's true vertical center with
          // balanced blank bands. Measured live ≈50% on both desktop 1440 (1-line
          // description) and mobile 390 (2-line wrapped), chips still clearing the
          // docked composer and within max-w-[90vw]. A translate (not padding) is
          // breakpoint-stable: same optical shift on both sizes.
          <div
            className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"
            data-testid="god-chat-empty"
          >
            <div className="-translate-y-10 relative flex flex-col items-center">
              <div className="space-y-1.5">
                <h2 className="font-medium text-[18px] text-[color:var(--realm-fg)]">
                  {strings.emptyTitle}
                </h2>
                <p className="max-w-md text-[14px] text-[color:var(--realm-fg-muted)] leading-6">
                  {strings.emptyDescription}
                </p>
              </div>
              {/*
               * Suggestions sit just below the optically-centered title group
               * without weighting the centering math: absolutely anchored to the
               * BOTTOM of the title group (top-full) + a calm gap, so a wrapped
               * description (mobile) pushes them down with it instead of being
               * overlapped. We center on the title group's HORIZONTAL AXIS via
               * left-1/2 + -translate-x-1/2 (NOT inset-x-0, which would clamp the
               * row to the narrow title-group width and clip wider chips on
               * desktop). `w-max` lets the row take its natural width, capped by
               * max-w-[90vw] so it never overflows the viewport on mobile.
               */}
              <div className="-translate-x-1/2 absolute top-full left-1/2 mt-7 flex w-max max-w-[90vw] justify-center">
                <Suggestions
                  className="max-w-xl justify-center"
                  items={suggestions}
                  onPick={chat.setDraft}
                />
              </div>
            </div>
          </div>
        ) : (
          // Non-empty: the real scrolling timeline. Only now do we pay for the
          // StickToBottom scroll semantics + the auto-stick/scroll-button
          // affordances — the empty state never enters this scroll flow.
          <Conversation className="min-h-0 flex-1">
            {/*
             * Reading measure: the wide desktop chat column (1152px rail-less)
             * would read edge-to-edge at full bleed, so we cap the conversation
             * at max-w-4xl (~896px) and center it — a calm ~128px gutter each
             * side, NOT stretched. The composer below shares this EXACT measure
             * so the input aligns dead-under the content column.
             */}
            <ConversationContent className="mx-auto w-full max-w-4xl">
              {chat.turns.map((turn, index) => {
                // Fold a system turn's feedback line INTO its result card (one
                // compact block) instead of a separate surface-muted bubble above
                // it. Only a settled `result` card qualifies — a `preview` or
                // `role-speech` card keeps its leading bubble untouched, so
                // create-world / add-role / run-turn never regress. Pure wiring: the
                // card owns the in-frame prefix chrome, OperatorMessage the
                // dropped-bubble + width.
                const foldFeedbackIntoCard =
                  turn.role === "system" && turn.card?.variant === "result" && Boolean(turn.text);
                return (
                  <OperatorMessage
                    cardKind={turn.card?.kind}
                    cardVariant={turn.card?.variant}
                    isNew={index === chat.turns.length - 1}
                    key={turn.id}
                    text={foldFeedbackIntoCard ? undefined : turn.text}
                    variant={turn.role}
                  >
                    {turn.card ? (
                      <GodChatCard
                        busy={chat.busy}
                        card={turn.card}
                        confirmationPhrase={confirmationPhrase}
                        feedbackPrefix={foldFeedbackIntoCard ? turn.text : undefined}
                        isPending={turn.id === livePreviewTurnId}
                        onCancel={chat.cancelProposal}
                        onConfirm={chat.confirmProposal}
                        strings={strings.cards}
                      />
                    ) : null}
                  </OperatorMessage>
                );
              })}
            </ConversationContent>
            {/*
             * Drive the viewport back to the newest content whenever the turn
             * count grows (operator bubble, system reply, preview/result card, or
             * streaming role bubble). This bypasses the use-stick-to-bottom
             * `isAtBottom` false-positive (the manual ConversationScrollButton
             * never appears because isAtBottom is mis-read as true on overflow),
             * actively pinning to the bottom so the operator always sees the
             * fresh reply after a send instead of being stranded mid-history.
             */}
            <ConversationAutoScroll dependency={chat.turns.length} streamSignal={streamSignal} />
            <ConversationScrollButton />
          </Conversation>
        )}

        <div className="border-[color:var(--realm-line)] border-t bg-[var(--realm-bg)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Shares the conversation's max-w-4xl reading measure so the input
              aligns dead-under the content column (same centered gutter). */}
          <div className="mx-auto w-full max-w-4xl">
            <PromptInput
              busy={chat.busy}
              onSubmit={() => void chat.submit()}
              onValueChange={chat.setDraft}
              placeholder={strings.placeholder}
              sendLabel={strings.sendLabel}
              value={chat.draft}
            />
          </div>
        </div>
      </div>

      {/*
       * First-load balance (F3): on an empty conversation the center hero is
       * vertically centered, so the lg+ rail centers its read-only summary too —
       * the two columns then read as one balanced composition instead of leaving
       * a dead lower-right zone. The rail is hidden <lg, so this is lg+-only and
       * never touches the mobile centered hero or the docked composer.
       */}
      <GodChatContextRail centered={isEmpty} context={railContext} strings={strings.rail} />

      {/*
       * The 高级 escape hatch. On mobile it is the ONLY path to world-state (rail
       * is lg+ only); on desktop it adds the precise-tweak entries the read-only
       * rail omits. A calm inline sheet, never the legacy 5-tab app.
       */}
      <GodChatContextSheet
        context={railContext}
        onOpenChange={setContextSheetOpen}
        onOpenCommandPalette={onOpenCommandPalette}
        // Coordinated handoff (not raw onOpenSettings): close → unwind → open.
        onOpenSettings={handleOpenSettingsFromContextSheet}
        open={contextSheetOpen}
      />
    </div>
  );
}

// Re-export the co-located pure helpers so existing test imports
// (`./god-chat-shell.tsx`) keep their single source.
export { buildSuggestions, deferAfterSheetClose, resolveLivePreviewTurnId, streamingDetailLength };
