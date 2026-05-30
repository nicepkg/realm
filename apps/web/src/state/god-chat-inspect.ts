import type { ChatCard, GodChatContext } from "@/state/god-chat-model.ts";

/**
 * God-chat world-state INSPECT answering (read-only, zh-CN). Pure + React-free:
 * turns the loaded world-state snapshot into a labelled, human-readable Chinese
 * view of each top-level container with known enum values humanized. The raw JSON
 * is carried as a SEPARATE `rawJson` field on the result card (rendered behind a
 * collapsed disclosure by the card UI) — never inlined into `detail` — so the
 * humanized tree is the authoritative, never-truncated reading. Split out of
 * `god-chat-runtime.ts` to keep both files under the 500-line budget; the runtime
 * file re-exports `answerWorldState` so existing import sites keep working.
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
 * Friendly zh-CN labels for the well-known top-level state containers. The state
 * snapshot the backend returns groups fields under English container keys
 * (`publicState` / `privateState` / `hiddenState` / `derivedState` / `metaState`).
 * Surfaced raw they read like a schema, not a world — so the DEFAULT inspect
 * answer renders these as calm Chinese labels instead of leaking the English key.
 *
 * Intentionally duplicated from `god-chat-context-rail.tsx`' STATE_KEY_LABELS
 * (it owns the rail; we own the inspect answer): a small, stable 5-entry map is
 * cheaper to keep in sync than to couple two files through a shared export.
 *
 * Any key NOT in this map (a custom world's own top-level fields like `qi`) is an
 * author-chosen, already-human-meaningful name and is passed through VERBATIM —
 * we never invent a translation for it.
 */
const STATE_CONTAINER_LABELS: Record<string, string> = {
  derivedState: "推演结果",
  hiddenState: "天机（隐藏）",
  metaState: "运行元数据",
  privateState: "角色私密",
  publicState: "世界全景",
};

/**
 * Humanized zh-CN labels for a few well-known enum values the engine emits, so a
 * default answer reads `严重程度：中` instead of leaking the bare English token
 * `severity: medium`. Only values that HAVE a label are translated; everything
 * else (numbers, author strings, unknown enums) is shown verbatim.
 */
const ENUM_VALUE_LABELS: Record<string, string> = {
  critical: "极高",
  high: "高",
  low: "低",
  medium: "中",
  none: "无",
};

/**
 * zh-CN labels for the common engine/world-schema field keys the cultivation-sim
 * (and similar worlds) emit, so a default inspect answer reads `季节：春` instead
 * of leaking the bare English token `season`. This is a BEST-EFFORT label map for
 * well-known fields only — any key NOT here is treated as an author-chosen,
 * already-human-meaningful name and passed through VERBATIM (we never invent a
 * translation, so a custom world's `moon-grass` / `fire-root` survives unchanged).
 */
const STATE_FIELD_LABELS: Record<string, string> = {
  alive: "存活",
  ambientQi: "环境灵气",
  dangerLevel: "危险等级",
  day: "天",
  doubts: "疑虑",
  fate: "天命",
  herbs: "草药",
  hiddenGoal: "隐藏目标",
  id: "标识",
  injuries: "伤势",
  location: "地点",
  muted: "禁言",
  name: "姓名",
  nextDisaster: "下一场灾劫",
  nextRecommendedAction: "建议行动",
  qi: "灵气",
  realm: "境界",
  reputation: "声望",
  role: "身份",
  roles: "角色",
  season: "季节",
  sect: "宗门",
  severity: "严重程度",
  spiritStones: "灵石",
  status: "状态",
  supplyNotes: "补给记录",
  threats: "威胁",
  tick: "节拍",
  time: "时间",
  traitorHint: "内奸线索",
  turn: "回合",
  weather: "天气",
  world: "世界",
};

/** Map a top-level container key to its zh-CN label, or pass it through verbatim. */
function stateKeyLabel(key: string): string {
  return STATE_CONTAINER_LABELS[key] ?? key;
}

/**
 * Resolve a child field key to display copy. A role id (a key whose parent is a
 * `roles` container) is replaced with the author's display name (leijun → 雷军);
 * a well-known engine field gets its zh-CN label (season → 季节); anything else is
 * an author-meaningful key and is shown VERBATIM.
 */
function fieldKeyLabel(key: string, isRoleId: boolean, roleNames: Map<string, string>): string {
  if (isRoleId) {
    return roleNames.get(key) ?? key;
  }
  return STATE_FIELD_LABELS[key] ?? key;
}

/** True for a plain object worth recursing into (so nested leaf enums humanize). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Humanize a known enum string; leave anything else as a faithful display value. */
function humanizeScalar(value: unknown): string {
  if (typeof value === "string") {
    return ENUM_VALUE_LABELS[value] ?? value;
  }
  if (typeof value === "boolean") {
    // A bare `true` / `false` leaf (e.g. `alive` / `muted`) reads as a value-layer
    // English leak in an all-zh-CN UI — map it to the generic 是/否 pair. The key's
    // own label (存活 / 禁言) is unaffected; the raw boolean only survives in rawJson.
    return value ? "是" : "否";
  }
  if (value === null) {
    return "（空）";
  }
  if (Array.isArray(value)) {
    return `${value.length} 项`;
  }
  return String(value);
}

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
  const detail = composeDetail(renderedSections, nonEmpty);
  const rawJson = JSON.stringify(state, null, 2);

  return { card: inspectCard("世界状态", detail, rawJson), text: summary };
}

/**
 * Build the read-only inspect result card (shared shape with role-memory inspect).
 * `rawJson`, when provided, rides a SEPARATE card field the UI renders behind a
 * collapsed disclosure — it is never concatenated into `detail`.
 */
function inspectCard(title: string, detail: string, rawJson?: string): ChatCard {
  return { detail, kind: "inspect", rawJson, title, variant: "result" };
}
