"use client";

import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * Leaf presentation pieces for {@link ./god-chat-context-sheet.tsx}, split out to
 * keep each file under the repo's 500-line gate while preserving behavior. These
 * are pure, context-free components (no Radix Dialog binding, no i18n call) so the
 * sheet's own tests can mount the body in `renderToStaticMarkup` without portals.
 */

type ContextSectionProps = {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  testId: string;
  children: React.ReactNode;
};

/** A read-only section header + body. Mirrors the rail's calm sectioning. */
export function ContextSection({ icon, title, meta, testId, children }: ContextSectionProps) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[color:var(--realm-fg-muted)]">{icon}</span>
        <span className="font-medium text-[14px] text-[color:var(--realm-fg)]">{title}</span>
        {meta ? (
          <span className="ml-auto text-[12px] text-[color:var(--realm-fg-faint)]">{meta}</span>
        ) : null}
      </div>
      <div className="px-0.5">{children}</div>
    </section>
  );
}

export function SectionEmpty({ text }: { text: string }) {
  return <p className="text-[13px] text-[color:var(--realm-fg-faint)] leading-5">{text}</p>;
}

type TweakRowProps = {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  testId: string;
};

/**
 * A single precise-tweak entry: a keyboard-accessible button row with an icon,
 * label, hint, and a quiet chevron. Press feedback via the shared `.realm-press`
 * token (reduced-motion safe).
 */
export function TweakRow({ icon, label, hint, onClick, testId }: TweakRowProps) {
  return (
    <button
      className={cn(
        "realm-press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        "hover:bg-[color:var(--realm-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--realm-surface-muted)] text-[color:var(--realm-fg-muted)]">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-[14px] text-[color:var(--realm-fg)]">
          {label}
        </span>
        <span className="truncate text-[12px] text-[color:var(--realm-fg-faint)]">{hint}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-[color:var(--realm-fg-faint)]" />
    </button>
  );
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "?";
}
