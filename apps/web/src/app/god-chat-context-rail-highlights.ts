/**
 * Pure, React-free flattening of a world-state object into the calm, capped list
 * of glanceable highlights the God-chat context rail (and the mobile 高级 sheet)
 * render. Split out of `god-chat-context-rail.tsx` to keep both files under the
 * 500-line budget; the rail imports + re-exports these so existing call sites
 * (the sheet, the tests) keep targeting either module.
 *
 * The goal is a *world snapshot*, not a schema dump — see
 * {@link flattenStateHighlights} for the per-container rules. Privacy line:
 * private / hidden state is NEVER expanded here; only the explicitly-public
 * `publicState` children and the two public `metaState` fields (rules + muted
 * roles) are shallow-peeked.
 */

import { STATE_CONTAINER_LABELS, STATE_FIELD_LABELS } from "@/view-models/state-humanize.ts";

/**
 * A flattened state highlight: a human-facing zh-CN `label`, a short stringified
 * `value`, and the raw dotted `path` (kept as the stable React key and a faint
 * technical hint, never the primary text — the operator reads a world snapshot,
 * not a schema dump).
 */
export type StateHighlight = { path: string; label: string; value: string };

/** Cap so the rail stays a glance, not a dump. The inspector sheet owns the full view. */
export const MAX_HIGHLIGHTS = 12;

/** Label used for each muted-role highlight ("禁言"). */
const MUTED_ROLE_LABEL = "禁言";

/** Label used for each world-rule highlight ("规则"). */
const RULE_LABEL = "规则";

/**
 * How many individual world rules to surface inline before collapsing the tail
 * into a single "还有 N 条" note. The rail is a glance: the first couple of rules
 * read as substance, the rest live in the inspector sheet's full tree. Keep this
 * low so a rule-heavy world never floods the snapshot past {@link MAX_HIGHLIGHTS}.
 */
const MAX_INLINE_RULES = 3;

/**
 * Top-level containers worth expanding one level so the snapshot has substance.
 * Only `publicState` is expanded blanket-style: its direct children are the
 * curated, labelled world/sect/roles containers. Other containers
 * (derivedState/hiddenState/…) hold arbitrary author/engine camelCase keys we
 * have no friendly label for, so we summarize them as a single line rather than
 * leak raw schema keys.
 *
 * `metaState` is the deliberate exception: it is NOT blanket-expanded (it can hold
 * engine bookkeeping like `tick`), but it carries two operator-critical PUBLIC
 * meta fields — the world `rules` list and per-role `muted` flags — that the
 * inspect card surfaces and the rail must too. We therefore do a controlled,
 * privacy-safe SHALLOW peek into just those two fields (see
 * {@link pushMetaHighlights}); everything else in `metaState` (and ALL of
 * private/hidden state) still collapses to the calm "N 项" summary.
 */
const EXPANDABLE_CONTAINERS = new Set(["publicState"]);

/** The single meta container whose public rules/muted summaries the rail peeks into. */
const META_CONTAINER_KEY = "metaState";

/**
 * Options for {@link flattenStateHighlights}. Optional so existing one-arg callers
 * (the mobile 高级 sheet) keep working unchanged and still benefit from the new
 * rules/muted summaries.
 */
export type FlattenStateOptions = {
  /**
   * Resolve a role id to its operator-facing display name, used to render muted
   * roles as "云遥 · 禁言" instead of the internal `yunyao` id. When absent (the
   * sheet path, which has no roster handy) the raw id is used as a graceful
   * fallback — the muted row still surfaces, just keyed by id.
   */
  resolveRoleName?: (roleId: string) => string;
};

/**
 * Flatten a world-state object into a capped list of glanceable, operator-facing
 * highlights. Read-only. The goal is a *world snapshot*, not a schema dump:
 *  - Well-known English schema containers (publicState / derivedState / …) get a
 *    zh-CN label instead of their raw key.
 *  - `publicState` is expanded one level so the snapshot shows real things
 *    (世界 / 宗门 / 角色) rather than an opaque `{3}`.
 *  - `metaState` is shallow-peeked for ONLY its two public operator-critical
 *    fields — the world `rules` list and per-role `muted` flags — so the rail can
 *    read the actual rule text + which roles are muted at a glance instead of an
 *    opaque "运行元数据: 2 项" (see {@link pushMetaHighlights}). Engine
 *    bookkeeping in metaState (tick, …) still collapses to one summary line.
 *  - Private / hidden state is NEVER expanded — it reads as a single summarized
 *    line (privacy + calm), the inspector sheet owns the full view.
 *  - A custom world's own top-level fields (qi / sect / …) pass through verbatim,
 *    INCLUDING a top-level `rules` array, which is shallow-expanded the same way
 *    as `metaState.rules`.
 */
export function flattenStateHighlights(
  state: Record<string, unknown> | undefined,
  options: FlattenStateOptions = {},
): StateHighlight[] {
  if (!state) {
    return [];
  }
  const highlights: StateHighlight[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (highlights.length >= MAX_HIGHLIGHTS) {
      break;
    }
    if (EXPANDABLE_CONTAINERS.has(key) && isPlainObject(value)) {
      // Expand one level so the snapshot carries substance, not "{N}".
      pushExpandedChildren(highlights, key, value);
      continue;
    }
    if (key === META_CONTAINER_KEY && isPlainObject(value)) {
      // Privacy-safe shallow peek into the two public meta fields the operator
      // most needs at a glance (rules + muted roles), then a summarized tail for
      // whatever bookkeeping remains so nothing leaks as raw camelCase keys.
      pushMetaHighlights(highlights, value, options);
      continue;
    }
    if (key === "rules" && Array.isArray(value)) {
      // A custom world's own top-level rules list — surface the actual rule text.
      pushRuleHighlights(highlights, value, key);
      continue;
    }
    highlights.push({
      label: containerLabel(key),
      path: key,
      value: summarizeValue(value),
    });
  }
  return highlights;
}

/** Push the direct children of an expandable container as their own highlights. */
function pushExpandedChildren(
  highlights: StateHighlight[],
  parentKey: string,
  container: Record<string, unknown>,
): void {
  for (const [childKey, childValue] of Object.entries(container)) {
    if (highlights.length >= MAX_HIGHLIGHTS) {
      return;
    }
    highlights.push({
      // Children of an expanded container (publicState's company / financials /
      // capTable / threats / keyAccounts, cultivation's world / sect / roles) are
      // FIELD keys, so they resolve through `STATE_FIELD_LABELS` — the same map the
      // desktop inspect tree + mobile humanized rows use. This is the I2 fix: before
      // this, boardroom-saga's publicState children leaked the bare English tokens.
      label: fieldLabel(childKey),
      path: `${parentKey}.${childKey}`,
      value: summarizeValue(childValue),
    });
  }
}

/**
 * Shallow-peek the PUBLIC operator-critical fields of `metaState` — the world
 * `rules` list and any `muted` roles — as their own readable highlights, then a
 * single calm summary for the remaining bookkeeping keys (tick, …). Private/hidden
 * state is never routed here; this is scoped to the explicitly-public meta fields
 * the inspect card already exposes. Pure + exported for unit testing.
 */
export function pushMetaHighlights(
  highlights: StateHighlight[],
  meta: Record<string, unknown>,
  options: FlattenStateOptions = {},
): void {
  const rules = meta.rules;
  if (Array.isArray(rules)) {
    pushRuleHighlights(highlights, rules, `${META_CONTAINER_KEY}.rules`);
  }
  const mutedNames = mutedRoleNames(meta.roles, options.resolveRoleName);
  for (const name of mutedNames) {
    if (highlights.length >= MAX_HIGHLIGHTS) {
      return;
    }
    highlights.push({
      label: MUTED_ROLE_LABEL,
      path: `${META_CONTAINER_KEY}.roles.muted.${name}`,
      value: name,
    });
  }
  // Whatever else metaState holds (tick, simulation, …) stays a single calm line
  // so engine bookkeeping never leaks as raw keys, and the count excludes the two
  // fields we already surfaced above.
  const remaining = Object.keys(meta).filter((key) => key !== "rules" && key !== "roles").length;
  if (remaining > 0 && highlights.length < MAX_HIGHLIGHTS) {
    highlights.push({
      label: containerLabel(META_CONTAINER_KEY),
      path: META_CONTAINER_KEY,
      value: `${remaining} 项`,
    });
  }
}

/**
 * Push the first {@link MAX_INLINE_RULES} rules as individual single-line
 * highlights (each truncated by the rail's CSS), then a "还有 N 条" tail note when
 * more remain — so a rule-heavy world reads its key rules without flooding the
 * snapshot. Non-string rule entries are stringified defensively. Pure + exported.
 */
export function pushRuleHighlights(
  highlights: StateHighlight[],
  rules: unknown[],
  basePath: string,
): void {
  const texts = rules.map((rule) => (typeof rule === "string" ? rule : String(rule)));
  const shown = texts.slice(0, MAX_INLINE_RULES);
  shown.forEach((text, index) => {
    if (highlights.length >= MAX_HIGHLIGHTS) {
      return;
    }
    highlights.push({
      label: RULE_LABEL,
      path: `${basePath}.${index}`,
      value: text,
    });
  });
  const overflow = texts.length - shown.length;
  if (overflow > 0 && highlights.length < MAX_HIGHLIGHTS) {
    highlights.push({
      label: RULE_LABEL,
      path: `${basePath}.more`,
      value: `还有 ${overflow} 条`,
    });
  }
}

/**
 * Collect the display names of muted roles from a `metaState.roles` map. A role is
 * muted when its entry has `muted === true`. Names resolve through `resolveRoleName`
 * (→ displayName) when provided, else fall back to the raw role id. Pure + exported.
 */
export function mutedRoleNames(
  rolesValue: unknown,
  resolveRoleName?: (roleId: string) => string,
): string[] {
  if (!isPlainObject(rolesValue)) {
    return [];
  }
  const names: string[] = [];
  for (const [roleId, entry] of Object.entries(rolesValue)) {
    if (isPlainObject(entry) && entry.muted === true) {
      names.push(resolveRoleName ? resolveRoleName(roleId) : roleId);
    }
  }
  return names;
}

/**
 * Map a TOP-LEVEL container key to its zh-CN label, mirroring `stateKeyLabel` in
 * state-humanize.ts: a known container (publicState / metaState / … and the
 * field-named `roles` container boardroom-saga surfaces) gets its zh-CN label;
 * anything else (a custom world's own top-level field like cultivation's `qi`) is
 * passed through VERBATIM — deliberately NOT routed through `STATE_FIELD_LABELS`,
 * so `qi` stays its author-chosen top-level reading rather than the field-leaf 灵气.
 */
function containerLabel(key: string): string {
  return STATE_CONTAINER_LABELS[key] ?? key;
}

/**
 * Map a CHILD / field key to its zh-CN label, mirroring the field branch of
 * `fieldKeyLabel` in state-humanize.ts (no role-id resolution here — the rail's
 * role rows resolve display names separately). `STATE_FIELD_LABELS` is the single
 * source of truth, carrying the full boardroom-saga finance/equity/governance set
 * (company / financials / capTable / threats / keyAccounts / …) plus the
 * cultivation fields (world / sect / roles / …); an unknown author-chosen key is
 * passed through VERBATIM.
 */
function fieldLabel(key: string): string {
  return STATE_FIELD_LABELS[key] ?? key;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Summarize a value into one short human line. Scalars pass through; collections
 * become a counted zh-CN summary ("3 项" / "2 个角色") instead of a bracketed
 * count, so the rail reads like a snapshot rather than a debugger.
 */
function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "空" : `${value.length} 项`;
  }
  if (typeof value === "object") {
    const count = Object.keys(value as object).length;
    return count === 0 ? "空" : `${count} 项`;
  }
  return String(value);
}
