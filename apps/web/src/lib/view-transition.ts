import { flushSync } from "react-dom";

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Run a React state update inside a native View Transition when the browser
 * supports it and the user has not requested reduced motion. `flushSync`
 * forces the DOM to commit synchronously so the transition captures the
 * before/after frames. Falls back to a plain update everywhere else.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as DocumentWithViewTransition;
  if (typeof doc.startViewTransition === "function" && !prefersReducedMotion()) {
    doc.startViewTransition(() => flushSync(update));
    return;
  }
  update();
}
