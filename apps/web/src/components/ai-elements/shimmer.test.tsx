import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Reduced-motion safety (L6-R2-1). Shimmer drives an infinite background sweep
 * through motion (a JS/WAAPI animation) which the global CSS reduced-motion
 * guard cannot stop, so the component must self-guard via `useReducedMotion`.
 *
 * We mock `motion/react` directly instead of stubbing `window.matchMedia`:
 * motion caches its reduced-motion decision in a process-level singleton on the
 * first render anywhere, so a window stub is fragile under the shared bun test
 * process (another test file's `globalThis.window` mutation can win the race).
 * Mocking the hook makes the reduced-motion branch deterministic in isolation
 * AND in the full suite. `motion.create` returns a plain element factory so the
 * non-reduced path (never hit here) still renders without touching window.
 */
mock.module("motion/react", () => ({
  motion: {
    create: (element: string) => (props: Record<string, unknown>) => createElement(element, props),
  },
  useReducedMotion: () => true,
}));

const { Shimmer } = await import("./shimmer.tsx");

describe("Shimmer reduced-motion safety", () => {
  test("renders a static muted fallback with no infinite-sweep animation", () => {
    const html = renderToStaticMarkup(<Shimmer>Thinking</Shimmer>);

    // The static fallback is opted into explicitly and keeps the muted text color.
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain("text-[color:var(--color-muted-foreground)]");
    expect(html).toContain("Thinking");

    // No motion-driven sweep markers: no clip-to-text gradient text, no moving
    // background-position, and no transparent text that depends on the animation.
    expect(html).not.toContain("bg-clip-text");
    expect(html).not.toContain("background-position");
    expect(html).not.toContain("text-transparent");
  });

  test("honors the `as` prop in the fallback so layout/semantics are preserved", () => {
    const html = renderToStaticMarkup(<Shimmer as="span">Loading</Shimmer>);

    expect(html).toContain("<span");
    expect(html).toContain('data-reduced-motion="true"');
    expect(html).not.toContain("bg-clip-text");
  });
});
