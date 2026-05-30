/**
 * Shared world-state HUMANIZATION primitives (pure, React-free, zh-CN). These were
 * born inside `god-chat-inspect.ts` for the desktop inspect chat card; they are now
 * extracted here so EVERY surface that reads the same world-state snapshot —
 * the desktop inspect card AND the mobile 高级 world-inspector sheet — renders an
 * IDENTICAL human reading. Without this single source of truth, a role id leaks raw
 * on one surface (mobile showed `guchenfeng` instead of 顾辰风) while the other shows
 * the display name; a boolean leaks as `true` instead of 禁言：是; an empty object
 * leaks as `[object Object]`.
 *
 * Two consumer shapes are served:
 *  - the INDENTED tree renderer in `god-chat-inspect.ts` (re-imports the label maps
 *    + `stateKeyLabel` / `fieldKeyLabel` / `humanizeScalar`), and
 *  - the FLAT `key → value` table in `world-inspector-sheet.tsx` (via
 *    `humanizeFlatRows`, which walks the same dotted paths the old `flattenState`
 *    walked but humanizes every key segment and every leaf value).
 */

/**
 * Friendly zh-CN labels for the well-known top-level state containers. The state
 * snapshot the backend returns groups fields under English container keys
 * (`publicState` / `privateState` / `hiddenState` / `derivedState` / `metaState`).
 * Surfaced raw they read like a schema, not a world — so the humanized reading
 * renders these as calm Chinese labels instead of leaking the English key.
 *
 * Any key NOT in this map (a custom world's own top-level fields like `qi`) is an
 * author-chosen, already-human-meaningful name and is passed through VERBATIM —
 * we never invent a translation for it.
 */
export const STATE_CONTAINER_LABELS: Record<string, string> = {
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
export const ENUM_VALUE_LABELS: Record<string, string> = {
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
export const STATE_FIELD_LABELS: Record<string, string> = {
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
export function stateKeyLabel(key: string): string {
  return STATE_CONTAINER_LABELS[key] ?? key;
}

/**
 * Resolve a child field key to display copy. A role id (a key whose parent is a
 * `roles` container) is replaced with the author's display name (leijun → 雷军);
 * a well-known engine field gets its zh-CN label (season → 季节); anything else is
 * an author-meaningful key and is shown VERBATIM.
 */
export function fieldKeyLabel(
  key: string,
  isRoleId: boolean,
  roleNames: Map<string, string>,
): string {
  if (isRoleId) {
    return roleNames.get(key) ?? key;
  }
  return STATE_FIELD_LABELS[key] ?? key;
}

/** True for a plain object worth recursing into (so nested leaf enums humanize). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Humanize a leaf VALUE into zh-CN display copy. A known enum string maps to its
 * label (medium → 中); a role-id string maps to its display name (guchenfeng →
 * 顾辰风) so a `mutedBy` / owner-ref value never leaks an id; a boolean maps to 是/否
 * (so `muted: false` reads 禁言：否, never the English token); null/array/object
 * degrade to honest placeholders so `[object Object]` never surfaces. `roleNames`
 * is optional so the indented-tree caller (which humanizes KEYS, not value-role-ids)
 * can keep its existing call shape.
 */
export function humanizeScalar(value: unknown, roleNames?: Map<string, string>): string {
  if (typeof value === "string") {
    return roleNames?.get(value) ?? ENUM_VALUE_LABELS[value] ?? value;
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

/** A single humanized `key → value` row for the flat world-state table. */
export type HumanizedRow = { key: string; value: string };

/**
 * Walk a world-state snapshot into HUMANIZED flat `key → value` rows for the mobile
 * 高级 inspector table. Mirrors the dotted-path traversal the old `flattenState`
 * used (recurse plain objects, leaf primitives/arrays terminate a row), but every
 * KEY segment and every VALUE is humanized through the SAME primitives the desktop
 * inspect card uses, so both surfaces agree:
 *
 *  - a key segment that is a known role id → its display name (guchenfeng → 顾辰风);
 *  - a key segment that is a well-known engine field → its zh-CN label (season → 季节);
 *  - any other key segment → VERBATIM (author-meaningful, e.g. moon-grass);
 *  - a leaf value → `humanizeScalar` (muted=false → 禁言：否 via the key+value pair;
 *    role-id values → display name; never `true` / `[object Object]`).
 *
 * An empty nested object terminates as a single honest placeholder row instead of
 * leaking `[object Object]` or an empty cell. The raw JSON (power-user view) is
 * rendered separately by the caller, so nothing is lost.
 */
export function humanizeFlatRows(
  state: Record<string, unknown> | undefined,
  roleNames: Map<string, string>,
): HumanizedRow[] {
  if (!state) {
    return [];
  }
  return collectRows(state, [], roleNames);
}

/** zh-CN placeholder for an empty nested object leaf in the flat table. */
const EMPTY_OBJECT_VALUE = "（暂无字段）";

/**
 * Recurse a state subtree into humanized flat rows. `segments` accumulates the
 * already-humanized key path; we join with `·` (not a dot) so a label like
 * `角色私密 · 顾辰风 · 禁言` reads as Chinese breadcrumbs rather than a code path.
 */
function collectRows(
  node: Record<string, unknown>,
  segments: string[],
  roleNames: Map<string, string>,
): HumanizedRow[] {
  // The TOP-LEVEL segment (segments empty) is a state container — label it through
  // `stateKeyLabel` so the breadcrumb reads `运行元数据 · 顾辰风 · 禁言`, identical to
  // the desktop inspect card's `【运行元数据】` section heading. Deeper segments are
  // ordinary fields / role ids and go through `fieldKeyLabel`.
  const isTopLevel = segments.length === 0;
  return Object.entries(node).flatMap(([key, value]): HumanizedRow[] => {
    const label = isTopLevel
      ? stateKeyLabel(key)
      : fieldKeyLabel(key, roleNames.has(key), roleNames);
    const path = [...segments, label];
    if (isPlainObject(value)) {
      const nested = collectRows(value, path, roleNames);
      // An empty object yields no nested rows — emit one honest placeholder row so
      // the key still shows up without leaking `[object Object]` / an empty cell.
      return nested.length > 0 ? nested : [{ key: path.join(" · "), value: EMPTY_OBJECT_VALUE }];
    }
    return [{ key: path.join(" · "), value: humanizeScalar(value, roleNames) }];
  });
}
