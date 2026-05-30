"use client";

import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Whether a starter prompt READS or WRITES the world.
 *  - `read`  — a side-effect-free inspect ("现在世界什么状态？"). Picking it sends
 *    immediately (NL-first: one sentence, one result; nothing to confirm).
 *  - `write` — a mutation (create world / add role / control a role). Picking it
 *    only PREFILLS the composer so the operator can edit before sending — a risky
 *    write is NEVER auto-sent (it still passes the review-before-send preview).
 *
 * Defaults to `write` when omitted so an un-annotated chip can never auto-send.
 */
export type SuggestionKind = "read" | "write";

/**
 * A starter prompt shown as a tappable pill in the empty state. `label` is what
 * the operator reads; `prompt` is the natural-language text dropped into the
 * composer (write) or sent directly (read) when picked. `kind` decides which —
 * see {@link SuggestionKind}. All come from the caller (localized, zero hardcoded
 * copy).
 */
export type Suggestion = {
  label: string;
  prompt: string;
  /** Read (direct-send) vs write (prefill-then-send). Defaults to `write`. */
  kind?: SuggestionKind;
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
 * Picking a `write` pill PREFILLS the composer (it never auto-sends) — that "edit
 * then send" semantic is intentional for risky mutations. Picking a `read` pill
 * (a side-effect-free inspect) instead SENDS immediately via `onPickRead` — the
 * NL-first "one sentence, one result" mental model, with no write risk. A chip
 * with no `kind` is treated as `write` (never auto-sends).
 *
 * To stop a first-time operator thinking "I clicked and nothing happened" after a
 * WRITE prefill, an OPTIONAL feedback layer can be switched on: pass `prefillHint`
 * to briefly flag the picked pill as 已填入 and announce the hint via an aria-live
 * region, and/or pass `onPicked` so the caller can focus the composer and place
 * the cursor at the end. Both default off — omit them and the write-pill behaviour
 * is byte-for-byte identical to the bare prefill row. Read pills bypass this layer
 * entirely (they send, so there is nothing to confirm).
 *
 * Horizontally scrollable so a long list never wraps into a noisy grid; pills
 * keep a stable height (no layout shift on hover/active, per taste rules).
 * WeChat green appears only as a quiet hover/active tint, never as a fill.
 */
export type SuggestionsProps = Omit<ComponentProps<"div">, "onSelect"> & {
  items: Suggestion[];
  /**
   * Called with the full prompt text of a picked WRITE suggestion — the caller
   * prefills the composer with it (it is never auto-sent). Also used as the
   * fallback for a `read` pill when `onPickRead` is not supplied, so a read chip
   * still at least prefills rather than doing nothing.
   */
  onPick: (prompt: string) => void;
  /**
   * Optional. Called with the full prompt of a picked READ suggestion to SEND it
   * immediately (NL-first direct-send). When omitted, a read pill degrades to a
   * plain `onPick` prefill — never a dead click.
   */
  onPickRead?: (prompt: string) => void;
  /**
   * Optional. Fired AFTER `onPick` for a WRITE pill only, with no arguments — the
   * caller (the chat shell) uses it to focus the composer and move the caret to
   * the end. When omitted, picking only prefills, exactly as before. Never fires
   * for a read pill (which sends instead of prefilling).
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
 * is trivially unit-testable without a DOM. Splits on the suggestion `kind`:
 *
 *  - `read`  → SEND immediately via `onPickRead` (NL-first direct-send). The
 *    write-only prefill feedback (`onPicked` / hint tint) is skipped — there is
 *    nothing to confirm. If `onPickRead` is absent it degrades to `onPick` so the
 *    click is never dead. A read pick reports `sent: true`.
 *  - `write` (default for an un-annotated chip) → PREFILL via `onPick`, then fire
 *    the optional `onPicked` focus/pulse hook. A write pick is NEVER sent.
 *
 * Returns the resolved prompt plus flags describing which effects ran, so the
 * read/write split is assertable without a DOM and the component can decide
 * whether to show the 已填入 hint tint (write-only).
 */
export const resolvePickActions = (
  item: Pick<Suggestion, "prompt" | "kind">,
  handlers: {
    onPick: (prompt: string) => void;
    onPickRead?: (prompt: string) => void;
    onPicked?: () => void;
  },
): { prompt: string; sent: boolean; prefilled: boolean; runOnPicked: boolean } => {
  const { prompt, kind } = item;
  if (kind === "read") {
    // Direct-send (NL-first). Fall back to a plain prefill when no send handler is
    // wired so a read chip still does SOMETHING rather than nothing.
    if (handlers.onPickRead) {
      handlers.onPickRead(prompt);
      return { prefilled: false, prompt, runOnPicked: false, sent: true };
    }
    handlers.onPick(prompt);
    return { prefilled: true, prompt, runOnPicked: false, sent: false };
  }
  // Write (or unspecified): prefill + optional focus/pulse. Never auto-sent.
  handlers.onPick(prompt);
  if (handlers.onPicked) {
    handlers.onPicked();
  }
  return { prefilled: true, prompt, runOnPicked: Boolean(handlers.onPicked), sent: false };
};

export const Suggestions = ({
  items,
  onPick,
  onPickRead,
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
      const { prefilled } = resolvePickActions(item, { onPick, onPickRead, onPicked });
      // The 已填入 confirmation tint is a WRITE-prefill affordance only: a read
      // pill SENDS (prefilled === false), so it leaves the empty state for the
      // live timeline immediately and never needs a "still press send" hint.
      if (!prefillHint || !prefilled) {
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
    [onPick, onPickRead, onPicked, prefillHint],
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
        // A read pill is a one-shot send action, NOT a toggle — only write pills
        // (the prefill-then-send affordance) carry the 已填入 pressed state.
        const isWritePill = item.kind !== "read";
        const togglesHint = prefillHint != null && isWritePill;
        const isActive = togglesHint && activeLabel === item.label;
        return (
          <button
            aria-pressed={togglesHint ? isActive : undefined}
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
