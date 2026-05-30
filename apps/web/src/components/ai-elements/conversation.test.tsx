import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * `ConversationAutoScroll` reads the StickToBottom context, which is only
 * available inside a `<StickToBottom>` provider. We mock the library so the
 * component renders in isolation (it must be a transparent drop-in that adds no
 * visible chrome).
 *
 * IMPORTANT: bun's `mock.module` is global and leaks across test files for the
 * whole run, in a load-order that differs by OS. So this mock MUST be a complete
 * drop-in for every member the real module exposes that any component renders —
 * notably `StickToBottom.Content` (used by `<ConversationContent>`). Omitting it
 * left `StickToBottom.Content === undefined`, which crashed unrelated suites
 * (e.g. message-timeline) on Linux/Windows where this file loaded first
 * ("Element type is invalid ... got: undefined"). Keep this mock passthrough-complete.
 */
const StickToBottomMock = ({ children }: { children?: React.ReactNode }) => children ?? null;
StickToBottomMock.Content = ({ children }: { children?: React.ReactNode }) => children ?? null;
mock.module("use-stick-to-bottom", () => ({
  StickToBottom: StickToBottomMock,
  useStickToBottomContext: () => ({ scrollToBottom: () => true, isAtBottom: true }),
}));

const {
  ConversationAutoScroll,
  shouldAutoStick,
  autoStickBehavior,
  runAutoStick,
  resolveScrollContainer,
  scrollContainerToBottom,
} = await import("./conversation.tsx");

/**
 * Minimal fake of the DOM nodes the auto-scroll path touches, so the direct
 * scroll-container lookup + write can be unit-tested without a real DOM runtime.
 * Mirrors the `ScrollableLike` structural shape the helpers consume.
 */
type FakeEl = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  parentElement: FakeEl | null;
  closestResult: FakeEl | null;
  scrollTo?: (opts: { top: number; behavior: ScrollBehavior }) => void;
  closest(selector: string): FakeEl | null;
};

const makeEl = (over: Partial<FakeEl> = {}): FakeEl => ({
  clientHeight: 100,
  closest(_selector: string) {
    return this.closestResult;
  },
  closestResult: null,
  parentElement: null,
  scrollHeight: 100,
  scrollTop: 0,
  ...over,
});

describe("shouldAutoStick", () => {
  test("sticks only when the dependency grows (new content appended)", () => {
    expect(shouldAutoStick(0, 1)).toBe(true);
    expect(shouldAutoStick(2, 5)).toBe(true);
  });

  test("does not yank the viewport on unchanged or shrinking counts", () => {
    // Re-render with same count, or a reset/removal, must not force a scroll —
    // the operator may have deliberately scrolled up to read history.
    expect(shouldAutoStick(3, 3)).toBe(false);
    expect(shouldAutoStick(4, 1)).toBe(false);
  });
});

describe("autoStickBehavior (prefers-reduced-motion)", () => {
  test("instant 'auto' snap under reduced motion, smooth glide otherwise", () => {
    expect(autoStickBehavior(true)).toBe("auto");
    expect(autoStickBehavior(false)).toBe("smooth");
  });
});

describe("runAutoStick (the effect body)", () => {
  test("scrollToBottom fires when new content arrives", () => {
    const scroll = mock((_behavior: ScrollBehavior) => true);

    // New turn/message appended (count grows) → snap to the freshest content.
    const fired = runAutoStick(1, 2, scroll, false);

    expect(fired).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0]?.[0]).toBe("smooth");
  });

  test("uses the instant behavior under reduced motion", () => {
    const scroll = mock((_behavior: ScrollBehavior) => true);

    runAutoStick(0, 3, scroll, true);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0]?.[0]).toBe("auto");
  });

  test("does not scroll on an unchanged count (plain re-render)", () => {
    const scroll = mock((_behavior: ScrollBehavior) => true);

    const fired = runAutoStick(4, 4, scroll, false);

    expect(fired).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  test("does not scroll when content shrinks (reset/removal)", () => {
    const scroll = mock((_behavior: ScrollBehavior) => true);

    const fired = runAutoStick(5, 2, scroll, false);

    expect(fired).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("resolveScrollContainer (direct-DOM scroll-container lookup)", () => {
  test("returns null for a null anchor", () => {
    expect(resolveScrollContainer(null)).toBeNull();
  });

  test("prefers the nearest [role=log] container", () => {
    const log = makeEl({ scrollHeight: 7138 });
    const anchor = makeEl({ closestResult: log });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake satisfies ScrollableLike.
    expect(resolveScrollContainer(anchor as any)).toBe(log as any);
  });

  test("falls back to the first overflowing ancestor when no [role=log]", () => {
    const overflowing = makeEl({ clientHeight: 100, scrollHeight: 7138 });
    const flat = makeEl({ clientHeight: 100, parentElement: overflowing, scrollHeight: 100 });
    const anchor = makeEl({ parentElement: flat });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake satisfies ScrollableLike.
    expect(resolveScrollContainer(anchor as any)).toBe(overflowing as any);
  });

  test("returns null when nothing up the chain overflows", () => {
    const anchor = makeEl({ parentElement: makeEl() });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake satisfies ScrollableLike.
    expect(resolveScrollContainer(anchor as any)).toBeNull();
  });
});

describe("scrollContainerToBottom (the isAtBottom-bypass write)", () => {
  test("uses scrollTo with the motion-aware behavior when available", () => {
    const calls: { top: number; behavior: ScrollBehavior }[] = [];
    const el = makeEl({ scrollHeight: 7138, scrollTo: (opts) => calls.push(opts) });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake satisfies ScrollableLike.
    const fired = scrollContainerToBottom(el as any, "smooth");

    expect(fired).toBe(true);
    expect(calls).toEqual([{ behavior: "smooth", top: 7138 }]);
  });

  test("falls back to a hard scrollTop write when scrollTo is missing", () => {
    const el = makeEl({ scrollHeight: 7138 });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake satisfies ScrollableLike.
    const fired = scrollContainerToBottom(el as any, "auto");

    expect(fired).toBe(true);
    expect(el.scrollTop).toBe(7138);
  });

  test("no-ops safely on a null container", () => {
    expect(scrollContainerToBottom(null, "smooth")).toBe(false);
  });
});

describe("ConversationAutoScroll", () => {
  test("renders only a hidden, aria-hidden anchor (no visible chrome)", () => {
    const html = renderToStaticMarkup(<ConversationAutoScroll dependency={1} />);
    // Just a zero-size DOM handle used to locate the scroll container.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="hidden"');
    expect(html).not.toMatch(/<(button|svg|input)/);
  });
});
