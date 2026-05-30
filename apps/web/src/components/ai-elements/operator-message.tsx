"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  /** Inline action / preview card rendered beneath the text. */
  children?: ReactNode;
};

export const OperatorMessage = ({
  variant,
  text,
  isNew = false,
  className,
  children,
  ...props
}: OperatorMessageProps) => {
  const isOperator = variant === "operator";

  /**
   * A God *document* card (inspect tree, config/role preview, action result)
   * should occupy the full centered reading measure — the 68% chat-bubble cap
   * is correct only for short conversational text, and would leave the column's
   * right half blank for a card. So a system turn that carries a card drops the
   * cap and goes full-width; the card renders its own internal padding/max-width.
   * Capped bubble width stays for: operator/human turns (right-aligned green
   * affordance) and plain system *text* turns with no card (a short God sentence
   * shouldn't span the whole width). Card presence is inferred from `children`
   * so the single consumer needs no extra prop.
   */
  const hasCard = children != null && children !== false;
  const isFullWidthCard = variant === "system" && hasCard;

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
          "flex flex-col gap-2",
          isFullWidthCard ? "w-full max-w-full" : nonCardCap,
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
