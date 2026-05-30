"use client";

import { ArrowUpIcon } from "lucide-react";
import type { ComponentProps, FormEvent, KeyboardEvent } from "react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils.ts";

/**
 * PromptInput — the Apple-flat composer for the operator's natural-language
 * conversation with God. Pure presentation: fully controlled, no business
 * logic, no SDK/controller imports. The caller owns the value, decides what a
 * submit means, and passes every string (zero hardcoded copy).
 *
 * Behaviour:
 * - Auto-grow textarea (`field-sizing-content` via the ui Textarea) capped by
 *   `maxRows` so a long paste never swallows the viewport.
 * - Enter submits; Shift+Enter inserts a newline. The send affordance is a
 *   single subtle round button — the only persistent control on the surface.
 * - `disabled` hard-locks the field; `busy` keeps the field editable (so a
 *   draft survives an in-flight request) but blocks send + re-submit.
 */
export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  /** Current composer text. The component is fully controlled. */
  value: string;
  /** Fires on every keystroke with the next value. */
  onValueChange: (value: string) => void;
  /** Fires when the operator commits a non-empty message. */
  onSubmit: (value: string) => void;
  /** Localized placeholder. Required so a missing string fails at the type level. */
  placeholder: string;
  /** Accessible label for the send button (icon-only), localized by the caller. */
  sendLabel: string;
  /** Locks the whole composer (e.g. read-only policy). */
  disabled?: boolean;
  /** A request is in flight: field stays editable, send is suppressed. */
  busy?: boolean;
  /** Soft cap on auto-grow height, expressed in rows. */
  maxRows?: number;
};

export const PromptInput = ({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  sendLabel,
  disabled = false,
  busy = false,
  maxRows = 8,
  className,
  ...props
}: PromptInputProps) => {
  const trimmed = value.trim();
  const canSend = !disabled && !busy && trimmed.length > 0;

  const commit = useCallback(() => {
    if (!canSend) {
      return;
    }
    onSubmit(value);
  }, [canSend, onSubmit, value]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      commit();
    },
    [commit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter is a newline. Ignore IME composition so a
      // Chinese candidate-selection Enter never sends a half-typed message.
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  return (
    <form
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-[color:var(--realm-line)] bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors focus-within:border-ring",
        disabled && "opacity-60",
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      <Textarea
        aria-label={placeholder}
        className="min-h-[24px] resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-[1.45] shadow-none focus-visible:border-0 focus-visible:ring-0"
        data-testid="god-chat-input"
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        style={{ maxHeight: `${maxRows * 1.45 * 15 + 12}px` }}
        value={value}
      />
      <Button
        aria-label={sendLabel}
        className="shrink-0 rounded-full bg-[var(--realm-bubble-outgoing)] text-[#10210a] hover:bg-[var(--realm-bubble-outgoing)]/90"
        data-testid="god-chat-send"
        disabled={!canSend}
        size="icon-sm"
        type="submit"
      >
        <ArrowUpIcon className="size-4" />
      </Button>
    </form>
  );
};
