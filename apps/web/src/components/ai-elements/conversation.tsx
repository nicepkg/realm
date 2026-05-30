"use client";

import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils.ts";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-auto", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <StickToBottom.Content className={cn("flex flex-col gap-8 p-4", className)} {...props} />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  /**
   * Required (no English default) so a caller that forgets to pass a localized
   * value fails loudly at the type level instead of silently rendering
   * hardcoded English. Pass an empty string to intentionally omit.
   */
  title: string;
  description: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title,
  description,
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

/**
 * Pure decision: should we force a stick-to-bottom scroll given the previous
 * and next value of the watched dependency (typically a turn/message count)?
 *
 * We only auto-scroll when the dependency *grows* — i.e. genuinely new content
 * was appended. A shrinking or unchanged count (re-render, reset, edit in
 * place) must NOT yank the operator's viewport, so they can keep reading
 * history they deliberately scrolled up to. Kept pure + exported so the
 * behaviour is unit-testable without a DOM runtime.
 */
export const shouldAutoStick = (previous: number, next: number): boolean => next > previous;

/**
 * Resolve the scroll behaviour from the user's motion preference. Respecting
 * `prefers-reduced-motion` is an accessibility requirement: animated jumps can
 * trigger vestibular discomfort, so reduced-motion users get an instant
 * (`"auto"`) snap while everyone else gets a smooth glide.
 */
export const autoStickBehavior = (prefersReducedMotion: boolean): ScrollBehavior =>
  prefersReducedMotion ? "auto" : "smooth";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The effect body, extracted as a pure unit so it is testable without a DOM /
 * React effect runtime. Given the previous and next dependency value it decides
 * whether to scroll and, if so, invokes `scroll` with the motion-aware
 * behaviour. Returns whether a scroll was triggered.
 */
export const runAutoStick = (
  previous: number,
  next: number,
  scroll: (behavior: ScrollBehavior) => unknown,
  reducedMotion: boolean,
): boolean => {
  if (!shouldAutoStick(previous, next)) {
    return false;
  }
  scroll(autoStickBehavior(reducedMotion));
  return true;
};

/**
 * The minimal shape of a scrollable element the auto-stick path needs. Defined
 * structurally (not via `HTMLElement`) so the lookup + write are unit-testable
 * with a fake DOM and never depend on a real runtime's `instanceof`.
 */
export type ScrollableLike = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  parentElement: ScrollableLike | null;
  closest: (selector: string) => ScrollableLike | null;
  scrollTo?: (options: { top: number; behavior: ScrollBehavior }) => void;
};

/**
 * Walk up from an anchor node to the nearest scrollable conversation container.
 * `<Conversation>` renders the StickToBottom root with `role="log"`, so that is
 * our primary target; we fall back to the first ancestor that actually overflows
 * (defensive, in case the markup changes). Kept pure + exported so the lookup is
 * unit-testable with a fake DOM.
 *
 * We need this because use-stick-to-bottom's `scrollToBottom()` no-ops on this
 * overflow layout (it mis-reads `isAtBottom=true`), so the auto-stick effect has
 * to drive the real element's `scrollTop` itself.
 */
export const resolveScrollContainer = (anchor: ScrollableLike | null): ScrollableLike | null => {
  if (!anchor) {
    return null;
  }
  const logged = anchor.closest("[role=log]");
  if (logged) {
    return logged;
  }
  let current: ScrollableLike | null = anchor.parentElement;
  while (current) {
    if (current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

/**
 * Directly snap a scroll container to its bottom. This is the bypass for the
 * use-stick-to-bottom `isAtBottom` false-positive: instead of asking the library
 * (which no-ops), we set the real scroll position ourselves. Prefers the
 * animated `scrollTo` when available, falling back to a hard `scrollTop` write
 * for environments (jsdom / older engines) that lack it. Exported for testing.
 */
export const scrollContainerToBottom = (
  container: ScrollableLike | null,
  behavior: ScrollBehavior,
): boolean => {
  if (!container) {
    return false;
  }
  const top = container.scrollHeight;
  if (typeof container.scrollTo === "function") {
    container.scrollTo({ behavior, top });
  } else {
    container.scrollTop = top;
  }
  return true;
};

export type ConversationAutoScrollProps = {
  /**
   * A monotonic counter the caller increments whenever new content is appended
   * (e.g. `chat.turns.length`). When it increases we force the conversation
   * back to the bottom so the freshest bubble + card are in view after a send.
   * The parent owns this value, so this component can be dropped inside
   * `<Conversation>` without the parent needing to touch the conversation
   * internals.
   */
  dependency: number;
  /**
   * A SECOND monotonic growth signal for in-place streaming: when a role bubble
   * streams `turn.delta` tokens it mutates an existing turn's card detail rather
   * than appending a turn, so `dependency` (turn count) stays flat. The caller
   * passes the streamed character length here so the viewport keeps tracking the
   * bottom as the bubble grows. Optional — defaults to 0 (no stream in flight).
   */
  streamSignal?: number;
};

/**
 * Opt-in auto-stick affordance. Sits inside `<Conversation>` (so it can read the
 * StickToBottom context) and pins the viewport to the newest content every time
 * `dependency` OR `streamSignal` grows — fixing the "stuck mid-history after
 * send" bug where the new bubble + preview card render below the fold, AND the
 * "streamed reply scrolls past the fold" bug where the role line grows in place.
 *
 * It renders a zero-size anchor span so it can DOM-resolve the real scroll
 * container ([role=log]) and drive `scrollTop` directly — the library's
 * `scrollToBottom()` no-ops here (it mis-reads `isAtBottom=true` on this overflow
 * layout, which is also why the manual {@link ConversationScrollButton} never
 * shows). We still call `scrollToBottom()` too, so if the library ever reads the
 * layout correctly its smooth animation also kicks in; the direct write is the
 * guarantee.
 *
 * It deliberately does NOT fight the user: it only reacts to growth, so someone
 * who scrolled up to read history is not yanked. The manual scroll button stays
 * the explicit jump-back.
 */
export const ConversationAutoScroll = ({
  dependency,
  streamSignal = 0,
}: ConversationAutoScrollProps) => {
  const { scrollToBottom } = useStickToBottomContext();
  const anchorRef = useRef<HTMLSpanElement>(null);
  // Track a single combined monotonic value: any growth in either the turn count
  // or the streamed length means fresh content landed below the fold.
  const previousRef = useRef(dependency + streamSignal);

  useEffect(() => {
    const next = dependency + streamSignal;
    const previous = previousRef.current;
    previousRef.current = next;
    const reduced = prefersReducedMotion();
    // Reuse the pure growth guard: only snap when content actually grew, so a
    // user scrolled up reading history is never yanked.
    runAutoStick(
      previous,
      next,
      (behavior) => {
        // Drive the REAL scroll element (the bypass), then also nudge the library
        // in case it ever reads the layout correctly. The live DOM element
        // structurally satisfies ScrollableLike (closest/parentElement/scroll*).
        const anchor = anchorRef.current as unknown as ScrollableLike | null;
        scrollContainerToBottom(resolveScrollContainer(anchor), behavior);
        scrollToBottom();
      },
      reduced,
    );
  }, [dependency, streamSignal, scrollToBottom]);

  // Zero-size, aria-hidden anchor: purely a DOM handle to locate the scroll
  // container. Renders no visible chrome.
  return (
    <span aria-hidden className="hidden" data-testid="conversation-auto-scroll" ref={anchorRef} />
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (message: UIMessage, index: number) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
