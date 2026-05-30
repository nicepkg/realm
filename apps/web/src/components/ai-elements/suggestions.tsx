"use client";

import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * A starter prompt shown as a tappable pill in the empty state. `label` is what
 * the operator reads; `prompt` is the natural-language text dropped into the
 * composer when picked. Both come from the caller (localized, zero hardcoded
 * copy).
 */
export type Suggestion = {
  label: string;
  prompt: string;
};

/**
 * How long a pill stays in its "已填入" confirmation state after a pick. Short
 * enough to read as a flicker of acknowledgement, long enough for a screen
 * reader's polite live region to pick it up. Under `prefers-reduced-motion` the
 * global CSS gate freezes the visual tint, but the timer (and aria-live text)
 * still run so the affordance never silently disappears.
 */
export const PREFILL_HINT_MS = 1600;

/**
 * Suggestions — a calm horizontal pill row of starter prompts for the empty
 * God-chat state. Pure presentation: it renders what it is given and reports
 * the chosen prompt back. No SDK/controller imports, no business logic.
 *
 * Picking a pill PREFILLS the composer (it never auto-sends) — that "edit then
 * send" semantic is intentional. To stop a first-time operator thinking "I
 * clicked and nothing happened", an OPTIONAL feedback layer can be switched on:
 * pass `prefillHint` to briefly flag the picked pill as 已填入 and announce the
 * hint via an aria-live region, and/or pass `onPicked` so the caller can focus
 * the composer and place the cursor at the end. Both default off — omit them and
 * behaviour is byte-for-byte identical to the bare prefill row.
 *
 * Horizontally scrollable so a long list never wraps into a noisy grid; pills
 * keep a stable height (no layout shift on hover/active, per taste rules).
 * WeChat green appears only as a quiet hover/active tint, never as a fill.
 */
export type SuggestionsProps = Omit<ComponentProps<"div">, "onSelect"> & {
  items: Suggestion[];
  /** Called with the full prompt text of the picked suggestion. */
  onPick: (prompt: string) => void;
  /**
   * Optional. Fired AFTER `onPick`, with no arguments — the caller (the chat
   * shell) uses it to focus the composer and move the caret to the end. When
   * omitted, picking only prefills, exactly as before.
   */
  onPicked?: () => void;
  /**
   * Optional localized hint (e.g. "已填入，按发送"). When provided, the picked
   * pill shows a brief confirmation tint and the text is announced via a polite
   * aria-live region. When omitted, no hint UI renders at all.
   */
  prefillHint?: string;
};

/**
 * Pure decision for what a pill click should do, kept out of the component so it
 * is trivially unit-testable without a DOM. Given the picked suggestion and the
 * optional handlers, it returns the ordered side effects to run.
 */
export const resolvePickActions = (
  prompt: string,
  handlers: { onPick: (prompt: string) => void; onPicked?: () => void },
): { prompt: string; runOnPicked: boolean } => {
  handlers.onPick(prompt);
  if (handlers.onPicked) {
    handlers.onPicked();
  }
  return { prompt, runOnPicked: Boolean(handlers.onPicked) };
};

export const Suggestions = ({
  items,
  onPick,
  onPicked,
  prefillHint,
  className,
  ...props
}: SuggestionsProps) => {
  // Label of the pill currently in its 已填入 confirmation state, or null.
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Never leak a pending timer across unmount.
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handlePick = useCallback(
    (item: Suggestion) => {
      resolvePickActions(item.prompt, { onPick, onPicked });
      if (!prefillHint) {
        return;
      }
      setActiveLabel(item.label);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setActiveLabel(null);
        timerRef.current = null;
      }, PREFILL_HINT_MS);
    },
    [onPick, onPicked, prefillHint],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex w-full flex-wrap gap-2 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    >
      {items.map((item) => {
        const isActive = prefillHint != null && activeLabel === item.label;
        return (
          <button
            aria-pressed={prefillHint != null ? isActive : undefined}
            className={cn(
              // Stable height + shrink-0 keep the row from jittering; the tint
              // is colour-only so the active state never changes layout.
              "realm-press shrink-0 rounded-full border border-[color:var(--realm-line)] bg-background px-3.5 py-1.5 text-[13px] text-[color:var(--realm-fg-muted)]",
              "transition-colors hover:border-[var(--realm-bubble-outgoing)] hover:text-[color:var(--realm-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]",
              isActive &&
                "border-[var(--realm-bubble-outgoing)] bg-[var(--realm-bubble-outgoing)]/10 text-[color:var(--realm-fg)]",
            )}
            data-testid="god-chat-suggestion"
            key={item.label}
            onClick={() => handlePick(item)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
      {prefillHint != null ? (
        // Polite, visually-hidden announcement so a screen-reader user hears
        // "已填入，按发送" instead of silence. Always mounted (stable a11y tree);
        // only carries text while a pill is active.
        <span aria-live="polite" className="sr-only" data-testid="god-chat-suggestion-hint">
          {activeLabel != null ? prefillHint : ""}
        </span>
      ) : null}
    </div>
  );
};
