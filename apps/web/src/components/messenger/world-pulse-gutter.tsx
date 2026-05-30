"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils.ts";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import { type WorldPulseFact, worldPulseFacts } from "@/view-models/labels.ts";

/**
 * WorldPulseGutter — an ULTRA-WIDE-ONLY (>=1536px / `2xl:`) ambient world-pulse
 * rail floated into the otherwise-empty left gutter beside the centered
 * conversation column. It exists purely to make >=1536px screens read as
 * intentional (F7): below 1536px it is `hidden` and never affects layout, so the
 * established max-w-4xl reading measure and the <1536px composition are untouched.
 *
 * NOT a control wall and NOT decorative filler: it is a REAL, read-only summary
 * of the ACTIVE world's LIVE context — the same `GodChatContext` (worldState +
 * world-scoped members) the lg+ context rail and the mobile 高级 sheet read. It
 * shows the live state version, the cast (count + names), the field count, and
 * any ambient time/place facts (时令 / 天数 / 地点) the world actually carries. A
 * single WeChat-green "live pulse" dot is the only accent; it breathes via the
 * shared `realm-breathe` token (reduced-motion safe).
 *
 * It updates live because it is fed the SAME context object the rail consumes:
 * when a God action / set-rule bumps the state version, the parent re-renders
 * this with the new `worldState`, so the version + facts follow automatically. No
 * separate subscription, no fabricated values, no new data path.
 *
 * Renders `null` when no world is active (nothing to pulse) so a worldless,
 * pre-creation screen keeps its calm empty gutter.
 */

export type WorldPulseGutterStrings = {
  /** Section eyebrow above the world name. */
  eyebrow: string;
  /** aria-label for the live-pulse status dot (zh-CN, screen-reader only). */
  pulseLabel: string;
  /** Versioned-state row label, e.g. `worldVersion(2)` → "状态 v2". */
  worldVersion: (version: number) => string;
  /** Cast-count row label, e.g. `roleCount(3)` → "3 位角色". */
  roleCount: (count: number) => string;
  /** Field-count row label, e.g. `fieldCount(4)` → "4 个状态字段". */
  fieldCount: (count: number) => string;
  /** Fallback world name when the active world has no readable name yet. */
  unnamedWorld: string;
};

export const defaultWorldPulseGutterStrings: WorldPulseGutterStrings = {
  eyebrow: "当前世界",
  fieldCount: (count) => `${count} 个状态字段`,
  pulseLabel: "世界正在运转",
  roleCount: (count) => `${count} 位角色`,
  unnamedWorld: "未命名世界",
  worldVersion: (version) => `状态 v${version}`,
};

export type WorldPulseGutterProps = {
  /** The SAME live context the rail/sheet read (worldState + scoped members). */
  context: GodChatContext;
  /** The active world's user-facing name, mirrored from the identity strip. */
  worldName?: string;
  className?: string;
  strings?: WorldPulseGutterStrings;
};

export function WorldPulseGutter({
  context,
  worldName,
  className,
  strings = defaultWorldPulseGutterStrings,
}: WorldPulseGutterProps) {
  const facts = useMemo<WorldPulseFact[]>(
    () => worldPulseFacts(context.worldState?.state),
    [context.worldState?.state],
  );
  // Reuse the rail's field-count semantics: the number of top-level state keys is
  // the same "字段" count the rail surfaces, derived from the same object here so
  // both rails agree without sharing the flatten helper (which expands containers
  // for a different purpose). Top-level key count is the stable, glanceable figure.
  const fieldCount = useMemo(
    () => Object.keys(context.worldState?.state ?? {}).length,
    [context.worldState?.state],
  );

  // No active world → nothing to pulse. The gutter quietly renders nothing rather
  // than an empty shell, so a pre-creation screen keeps its calm empty gutter.
  if (context.worldId === undefined || context.worldState === undefined) {
    return null;
  }

  const version = context.worldState.version;
  const roles = context.roles;
  const name = worldName?.trim() ? worldName.trim() : strings.unnamedWorld;

  return (
    // `hidden 2xl:flex`: invisible below 1536px (no layout effect on the converged
    // <1536px composition), a slim vertical column at >=1536px. Muted/secondary
    // throughout; it occupies the gutter and never competes with the chat.
    <aside
      aria-label={strings.eyebrow}
      className={cn(
        "hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto p-5 text-[color:var(--realm-fg-muted)] 2xl:flex",
        className,
      )}
      data-testid="world-pulse-gutter"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {/* The ONLY accent: a single WeChat-green pulse dot, breathing via the
              shared realm token (reduced-motion guarded globally in styles.css). */}
          <span
            aria-label={strings.pulseLabel}
            className="realm-breathe size-2 shrink-0 rounded-full bg-[color:var(--realm-green)]"
            data-testid="world-pulse-dot"
            role="img"
          />
          <span className="text-[11px] text-[color:var(--realm-fg-faint)] uppercase tracking-wide">
            {strings.eyebrow}
          </span>
        </div>
        <h2
          className="truncate font-medium text-[15px] text-[color:var(--realm-fg)]"
          data-testid="world-pulse-name"
        >
          {name}
        </h2>
      </header>

      <dl className="flex flex-col gap-3 text-[12px]">
        <PulseStat label={strings.worldVersion(version)} testId="world-pulse-version" />
        <PulseStat label={strings.roleCount(roles.length)} testId="world-pulse-roles">
          {roles.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5">
              {roles.map((role) => (
                <li className="truncate text-[color:var(--realm-fg)]" key={role.id}>
                  {role.displayName}
                </li>
              ))}
            </ul>
          ) : null}
        </PulseStat>
        <PulseStat label={strings.fieldCount(fieldCount)} testId="world-pulse-fields" />
      </dl>

      {facts.length > 0 ? (
        <dl
          className="flex flex-col gap-2 border-[color:var(--realm-line)] border-t pt-3 text-[12px]"
          data-testid="world-pulse-facts"
        >
          {facts.map((fact) => (
            <div className="flex items-baseline justify-between gap-2" key={fact.key}>
              <dt className="shrink-0 text-[color:var(--realm-fg-faint)]">{fact.label}</dt>
              <dd className="truncate text-[color:var(--realm-fg)]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </aside>
  );
}

type PulseStatProps = {
  label: string;
  testId: string;
  children?: React.ReactNode;
};

/**
 * One read-only pulse row. The visible zh-CN `label` ("状态 v2" / "2 位角色" …) IS
 * the accessible text — no redundant `aria-label`/`role` is added, since the row
 * triggers no action and the parent `<aside aria-label="当前世界">` already names
 * the region a screen reader can jump to. The dot (a non-text glyph) carries its
 * own zh-CN aria-label; everything else reads from its visible Chinese text, so
 * there are no English leaks and no empty tab stops on static content.
 */
function PulseStat({ label, testId, children }: PulseStatProps) {
  return (
    <div className="rounded-md px-1 py-0.5" data-testid={testId}>
      <span className="text-[color:var(--realm-fg-muted)]">{label}</span>
      {children}
    </div>
  );
}
