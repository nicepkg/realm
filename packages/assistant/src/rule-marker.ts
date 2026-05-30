/**
 * Rule-marker prefix stripping. Pure, network-free helpers extracted from
 * intent-classifier so the world-rule branch can store only the rule BODY
 * (without the "设定规则：" directive prefix). Exported for read-only reuse by R1.
 */

/**
 * Leading rule-declaration prefixes ("设定规则：…"). Each pairs a phrase head with
 * a trailing colon (full-width ：or ASCII :) so we only ever strip an introductory
 * marker, never an inner colon that belongs to the rule body. Aligned with
 * WORLD_RULE_MARKERS, plus the longer natural-language openers the operator uses.
 * Ordered longest-first so "给世界加一条规则：" wins before the bare "规则：".
 */
const RULE_MARKER_PREFIX_PHRASES = [
  "给世界加一条规则",
  "给世界添加一条规则",
  "世界规则",
  "游戏规则",
  "设定规则",
  "设置规则",
  "规则",
  "world rule",
  "game rule",
  "rule",
];

/**
 * Strip a leading rule-declaration marker ("设定规则：" / "world rule:") from a
 * rule sentence so only the rule BODY is stored. Pure function (exported for R1
 * read-only reuse). Only the head prefix + its immediate colon is removed; any
 * colon inside the body is preserved. If stripping would leave an empty string,
 * the original (trimmed) text is returned so we never store a blank rule.
 */
export function stripRuleMarkerPrefix(body: string): string {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();
  for (const phrase of RULE_MARKER_PREFIX_PHRASES) {
    const lowerPhrase = phrase.toLowerCase();
    if (!lower.startsWith(lowerPhrase)) {
      continue;
    }
    // The marker must be immediately followed by a colon (： or :) to count as a
    // prefix; otherwise "规则只是参考" would be wrongly decapitated.
    const afterPhrase = trimmed.slice(phrase.length);
    const colonMatch = /^[：:]/.exec(afterPhrase);
    if (!colonMatch) {
      continue;
    }
    const rest = afterPhrase.slice(colonMatch[0].length).trim();
    return rest.length > 0 ? rest : trimmed;
  }
  return trimmed;
}
