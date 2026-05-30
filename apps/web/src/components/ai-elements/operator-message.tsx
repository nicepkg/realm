"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Which side of the conversation a turn belongs to.
 * - `operator`: the human talking to God — right-aligned, WeChat-green bubble.
 * - `system`: God / the operator assistant replying — left-aligned, neutral.
 */
export type OperatorMessageVariant = "operator" | "system";

/**
 * OperatorMessage — one turn in the God conversation. Minimal flat bubbles, no
 * avatars, no card walls. WeChat green is used only for the operator's own
 * outgoing bubble (the single sanctioned accent). The entrance reuses the
 * shared `realm-bubble-in` keyframe, which the global CSS reduced-motion guard
 * already neutralizes — so this stays reduced-motion-safe without extra code.
 *
 * `children` is an optional inline slot rendered under the text — used to drop
 * an action / preview card (e.g. a config-patch confirm) straight into the
 * reply. Pure presentation: no SDK/controller imports, all copy via props.
 */
export type OperatorMessageProps = ComponentProps<"div"> & {
  variant: OperatorMessageVariant;
  /** The turn's text. Optional so a card-only system turn is possible. */
  text?: string;
  /** Marks a freshly arrived turn so only new turns animate (history is static). */
  isNew?: boolean;
  /**
   * The kind of inline card carried in `children`, when any. Pure layout hints so
   * the message can size the card column WITHOUT importing the card component or
   * its model:
   *  - `cardVariant` distinguishes a settled `result` card (narrowed to its
   *    content when short) from a `preview`/`role-speech` card (untouched).
   *  - `cardKind === "inspect"` keeps the long humanized-tree + raw-JSON result at
   *    the full reading measure even though other short result cards narrow.
   * The shell supplies both from `turn.card`; absence ⇒ legacy full-width card.
   */
  cardVariant?: "preview" | "result" | "role-speech";
  cardKind?: string;
  /**
   * The turn is still streaming tokens (a role bubble growing in place). Exposes
   * `aria-busy` so assistive tech knows the content is not yet final and waits to
   * announce the settled text instead of re-reading every partial delta.
   */
  streaming?: boolean;
  /** Inline action / preview card rendered beneath the text. */
  children?: ReactNode;
};

export const OperatorMessage = ({
  variant,
  text,
  isNew = false,
  streaming = false,
  cardVariant,
  cardKind,
  className,
  children,
  ...props
}: OperatorMessageProps) => {
  const isOperator = variant === "operator";

  /**
   * A God *document* card (inspect tree, config/role preview, action result)
   * drops the 68% chat-bubble cap — that cap is correct only for short
   * conversational text and would leave the column's right half blank for a card.
   * A card turn instead spans the reading measure (full-width by default; a SHORT
   * result card narrows on desktop, see `isShortResultCard`). The card renders its
   * own internal padding. Capped bubble width stays for: operator/human turns
   * (right-aligned green affordance) and plain system *text* turns with no card.
   * Card presence is inferred from `children`; the card's variant/kind come from
   * the `cardVariant`/`cardKind` layout hints the shell supplies.
   */
  const hasCard = children != null && children !== false;
  const isFullWidthCard = variant === "system" && hasCard;

  /**
   * Short `result` cards narrow on the WIDE desktop column. A finished action
   * card (神谕裁决 / 状态调整 / 配置已写入) carries little text, so the legacy
   * full-bleed `max-w-full` left it spanning the whole ~896px column and reading
   * sparse — empty to the right of two short lines. So a settled result card is
   * capped to `lg:max-w-2xl` (~672px), a measure that matches its content instead
   * of the column. EXCEPTIONS that keep the full reading measure:
   *  - `inspect` result cards: they carry the multi-line humanized state tree +
   *    a raw-JSON disclosure, long content that wants the wide measure to read.
   *  - `preview` (typed-confirm) and `role-speech` cards: untouched, so the
   *    create-world / add-role confirm rows and run-turn role bubbles never shift.
   * Below `lg` every card stays full-width (phones/tablets have no spare gutter to
   * reclaim), so this is a desktop-only tightening with no mobile regression.
   */
  const isShortResultCard = isFullWidthCard && cardVariant === "result" && cardKind !== "inspect";

  /**
   * Non-card width caps are ASYMMETRIC on purpose:
   *  - operator / human turns stay a tight right-aligned chat affordance
   *    (`md:max-w-[68%]`) so the green outgoing bubble reads as a reply, not a
   *    wall of text. Unchanged across breakpoints.
   *  - plain system (God) *text* and the humanized inspect state-tree are answers
   *    meant to be READ, so they widen toward the column edge
   *    (`md:max-w-[88%]`) — otherwise the ~896px centered column left a ~32%
   *    blank right gutter that read as dead space. On the WIDE desktop column
   *    (`lg:` >=1024px) that residual right gutter is wide enough that the 88%
   *    cap reads left-weighted with a lopsided right gap — and a world-state
   *    inspect's humanized tree (which can run many lines) then sits in the left
   *    half with dead whitespace to its right. So from `lg:` up we let the answer
   *    reach the column edge (`lg:max-w-full`) — flush with the full-width cards
   *    beneath it. The answer still stops short of full bleed below `lg`, so the
   *    operator/system asymmetry stays legible on phones/tablets.
   * Cards always go full-width (handled by `isFullWidthCard` above).
   */
  const nonCardCap = isOperator
    ? "max-w-[82%] md:max-w-[68%]"
    : "max-w-[92%] md:max-w-[88%] lg:max-w-full";

  return (
    <div
      // A streaming bubble is `aria-busy` so a screen reader holds its
      // announcement until the text settles, instead of speaking each partial
      // delta. Omitted (not `false`) when idle so static history stays unmarked.
      aria-busy={streaming || undefined}
      className={cn(
        "flex w-full",
        isOperator ? "justify-end" : "justify-start",
        isNew && "realm-bubble-in",
        isNew && (isOperator ? "realm-bubble-in-out" : "realm-bubble-in-in"),
        className,
      )}
      data-testid="god-chat-message"
      data-variant={variant}
      {...props}
    >
      <div
        className={cn(
          // gap-1 (~4px) when text + card are folded into a single block (a
          // system result turn that still keeps a standalone text line); gap-2
          // (~8px) otherwise. The merged feedback case usually drops the text
          // bubble entirely (shell folds it into the card), so this only matters
          // for the rare result turn that keeps a leading line beside its card.
          isFullWidthCard ? "flex flex-col gap-1" : "flex flex-col gap-2",
          isFullWidthCard
            ? isShortResultCard
              ? "w-full lg:max-w-2xl"
              : "w-full max-w-full"
            : nonCardCap,
          isOperator && "items-end",
        )}
      >
        {text ? (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2 text-[15px] leading-[1.5]",
              isOperator
                ? "bg-[var(--realm-bubble-outgoing)] text-[#10210a]"
                : "bg-[color:var(--realm-surface-muted)] text-[color:var(--realm-fg)]",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{text}</p>
          </div>
        ) : null}
        {children ? <div className="w-full">{children}</div> : null}
      </div>
    </div>
  );
};
