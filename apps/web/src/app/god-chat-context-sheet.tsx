"use client";

import {
  ChevronRightIcon,
  CommandIcon,
  GlobeIcon,
  SettingsIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { GodChatContext } from "@/state/god-chat-model.ts";
// Reuse the rail's flattening so the sheet shows the EXACT same world snapshot.
// Importing the helper (god-chat-context-rail.tsx is read-only and not edited)
// keeps the two surfaces in lock-step: one flatten rule, two presentations.
import { flattenStateHighlights } from "./god-chat-context-rail.tsx";

/**
 * GodChatContextSheet — the minimal inline context surface that replaces the
 * legacy "高级 → full WeChat-style messenger" wall (nl-first-vision). Tapping 高级
 * opens THIS lightweight peek (a bottom sheet on mobile, a compact right-side
 * drawer on lg+ desktop), never the 5-tab manager/workspace app.
 *
 * On small screens (<lg) the desktop GodChatContextRail is hidden, so this sheet
 * is the only way to glance at world-state + roles from the chat home. It mirrors
 * the rail's content exactly (same `flattenStateHighlights`, same two sections)
 * plus at most two precise-tweak entries — the command palette (power users /
 * the gated route to legacy surfaces) and settings — NOT a button wall.
 *
 * Pure presentation: it reads the same `GodChatContext` the rail consumes and
 * calls back to AppShell for the two tweak actions. All strings come from the
 * i18n dict (chat.contextSheet.*), zh-CN authoritative.
 */

export type GodChatContextSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: GodChatContext;
  /** Open the command palette (power-user precise control + gated legacy route). */
  onOpenCommandPalette: () => void;
  /** Open the settings sheet (provider/model/runtime + export/import). */
  onOpenSettings: () => void;
};

/** Cap mirrors the rail: a glance, not a dump. The inspector owns the full view. */
const MAX_HIGHLIGHTS = 12;

/**
 * Build the explicit outside-dismiss handler wired to the Sheet's
 * `onPointerDownOutside` / `onInteractOutside`. A real touch device has no
 * Escape key, so a backdrop tap must reliably close the sheet — Radix's default
 * outside-pointer dismissal was not firing for the bottom-sheet backdrop tap at
 * 390x844. The handler drives `onOpenChange(false)` directly and does NOT
 * `preventDefault`, so the dismissal is never suppressed. Exported so the
 * behavior is unit-testable without a DOM (Radix portals are absent from the
 * repo's `renderToStaticMarkup`-only test harness).
 */
export function createOutsideDismissHandler(onOpenChange: (open: boolean) => void): () => void {
  return () => onOpenChange(false);
}

/**
 * Belt-and-suspenders backdrop dismissal. `createOutsideDismissHandler` rides on
 * Radix's `onPointerDownOutside` / `onInteractOutside`, which the live verifier
 * saw a *synthetic* overlay `.click()` fail to trigger (a real touch tap may
 * behave differently — likely a harness artifact, but we make it bulletproof
 * regardless). So we ALSO render our own explicit backdrop element (below) whose
 * pointer-down / click invokes THIS handler directly, guaranteeing a real touch
 * tap on the dimmed area dismisses the sheet.
 *
 * Crucially, it dismisses ONLY when the event originated on the backdrop element
 * itself (`event.target === event.currentTarget`). Pointer/clicks that bubble up
 * from descendants — i.e. interactions INSIDE the sheet (role rows, tweak rows,
 * the × button) — are ignored, so they never accidentally close the sheet. The
 * handler does NOT `preventDefault`, keeping the dismissal reliable.
 *
 * Exported so the self-target guard is unit-testable without a DOM (Radix portals
 * are absent from the repo's `renderToStaticMarkup`-only test harness), mirroring
 * `createOutsideDismissHandler`.
 */
export function createOverlayDismissHandler(
  onOpenChange: (open: boolean) => void,
): (event: { target: EventTarget | null; currentTarget: EventTarget | null }) => void {
  return (event) => {
    // Only a tap on the bare backdrop closes; bubbled events from inside the
    // sheet (which Radix renders as a SIBLING, not a child, of this overlay —
    // but we guard anyway) must not dismiss.
    if (event.target === event.currentTarget) {
      onOpenChange(false);
    }
  };
}

/**
 * Tailwind's `lg` breakpoint (1024px). On a 1440-wide desktop a bottom sheet
 * stretches the full viewport width with content hugging the left edge — the
 * opposite of the nl-first-vision "secondary, lightweight peek". So at lg+ we
 * present this as a compact right-side drawer; below lg the thumb-reachable
 * bottom sheet (which already feels good) is kept.
 */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * SSR-safe `lg+` detector. Starts `false` (mobile-first / matches the server
 * render) and upgrades after mount via `matchMedia`, so the first client paint
 * agrees with the server markup and avoids a hydration mismatch.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

export function GodChatContextSheet({
  open,
  onOpenChange,
  context,
  onOpenCommandPalette,
  onOpenSettings,
}: GodChatContextSheetProps) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  // Touch devices have no Escape, so a backdrop tap is the only thumb-reachable
  // dismiss on mobile. Radix's default outside-pointer dismissal was not firing
  // for the bottom-sheet backdrop tap at 390x844, leaving the sheet stuck open.
  // We wire BOTH outside hooks to this explicit handler — `onInteractOutside`
  // covers pointer + focus outside-interactions broadly, `onPointerDownOutside`
  // catches the raw touch/pointer-down. It does NOT preventDefault, so dismissal
  // stays reliable. Interactions INSIDE the sheet (role rows, tweak rows, the ×
  // button) are not "outside" and never reach these handlers, so they don't
  // close it.
  const dismissOnOutside = createOutsideDismissHandler(onOpenChange);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
       * Belt-and-suspenders backdrop: a dedicated tappable dim layer rendered
       * ABOVE Radix's own overlay (which the live verifier saw not respond to a
       * synthetic overlay click). On a real touch tap of the dimmed area this
       * element's own pointer-down/click fires onOpenChange(false) directly,
       * independent of Radix's onPointerDownOutside path. Only opens while
       * `open` so it never traps pointer events when the sheet is closed. The
       * SheetContent below is raised to z-[60] so it stays fully interactive
       * above this z-[55] backdrop.
       */}
      <ExplicitBackdrop open={open} onOpenChange={onOpenChange} />
      <SheetContent
        onInteractOutside={dismissOnOutside}
        onPointerDownOutside={dismissOnOutside}
        // Responsive secondary "peek" surface (nl-first-vision):
        //   • mobile (<lg): a thumb-reachable bottom sheet — rounded top, capped
        //     height with internal scroll, safe-area padding for the notch.
        //   • desktop (lg+): a COMPACT right-side drawer (~520px) instead of a
        //     full-width bottom sheet, so the chat home stays visible behind it
        //     and the panel reads as a light glance, not a full-screen takeover.
        // The `side` is chosen at runtime (matchMedia) because Radix Sheet takes a
        // single `side`; the per-breakpoint className overrides then tune sizing.
        // We render our OWN explicit close affordance (below) — anchored to the
        // panel's own top-right, so it never visually collides with background
        // content — instead of the shared absolute × whose only name is sr-only
        // text. Backdrop tap / pointer-down-outside dismisses via the explicit
        // outside handlers wired below (onInteractOutside / onPointerDownOutside
        // → onOpenChange(false)), so outside-dismiss works on touch where there
        // is no Escape key.
        className={cn(
          // Raise above ExplicitBackdrop (z-50, body-portaled after Radix) so the
          // sheet panel itself stays fully interactive while the dim layer below
          // still catches backdrop taps.
          "z-[60] gap-0 p-0",
          isDesktop
            ? // Right drawer: full height, capped narrow width, rounded inner
              // (left) edge for a lighter peek. `max-w` beats the side variant's
              // sm:max-w-sm at lg.
              "h-full w-full max-w-[520px] rounded-l-2xl"
            : // Bottom sheet (unchanged, good UX): rounded top, capped height,
              // safe-area bottom padding.
              "max-h-[82dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
        )}
        data-testid="god-chat-context-sheet"
        showCloseButton={false}
        side={isDesktop ? "right" : "bottom"}
      >
        {/*
         * SheetHeader/Title/Description bind to the Radix Dialog context for a11y
         * labelling, so they live HERE inside the Sheet (not in the split body,
         * which is rendered standalone in tests where there is no Dialog context).
         *
         * The explicit × lives on the header's OWN top-right (a flex row: the
         * title/description block on the left, the close button on the right). The
         * header has no `ml-auto` meta of its own, so the × can never visually
         * collide with the first ContextSection's '世界状态 v1 · N 个字段' version
         * label — which it previously did when it was absolutely positioned inside
         * the scrolling body. Keeping it in the header also leaves the body purely
         * content, the Apple-flat placement.
         */}
        <SheetHeader className="px-5 pt-5 pb-1">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SheetTitle className="text-[16px]">{t("chat.contextSheet.title")}</SheetTitle>
              <SheetDescription className="text-[13px]">
                {t("chat.contextSheet.description")}
              </SheetDescription>
            </div>
            <GodChatContextSheetClose onRequestClose={() => onOpenChange(false)} />
          </div>
        </SheetHeader>
        <GodChatContextSheetContent
          context={context}
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenSettings={onOpenSettings}
          onRequestClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * The explicit, discoverable close affordance with a REAL accessible name
 * (aria-label = 关闭, common.close) — not the shared sr-only-only ×. It lives on
 * the SheetHeader's own top-right row (alongside the title/description, which own
 * no `ml-auto` meta), so it can never overlap the first ContextSection's
 * '世界状态 v1 · N 个字段' version label the way it did when absolutely positioned
 * inside the scrolling body. `onRequestClose` drives the same onOpenChange(false)
 * path as a backdrop tap / Escape.
 *
 * Extracted + exported so the close button is unit-testable without Radix's
 * Dialog/Portal context (a plain <button>, no Dialog binding), mirroring the
 * `GodChatContextSheetContent` split.
 */
export function GodChatContextSheetClose({ onRequestClose }: { onRequestClose: () => void }) {
  const { t } = useI18n();
  return (
    <button
      aria-label={t("common.close")}
      className="-mr-1 -mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[color:var(--realm-fg-muted)] transition-colors hover:bg-[color:var(--realm-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      data-testid="god-chat-context-sheet-close"
      onClick={onRequestClose}
      type="button"
    >
      <XIcon className="size-4" />
    </button>
  );
}

type ExplicitBackdropProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The belt-and-suspenders dim layer. Portaled to `document.body` (only after
 * mount, so SSR is untouched and there is no hydration mismatch) and only while
 * `open`, it sits at z-[55] — above Radix's own overlay (z-50), below the z-[60] sheet
 * panel — so a real touch tap on the dimmed area reliably calls
 * `onOpenChange(false)` even if Radix's outside-pointer path doesn't fire.
 *
 * `pointer-events-auto` so it actually receives taps; `aria-hidden` because the
 * labelled × button + Escape are the announced dismiss affordances (this is a
 * redundant pointer convenience, not a new control). Reduced-motion safe: it
 * uses no animation. Wires BOTH pointerdown (fires earliest on touch) and click
 * (fallback) through the self-target-guarded handler.
 */
function ExplicitBackdrop({ open, onOpenChange }: ExplicitBackdropProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!open || !mounted || typeof document === "undefined") {
    return null;
  }
  const dismiss = createOverlayDismissHandler(onOpenChange);
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-auto fixed inset-0 z-[55]"
      data-testid="god-chat-context-sheet-backdrop"
      onClick={dismiss}
      onPointerDown={dismiss}
    />,
    document.body,
  );
}

export type GodChatContextSheetContentProps = {
  context: GodChatContext;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  /** Close the enclosing sheet before routing to a tweak overlay. */
  onRequestClose: () => void;
};

/**
 * The sheet body, split out from the portal-bearing `Sheet` wrapper so it can be
 * rendered + asserted directly in tests (the repo's established sheet-test
 * pattern — see world-inspector-sheet.test.tsx — since Radix portals are absent
 * from `renderToStaticMarkup` output). Pure presentation.
 */
export function GodChatContextSheetContent({
  context,
  onOpenCommandPalette,
  onOpenSettings,
  onRequestClose,
}: GodChatContextSheetContentProps) {
  const { t } = useI18n();
  const highlights = useMemo(
    // Defensive cap: the rail already caps at 12, but flatten is shared and the
    // sheet must never grow into a scroll-dump if that ever changes.
    () => flattenStateHighlights(context.worldState?.state).slice(0, MAX_HIGHLIGHTS),
    [context.worldState?.state],
  );
  const version = context.worldState?.version ?? 0;
  const roles = context.roles;

  return (
    <div
      // `flex-1 min-h-0` lets the body fill the remaining height and scroll
      // INTERNALLY — needed for the full-height desktop right drawer; harmless
      // inside the mobile bottom sheet's capped (max-h) flex column.
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-3 pb-5"
      data-testid="god-chat-context-sheet-body"
    >
      <ContextSection
        icon={<GlobeIcon className="size-4" />}
        meta={
          context.worldState
            ? t("chat.contextSheet.stateMeta")(version, highlights.length)
            : undefined
        }
        testId="god-chat-context-sheet-state"
        title={t("chat.contextSheet.stateTitle")}
      >
        {highlights.length === 0 ? (
          <SectionEmpty text={t("chat.contextSheet.emptyState")} />
        ) : (
          <dl className="flex flex-col gap-2">
            {highlights.map((highlight) => (
              <div className="flex flex-col gap-0.5" key={highlight.path}>
                <dt className="truncate text-[12px] text-[color:var(--realm-fg-muted)]">
                  {highlight.label}
                </dt>
                <dd className="truncate text-[14px] text-[color:var(--realm-fg)]">
                  {highlight.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </ContextSection>

      <ContextSection
        icon={<UsersIcon className="size-4" />}
        meta={t("chat.contextSheet.rolesMeta")(roles.length)}
        testId="god-chat-context-sheet-roles"
        title={t("chat.contextSheet.rolesTitle")}
      >
        {roles.length === 0 ? (
          <SectionEmpty text={t("chat.contextSheet.emptyRoles")} />
        ) : (
          <ul className="flex flex-col gap-1">
            {roles.map((role) => (
              <li className="flex items-center gap-2.5 rounded-lg py-1 text-[14px]" key={role.id}>
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--realm-line)] font-medium text-[12px] text-[color:var(--realm-fg-muted)]"
                >
                  {initialOf(role.displayName)}
                </span>
                <span className="truncate text-[color:var(--realm-fg)]">{role.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </ContextSection>

      {/*
       * Precise-tweak entries (nl-first-vision: controls are the rare
       * exception). At most two: the command palette is the power-user path
       * to legacy/advanced surfaces; settings is provider/model/runtime. NOT
       * a button wall, NOT the legacy 5-tab app.
       */}
      <div className="flex flex-col gap-2 border-[color:var(--realm-line)] border-t pt-4">
        <p className="px-0.5 font-medium text-[12px] text-[color:var(--realm-fg-faint)] uppercase tracking-wide">
          {t("chat.contextSheet.tweaksTitle")}
        </p>
        <TweakRow
          hint={t("chat.contextSheet.commandPaletteHint")}
          icon={<CommandIcon className="size-4" />}
          label={t("chat.contextSheet.commandPalette")}
          onClick={() => {
            onRequestClose();
            onOpenCommandPalette();
          }}
          testId="god-chat-context-sheet-command"
        />
        <TweakRow
          hint={t("chat.contextSheet.settingsHint")}
          icon={<SettingsIcon className="size-4" />}
          label={t("chat.contextSheet.settings")}
          onClick={() => {
            onRequestClose();
            onOpenSettings();
          }}
          testId="god-chat-context-sheet-settings"
        />
      </div>
    </div>
  );
}

type ContextSectionProps = {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  testId: string;
  children: React.ReactNode;
};

/** A read-only section header + body. Mirrors the rail's calm sectioning. */
function ContextSection({ icon, title, meta, testId, children }: ContextSectionProps) {
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

function SectionEmpty({ text }: { text: string }) {
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
function TweakRow({ icon, label, hint, onClick, testId }: TweakRowProps) {
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

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "?";
}
