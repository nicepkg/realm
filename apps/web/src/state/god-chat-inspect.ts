import type { ChatCard, GodChatContext } from "@/state/god-chat-model.ts";
import {
  fieldKeyLabel,
  humanizeScalar,
  isPlainObject,
  stateKeyLabel,
} from "@/view-models/state-humanize.ts";

/**
 * God-chat world-state INSPECT answering (read-only, zh-CN). Pure + React-free:
 * turns the loaded world-state snapshot into a labelled, human-readable Chinese
 * view of each top-level container with known enum values humanized. The raw JSON
 * is carried as a SEPARATE `rawJson` field on the result card (rendered behind a
 * collapsed disclosure by the card UI) — never inlined into `detail` — so the
 * humanized tree is the authoritative, never-truncated reading. Split out of
 * `god-chat-runtime.ts` to keep both files under the 500-line budget; the runtime
 * file re-exports `answerWorldState` so existing import sites keep working.
 *
 * The humanization PRIMITIVES (label maps, `stateKeyLabel` / `fieldKeyLabel` /
 * `humanizeScalar`) live in `@/view-models/state-humanize.ts` so the mobile 高级
 * world-inspector sheet renders the SAME human reading from the SAME snapshot. This
 * file owns only the indented-TREE rendering that is specific to the chat card.
 */

const NO_WORLD_TEXT = "还没有进入任何世界，先创建或选择一个世界再下达指令吧。";

/**
 * The single honest placeholder a `renderSubtree` emits for a container/leaf that
 * has no real fields (an empty plain object, top-level or nested). Centralized so
 * the empty-section collapse logic can detect a placeholder-only subtree by exact
 * match against the indent-stripped line.
 */
const EMPTY_FIELD_PLACEHOLDER = "· （暂无字段）";

/** Summary copy when only `metaState` carries content (the typical fresh world). */
const ONLY_META_DETAIL = "这个世界还很新，目前只有运行元数据。";

/** Summary copy when every top-level container is empty (a truly blank world). */
const ALL_EMPTY_DETAIL = "该世界尚无更多状态。";

/**
 * Render an arbitrary state subtree as indented zh-CN `· 键：值` lines. Author/
 * engine key names are author-chosen and human-meaningful — shown VERBATIM; only
 * a leaf VALUE that matches a known enum is humanized (e.g. `severity: medium` →
 * `severity：中`). Plain objects recurse so nested leaf enums still get humanized;
 * arrays/empty objects collapse to a single honest line. `depth` drives indent.
 */
function renderSubtree(value: unknown, depth: number, roleNames: Map<string, string>): string[] {
  const indent = "  ".repeat(depth + 1);
  if (!isPlainObject(value)) {
    return [`${indent}· ${humanizeScalar(value)}`];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return [`${indent}${EMPTY_FIELD_PLACEHOLDER}`];
  }
  const lines: string[] = [];
  for (const [childKey, childValue] of entries) {
    // A child whose key is a known role id (whether nested under a `roles`
    // container or sitting directly under privateState) renders as the author's
    // display name; well-known engine fields get a zh-CN label; everything else
    // stays verbatim.
    const label = fieldKeyLabel(childKey, roleNames.has(childKey), roleNames);
    if (isPlainObject(childValue) && Object.keys(childValue).length > 0) {
      // Recurse one level deeper so nested leaf enum values are still humanized.
      lines.push(`${indent}· ${label}：`);
      lines.push(...renderSubtree(childValue, depth + 1, roleNames));
    } else if (isPlainObject(childValue)) {
      // An EMPTY plain object leaf (e.g. publicState.roles={} on a fresh world)
      // is NOT a scalar — stringifying it would leak `[object Object]`. A SINGLE
      // nested empty leaf is still worth showing (readability call from the brief),
      // so render it through the honest placeholder path; only a WHOLE empty section
      // gets collapsed away at the top level (see `answerWorldState`).
      lines.push(`${indent}· ${label}：（暂无字段）`);
    } else {
      lines.push(`${indent}· ${label}：${humanizeScalar(childValue)}`);
    }
  }
  return lines;
}

/** zh-CN placeholder tail a `label：（暂无字段）` empty-leaf line ends with. */
const EMPTY_LEAF_SUFFIX = "：（暂无字段）";

/**
 * A rendered line carries no real field when it is either the bare empty-field
 * placeholder (`· （暂无字段）`, an empty container) or a labeled empty-object leaf
 * (`· 角色：（暂无字段）`, e.g. `privateState.roles={}` on a fresh world). Both are
 * pure placeholders — neither conveys an actual value.
 */
function isPlaceholderLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed === EMPTY_FIELD_PLACEHOLDER || trimmed.endsWith(EMPTY_LEAF_SUFFIX);
}

/**
 * A section's rendered lines carry no real fields when EVERY line is a placeholder
 * (an empty container, or a wrapper holding only empty-object leaves). Such a
 * section is collapsed away entirely instead of being printed as a hollow
 * `【世界全景】\n  · （暂无字段）` / `【角色私密】\n  · 角色：（暂无字段）` block. A
 * section with even one real field — or one real field alongside a single nested
 * empty leaf — is NOT empty and renders in full (the lone empty leaf is kept for
 * readability, per the F1 brief).
 */
function isEmptySection(lines: string[]): boolean {
  return lines.every(isPlaceholderLine);
}

/** A single rendered top-level section plus whether it carries any real fields. */
type RenderedSection = { empty: boolean; key: string; lines: string[] };

/** Render one non-empty section to its `【标签】\n…lines` block. */
function sectionBlock(section: RenderedSection): string {
  return `【${stateKeyLabel(section.key)}】\n${section.lines.join("\n")}`;
}

/**
 * Top-level container keys that, when non-empty, carry per-role sub-trees (each
 * role's 存活/禁言/疑虑/伤势…). A world that populates either of these is the kind
 * of DENSE world whose full humanized tree reads as a long indented dump — exactly
 * the F3 case we fold behind `展开全部`.
 */
const ROLE_BEARING_KEYS = new Set(["privateState", "derivedState"]);

/**
 * The rendered-tree line count above which a world is treated as DENSE even when it
 * has few sections (one big section with many fields still reads as a wall). A cap,
 * not a target: a sparse world (a handful of lines) stays comfortably inline.
 */
const DENSE_LINE_CAP = 12;

/**
 * Decide whether a world is DENSE enough to fold its full per-field tree behind a
 * `展开全部` disclosure (F3). A world is dense when ANY of:
 *  - it has ≥ 3 non-empty top-level sections (云岭-class multi-container world), OR
 *  - its full rendered tree exceeds `DENSE_LINE_CAP` lines (one fat section still
 *    reads as a wall), OR
 *  - it carries a role-bearing container (privateState/derivedState) with real
 *    fields — a per-role sub-tree (存活/禁言…×N roles) is the canonical long dump.
 * A sparse/fresh world fails all three and keeps the current full-inline reading.
 */
function isDenseWorld(nonEmpty: RenderedSection[]): boolean {
  if (nonEmpty.length >= 3) {
    return true;
  }
  const totalLines = nonEmpty.reduce((sum, section) => sum + section.lines.length, 0);
  if (totalLines > DENSE_LINE_CAP) {
    return true;
  }
  return nonEmpty.some((section) => ROLE_BEARING_KEYS.has(section.key));
}

/**
 * Compose the CONCISE `detail` for a dense world: ONLY the transition line listing
 * the non-empty top-level section headings, so the operator sees at a glance WHAT
 * the world records without scrolling the full tree (which rides `detailLong`
 * behind `展开全部`). The version+count summary is NOT repeated here — it is already
 * the leading bubble `text`, so duplicating it inside the card printed the same
 * 「当前世界（版本 vN）记录了…」sentence twice (F3). The detail therefore carries only
 * the calm "这些方面记录了内容" précis line.
 */
function composeDenseSummary(nonEmpty: RenderedSection[]): string {
  const headings = nonEmpty.map((section) => `「${stateKeyLabel(section.key)}」`).join("、");
  return `当前在这些方面记录了内容：${headings}。展开下方查看每一项细节。`;
}

/**
 * Compose the humanized `detail` from the rendered sections, collapsing empties:
 *
 * - all sections empty (a truly blank world) → a single honest sentence;
 * - only `metaState` carries content (the typical fresh world, every author-facing
 *   container still empty) → a lead-in sentence + the one non-empty section;
 * - otherwise → just the non-empty sections, joined as before.
 */
function composeDetail(sections: RenderedSection[], nonEmpty: RenderedSection[]): string {
  if (nonEmpty.length === 0) {
    return ALL_EMPTY_DETAIL;
  }
  const blocks = nonEmpty.map(sectionBlock);
  const onlyMetaLeft =
    nonEmpty.length === 1 && nonEmpty[0]?.key === "metaState" && sections.length > nonEmpty.length;
  if (onlyMetaLeft) {
    return `${ONLY_META_DETAIL}\n\n${blocks.join("\n\n")}`;
  }
  return blocks.join("\n\n");
}

/**
 * Answer a world-state inspect from the loaded snapshot. Read-only: never mutates
 * and never schedules a write. The DEFAULT answer is zh-CN — a labelled,
 * human-readable view of each top-level container (公开状态→世界全景, 角色私密,
 * 天机（隐藏）, 推演结果, 运行元数据) with known enum values humanized — with NO
 * bare English container key in the prose or summary. The raw JSON is carried on a
 * SEPARATE `rawJson` field of the SAME result card (rendered behind a collapsed
 * disclosure by the card UI), so a power-inspect of every field still survives
 * without ever leaking a JSON tail into the humanized reading.
 */
export function answerWorldState(ctx: GodChatContext): { text: string; card: ChatCard } {
  if (!ctx.worldId) {
    return { card: inspectCard("世界状态", NO_WORLD_TEXT), text: NO_WORLD_TEXT };
  }
  if (!ctx.worldState) {
    const text = "世界状态尚未加载完成，稍后再问一次。";
    return { card: inspectCard("世界状态", text), text };
  }
  const { state, version } = ctx.worldState;
  const keys = Object.keys(state);
  if (keys.length === 0) {
    const text = `当前世界还是一张白纸（版本 v${version}），还没有任何状态字段。`;
    return { card: inspectCard("世界状态", text), text };
  }

  // zh-CN summary: count + the friendly container labels, never the English keys.
  const labels = keys.map(stateKeyLabel);
  const summary = `当前世界（版本 v${version}）记录了 ${keys.length} 类状态：${labels.join("、")}。`;

  // Map every role id to its display name so deep `roles.<id>` / privateState.<id>
  // keys render as 雷军 / 顾辰风 instead of leijun / guchenfeng.
  const roleNames = new Map(ctx.roles.map((role) => [role.id, role.displayName] as const));

  // zh-CN detail: one labelled section per top-level container that ACTUALLY has
  // content. An empty container (typical of a freshly-created world) is collapsed
  // away rather than printed as a hollow `· （暂无字段）` line, so a blank world no
  // longer shows 4-5 identical placeholder sections. This is the AUTHORITATIVE
  // human reading and is never truncated. The raw JSON is NOT inlined here — it
  // rides a separate `rawJson` card field the UI tucks behind a collapsed
  // disclosure, so the humanized tree stays clean and power-inspect still sees all.
  const renderedSections = keys.map((key) => {
    const lines = renderSubtree(state[key], 0, roleNames);
    return { empty: isEmptySection(lines), key, lines };
  });
  const nonEmpty = renderedSections.filter((section) => !section.empty);
  const fullTree = composeDetail(renderedSections, nonEmpty);
  const rawJson = JSON.stringify(state, null, 2);

  // DENSE world (云岭-class, multiple containers / per-role sub-trees): lead the
  // card with a CONCISE summary in `detail` and move the full humanized tree into
  // `detailLong`, which the card folds behind a `展开全部` disclosure. SPARSE/fresh
  // worlds keep the full tree inline in `detail` (no `detailLong`) so a small world
  // still reads in one glance. This mirrors the existing rawJson treatment: the
  // authoritative reading is never truncated, only progressively disclosed.
  if (isDenseWorld(nonEmpty)) {
    const denseDetail = composeDenseSummary(nonEmpty);
    return {
      card: inspectCard("世界状态", denseDetail, { detailLong: fullTree, rawJson }),
      text: summary,
    };
  }

  return { card: inspectCard("世界状态", fullTree, { rawJson }), text: summary };
}

/**
 * Build the read-only inspect result card (shared shape with role-memory inspect).
 * `rawJson` and `detailLong`, when provided, ride SEPARATE card fields the UI
 * renders behind their own collapsed disclosures — never concatenated into
 * `detail`. A sparse-world / placeholder card passes neither.
 */
function inspectCard(
  title: string,
  detail: string,
  extras: { detailLong?: string; rawJson?: string } = {},
): ChatCard {
  return {
    detail,
    detailLong: extras.detailLong,
    kind: "inspect",
    rawJson: extras.rawJson,
    title,
    variant: "result",
  };
}
