"use client";

import { ChevronRightIcon, GlobeIcon, UsersIcon } from "lucide-react";
import { useMemo } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils.ts";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import { flattenStateHighlights } from "./god-chat-context-rail-highlights.ts";

// The pure flatten/highlight machinery lives in `god-chat-context-rail-highlights.ts`
// to keep this file under the 500-line budget. Re-export the public surface so
// existing import sites (the mobile 高级 sheet, the tests) keep targeting this module.
export {
  type FlattenStateOptions,
  flattenStateHighlights,
  mutedRoleNames,
  pushMetaHighlights,
  pushRuleHighlights,
  type StateHighlight,
} from "./god-chat-context-rail-highlights.ts";

/**
 * GodChatContextRail — a slim, read-only context panel beside the chat (lg+
 * only; hidden on small screens). It is the "world shown quietly beside the
 * conversation", NOT a control wall: no buttons that mutate, no tabs, no rails.
 * Just the current world-state highlights + the cast of roles so the operator
 * can glance at what they are talking to. Collapsible sections keep it calm.
 *
 * Pure presentation: it reads the same `GodChatContext` the hook consumes and
 * renders it. Every label comes from props (zh-CN defaults) so it stays usable
 * before item 6's chat keys land.
 */

export type GodChatContextRailStrings = {
  stateTitle: string;
  /**
   * Roles-section heading. World-scope aware so the title itself answers "do these
   * roles belong to the current world?": inside a world it reads "本世界角色"; with no
   * world selected it reads "项目角色库" (the manager-level roster). This keeps the
   * roles section in lockstep with the state panel's world scope (W2 already
   * narrows `context.roles` to the selected world's members).
   */
  rolesTitle: (inWorld: boolean) => string;
  emptyState: string;
  /**
   * Roles empty copy. Inside a world this MUST echo the state panel's blank-slate
   * wording ("还没有角色") so an empty world reads consistently in both places; with
   * no world selected it explains the empty project roster instead.
   */
  emptyRoles: (inWorld: boolean) => string;
  /** Versioned world heading, e.g. "v3 · 4 个字段". */
  stateMeta: (version: number, fieldCount: number) => string;
  /** Counted roles summary, "成员" inside a world vs "角色" for the project roster. */
  rolesMeta: (count: number, inWorld: boolean) => string;
  /**
   * Calm bottom-anchored footer (F1). On a tall populated world the two sections
   * hug the top and the rail's lower ~45% reads as a blank slab. A single muted
   * world-version line pinned to the bottom anchors that region so it reads as an
   * intentional footer (the world "stamp"), not dead space — e.g.
   * "云岭修仙界 · v3 · 4 字段 · 2 成员". Not a card, no controls: one quiet line.
   */
  footerStamp: (parts: {
    version: number;
    fieldCount: number;
    memberCount: number;
    inWorld: boolean;
  }) => string;
};

export const defaultGodChatContextRailStrings: GodChatContextRailStrings = {
  emptyRoles: (inWorld) => (inWorld ? "这个世界还没有角色。" : "项目里还没有角色。"),
  emptyState: "世界还是一张白纸。",
  footerStamp: ({ version, fieldCount, memberCount, inWorld }) =>
    `v${version} · ${fieldCount} 字段 · ${memberCount} ${inWorld ? "成员" : "角色"}`,
  rolesMeta: (count, inWorld) => (inWorld ? `${count} 个成员` : `${count} 个角色`),
  rolesTitle: (inWorld) => (inWorld ? "本世界角色" : "项目角色库"),
  stateMeta: (version, fieldCount) => `v${version} · ${fieldCount} 个字段`,
  stateTitle: "世界状态",
};

export type GodChatContextRailProps = {
  context: GodChatContext;
  className?: string;
  strings?: GodChatContextRailStrings;
  /**
   * First-load balance (F3): when the conversation is still empty, the center
   * hero is vertically centered (justify-center). With the rail's summary block
   * pinned to the top, the lower-right of the lg+ layout reads as a large dead
   * zone. When `centered` is true the rail vertically centers its read-only
   * sections so their vertical rhythm shares the hero's — no extra controls, no
   * functional change. It collapses back to top-alignment the moment a turn
   * exists (the content then naturally grows top-down beside the scrolling
   * timeline). Scoped to the lg+ rail, so it never affects the <lg mobile layout
   * where the rail is hidden.
   *
   * Note this is the EXTERNAL signal (keyed to the empty transcript). The rail
   * ALSO self-detects a sparse WORLD (see {@link isSparseWorld}) and centers when
   * EITHER is true — so a just-created world with a non-empty transcript but
   * near-empty content still reads vertically balanced instead of top-heavy.
   */
  centered?: boolean;
};

/**
 * Below this many state highlights — paired with zero scoped members — the world
 * reads as "freshly created / near-empty": its 世界状态 section is populated enough
 * that the empty-transcript `centered` heuristic alone no longer balances it (the
 * rail's lower ~70% is still dead), yet it has no real substance to grow top-down
 * beside the chat. We center such a world too. A world crosses into "has
 * substance" (and reverts to top-alignment) the moment it gains MULTIPLE more
 * state fields OR any member — matching the operator's intuition that the world
 * now has enough to read as a normal top-aligned snapshot.
 */
const SPARSE_HIGHLIGHT_FLOOR = 5;

/**
 * True when the WORLD itself is near-empty: a small handful of state highlights
 * AND zero scoped members. A fresh world (just a few `publicState` fields, no
 * cast yet) is sparse; a world with several state fields OR any member is not.
 * Pure + exported so the centering decision is unit-testable without rendering.
 */
export function isSparseWorld(highlightCount: number, memberCount: number): boolean {
  return memberCount === 0 && highlightCount <= SPARSE_HIGHLIGHT_FLOOR;
}

export function GodChatContextRail({
  context,
  className,
  strings = defaultGodChatContextRailStrings,
  centered = false,
}: GodChatContextRailProps) {
  const roles = context.roles;
  const highlights = useMemo(
    () =>
      flattenStateHighlights(context.worldState?.state, {
        // Render muted roles by their display name (云遥), not the internal id.
        resolveRoleName: (roleId) =>
          roles.find((role) => role.id === roleId)?.displayName ?? roleId,
      }),
    [context.worldState?.state, roles],
  );
  const fieldCount = highlights.length;
  const version = context.worldState?.version ?? 0;
  // World scope drives the roles section's title / count / empty copy so the
  // operator is never left wondering whether a listed role belongs to the current
  // world. Inside a world `context.roles` is W2's world-scoped MEMBER list (empty
  // world → empty); with no world selected it is the project-wide roster.
  const inWorld = context.worldId !== undefined;
  // Self-detect a near-empty world (few state highlights + zero members). A
  // just-created world has a populated-enough 世界状态 that the external
  // empty-transcript `centered` heuristic alone stops visibly balancing the rail,
  // but it still has no substance to grow top-down — so we center it too. We
  // center when EITHER the external first-load signal OR the world is sparse.
  const sparse = isSparseWorld(fieldCount, roles.length);
  const balanced = centered || sparse;
  // F3/F1 (populated world): when the world HAS substance (members or many state
  // fields) the rail is top-aligned (`balanced` is false) so content grows
  // top-down beside the scrolling timeline. But on a tall desktop the two short
  // sections still hug the top and the column's lower region reads as a reserved
  // void. The fix is NOT to re-center (that would fight the top-down growth) nor
  // to add controls (this rail stays read-only-calm): instead the content sizes
  // to itself and the rail's bottom is ANCHORED.
  //   - With a real world (worldState present): a calm bottom-pinned footer (a
  //     hairline rule + a single muted version stamp, F1) anchors the lower ~45%
  //     so it reads as the world's quiet "stamp", not a blank slab.
  //   - With no real world (empty project roster, no worldState): there is nothing
  //     to stamp, so we keep the original thin closing rule directly under the
  //     content to "end" the column. A balanced (centered) rail has no top void.
  const hasWorldStamp = !balanced && context.worldState !== undefined;
  const showClosingRule = !balanced && !hasWorldStamp;

  return (
    <aside
      className={cn(
        // `justify-start` (default) keeps the content block hugging the top so it
        // grows top-down beside the timeline; the block itself is `flex-none`
        // (see below) so a short summary never stretches into a tall reserved
        // column. The full-height aside keeps the calm background + `border-l`
        // divider reading cleanly down the whole column.
        "hidden w-72 shrink-0 flex-col gap-2 overflow-y-auto border-[color:var(--realm-line)] border-l bg-[var(--realm-bg)] p-4 lg:flex",
        // First-load balance (F3): vertically center the (short) read-only summary
        // so it shares the centered hero's vertical rhythm instead of pinning to
        // the top and leaving a dead lower-right zone. `justify-center` is safe
        // here because a sparse rail's content is minimal (two near-blank
        // sections); it reverts to default top-alignment as soon as the world
        // gains substance (multiple state fields or members).
        balanced && "lg:justify-center",
        className,
      )}
      data-testid="god-chat-context-rail"
      data-centered={balanced ? "true" : undefined}
      data-closed={showClosingRule || hasWorldStamp ? "true" : undefined}
    >
      <RailSection
        icon={<GlobeIcon className="size-4" />}
        meta={context.worldState ? strings.stateMeta(version, fieldCount) : undefined}
        testId="god-chat-rail-state"
        title={strings.stateTitle}
      >
        {highlights.length === 0 ? (
          <RailEmpty text={strings.emptyState} />
        ) : (
          <dl className="flex flex-col gap-1.5">
            {highlights.map((highlight) => (
              <div className="flex flex-col gap-0.5" key={highlight.path}>
                <dt className="truncate text-[12px] text-[color:var(--realm-fg-muted)]">
                  {highlight.label}
                </dt>
                <dd className="truncate text-[13px] text-[color:var(--realm-fg)]">
                  {highlight.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </RailSection>

      <RailSection
        icon={<UsersIcon className="size-4" />}
        meta={strings.rolesMeta(roles.length, inWorld)}
        testId="god-chat-rail-roles"
        title={strings.rolesTitle(inWorld)}
      >
        {roles.length === 0 ? (
          <RailEmpty text={strings.emptyRoles(inWorld)} />
        ) : (
          <ul className="flex flex-col gap-1">
            {roles.map((role) => (
              <li
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px]"
                key={role.id}
              >
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--realm-line)] font-medium text-[11px] text-[color:var(--realm-fg-muted)]"
                >
                  {initialOf(role.displayName)}
                </span>
                <span className="truncate text-[color:var(--realm-fg)]">{role.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </RailSection>

      {/*
       * F3 closing rule (worldless top-aligned roster). When there is no real
       * world to stamp, a single hairline rule under the last section closes out
       * the content so the remaining height reads as calm background, not dead
       * space. `mt-1` keeps it snug to the last section. Hidden when balanced or
       * when the world stamp footer takes over. Read-only + decorative.
       */}
      {showClosingRule ? (
        <div
          aria-hidden
          className="mt-1 h-px shrink-0 bg-[color:var(--realm-line)]"
          data-testid="god-chat-rail-closing-rule"
        />
      ) : null}

      {/*
       * F1 world stamp. On a tall populated world the two sections hug the top and
       * the lower ~45% reads as a blank slab. `mt-auto` pins this calm footer to
       * the very bottom: a hairline rule + one muted version line ("v3 · 4 字段 · 2
       * 成员"). It anchors the lower region as the world's quiet stamp — not a card,
       * no controls, single faint line. Only when top-aligned AND a real world
       * exists (a centered/balanced rail has no top void; a worldless roster has
       * nothing to stamp and keeps the closing rule instead).
       */}
      {hasWorldStamp ? (
        <div className="mt-auto flex flex-col gap-2 pt-3" data-testid="god-chat-rail-stamp">
          <div aria-hidden className="h-px shrink-0 bg-[color:var(--realm-line)]" />
          <p className="px-1.5 text-[11px] text-[color:var(--realm-fg-faint)] tabular-nums leading-4">
            {strings.footerStamp({ fieldCount, inWorld, memberCount: roles.length, version })}
          </p>
        </div>
      ) : null}
    </aside>
  );
}

type RailSectionProps = {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  testId: string;
  children: React.ReactNode;
};

/** A collapsible, read-only section header + body. Defaults open; calm chevron. */
function RailSection({ icon, title, meta, testId, children }: RailSectionProps) {
  return (
    <Collapsible className="group flex flex-col gap-2" data-testid={testId} defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--realm-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <ChevronRightIcon className="size-3.5 text-[color:var(--realm-fg-faint)] transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
        <span className="text-[color:var(--realm-fg-muted)]">{icon}</span>
        <span className="font-medium text-[13px] text-[color:var(--realm-fg)]">{title}</span>
        {meta ? (
          <span className="ml-auto text-[11px] text-[color:var(--realm-fg-faint)]">{meta}</span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function RailEmpty({ text }: { text: string }) {
  return <p className="text-[12px] text-[color:var(--realm-fg-faint)] leading-5">{text}</p>;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1).toUpperCase() : "?";
}
