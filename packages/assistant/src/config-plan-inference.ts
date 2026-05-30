import type { CreateRolePatchInput, CreateWorldPatchInput } from "@realm/config";
import { deriveStableRoleId, deriveStableWorldId } from "./role-world-id.ts";

// Re-export so existing importers of the id derivers via this module (and the
// `config-plan-inference.test.ts` role-id contract) keep their import path.
export { deriveStableRoleId, deriveStableWorldId } from "./role-world-id.ts";

export type AssistantConfigPlan =
  | { kind: "role"; role: CreateRolePatchInput }
  | { kind: "world"; world: CreateWorldPatchInput };

export function inferConfigPlanFromGoal(goal: string): AssistantConfigPlan {
  const normalized = goal.toLowerCase();
  if (normalized.includes("world") || goal.includes("世界")) {
    return { kind: "world", world: inferWorldFromGoal(goal) };
  }

  return { kind: "role", role: inferRoleFromGoal(goal) };
}

export function inferRoleFromGoal(goal: string): CreateRolePatchInput {
  const normalized = goal.toLowerCase();
  if (normalized.includes("buffett") || goal.includes("巴菲特")) {
    return {
      id: "buffett",
      displayName: "巴菲特",
      model: "default",
      summary: "长期价值投资者。",
    };
  }
  if (normalized.includes("qa") || goal.includes("测试")) {
    return {
      id: "qa",
      displayName: "质量评审",
      model: "default",
      summary: "负责质量把关与回归审查。",
    };
  }

  // Generic case: distill a deterministic Chinese persona from the goal so the
  // preview card / 将执行 echo stays zh-only instead of an English stub.
  // `extractRoleName` separates the bare name from a trailing profession noun
  // ("叫沈墨的剑修" -> name=沈墨, profession=剑修) so the displayName never
  // absorbs a job title and the profession can seed the summary instead.
  const { name: extractedName, profession } = extractRoleName(goal);
  const name = extractedName ?? "新角色";
  return {
    id: deriveStableRoleId(name),
    displayName: name,
    model: "default",
    summary: distillRoleSummary(goal, name, profession),
  };
}

export function inferWorldFromGoal(goal: string): CreateWorldPatchInput {
  const themed = inferWorldThemeFromGoal(goal);
  // Name resolution, most-faithful first:
  //   1. an explicitly proposed name (quoted「云岭」/ verb-led 名叫青云界)
  //   2. the explicit "…世界" descriptor the user actually typed, verbatim
  //      (赛博修真世界 -> 赛博修真世界) — never drop a leading modifier like 赛博
  //   3. a keyword-composed "{labels}世界" when only loose theme cues are present
  //      (废土末世的世界 -> 废土世界)
  //   4. a generic 新世界 when none of the above exist — never the English stub.
  const name = extractProposedName(goal) ?? extractWorldName(goal) ?? themed?.name ?? "新世界";
  return {
    // A stable, unique, idSchema-safe id derived from the resolved name. Two
    // distinct NL worlds must NOT collapse onto one `.agents/worlds/<id>/` path,
    // and the same goal must re-derive the same id so resolveCreatedWorldId's
    // plan-rederive fallback still matches the patch's manifest path.
    id: deriveStableWorldId(name),
    name,
    mode: themed?.mode ?? "sandbox",
    // Human-facing display NAME for the default world-main room. patch-store
    // hardcodes the room *id* to "main"; only this NAME comes from roomName, and
    // it is persisted verbatim into world.yaml (no localization happens at write
    // time), so it must already be the zh-CN label — matching the seeded
    // cultivation-sim convention ("全员议事") — not the English stable id "main".
    roomName: "全员议事",
    roleIds: [],
  };
}

type WorldMode = CreateWorldPatchInput["mode"];

// Theme keywords -> (display label, mode bias). Narrative-genre worlds lean on
// `game` (turn-driven story play); everything else stays in the sandbox default.
// Each entry's `label` is the zh fragment we compose into "{label}世界" when a
// theme matches and no explicit name was proposed.
const WORLD_THEME_KEYWORDS: ReadonlyArray<{
  readonly match: readonly string[];
  readonly label: string;
  readonly mode: WorldMode;
}> = [
  { match: ["修真", "修仙"], label: "修真", mode: "game" },
  { match: ["仙侠"], label: "仙侠", mode: "game" },
  { match: ["玄幻"], label: "玄幻", mode: "game" },
  { match: ["武侠"], label: "武侠", mode: "game" },
  { match: ["江湖"], label: "江湖", mode: "game" },
  { match: ["西幻"], label: "西幻", mode: "game" },
  { match: ["赛博朋克", "cyberpunk"], label: "赛博朋克", mode: "sandbox" },
  { match: ["末世", "末日"], label: "末世", mode: "sandbox" },
  { match: ["废土"], label: "废土", mode: "sandbox" },
  { match: ["科幻", "sci-fi", "scifi"], label: "科幻", mode: "sandbox" },
  { match: ["克苏鲁", "cthulhu"], label: "克苏鲁", mode: "sandbox" },
];

/**
 * Detect themed-world intent from a free-form goal. Concatenates every matched
 * theme label in keyword order so a multi-genre prompt (赛博朋克武侠) keeps both
 * cues in the world name. A narrative genre anywhere in the matches biases the
 * mode toward `game`. Returns undefined when no theme keyword is present.
 */
export function inferWorldThemeFromGoal(
  goal: string,
): { name: string; mode: WorldMode } | undefined {
  const normalized = goal.toLowerCase();
  const matched: Array<{ label: string; mode: WorldMode }> = [];
  for (const theme of WORLD_THEME_KEYWORDS) {
    if (theme.match.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      matched.push({ label: theme.label, mode: theme.mode });
    }
  }
  if (matched.length === 0) {
    return undefined;
  }
  // De-dupe labels while preserving keyword order, then compose "{labels}世界".
  const labels = [...new Set(matched.map((entry) => entry.label))];
  const mode: WorldMode = matched.some((entry) => entry.mode === "game") ? "game" : "sandbox";
  return { name: `${labels.join("")}世界`, mode };
}

// Leading scaffolding that precedes a world descriptor but is NOT part of the
// authored name. Stripped, longest-first, from the front of the raw "…世界"
// descriptor so 创建一个赛博修真 reduces to 赛博修真 (and 有宗门 doesn't start the
// name with 有). Multi-char verb phrases come before their single-char roots so
// the longest scaffolding is removed first.
const WORLD_NAME_LEADING_SCAFFOLD: readonly string[] = [
  "帮我创建",
  "帮我搭建",
  "帮我做",
  "帮我建",
  "帮我弄",
  "帮忙做",
  "帮忙建",
  "请创建",
  "请帮我",
  "创建",
  "创造",
  "搭建",
  "构建",
  "生成",
  "新建",
  "想要",
  "需要",
  "这么一个",
  "这个",
  "那个",
  "一个",
  "一座",
  "做",
  "建",
  "弄",
  "整",
  "要",
  "想",
  "给",
  "帮",
  "有",
  "和",
  "与",
  "及",
  "或",
  "个",
  "一",
];

/**
 * Pull the explicit "…世界" noun phrase the operator literally typed so the
 * preview shows what they wrote, verbatim, instead of a keyword-recomposed name
 * that silently drops a leading modifier (赛博修真世界 -> '修真世界' would lose
 * 赛博). We scan back from the LAST "世界" over a contiguous run of CJK chars,
 * cut anything before the last 的 (it belongs to a different clause), peel
 * leading verb/quantifier scaffolding, and return "{descriptor}世界" when a real
 * descriptor survives.
 *
 * Returns undefined when:
 *   - the goal has no "世界" at all, or
 *   - the descriptor before "世界" is empty after stripping scaffolding
 *     (帮我建一个世界 / 废土末世的世界 -> nothing real remains) — the caller then
 *     falls back to the keyword-composed "{labels}世界".
 */
export function extractWorldName(goal: string): string | undefined {
  const suffix = "世界";
  const suffixIndex = goal.lastIndexOf(suffix);
  if (suffixIndex < 0) {
    return undefined;
  }
  // Walk backwards from just before "世界", collecting a contiguous CJK run.
  let start = suffixIndex;
  while (start > 0 && isCjkChar(goal[start - 1] as string)) {
    start -= 1;
  }
  let descriptor = goal.slice(start, suffixIndex);
  // A trailing-clause "的" means the descriptor before it qualifies a different
  // noun and "世界" stands alone (废土末世的世界); keep only what follows the last 的.
  const lastDe = descriptor.lastIndexOf("的");
  if (lastDe >= 0) {
    descriptor = descriptor.slice(lastDe + 1);
  }
  // Peel leading verb/quantifier scaffolding (创建一个 / 有 / 一座 …), longest-first,
  // repeatedly so stacked scaffolding (创建 + 一个) all comes off.
  let trimmed = true;
  while (trimmed && descriptor.length > 0) {
    trimmed = false;
    for (const scaffold of WORLD_NAME_LEADING_SCAFFOLD) {
      if (descriptor.startsWith(scaffold)) {
        descriptor = descriptor.slice(scaffold.length);
        trimmed = true;
        break;
      }
    }
  }
  if (descriptor.length === 0) {
    return undefined;
  }
  return `${descriptor}${suffix}`;
}

function isCjkChar(char: string): boolean {
  return /[一-鿿]/u.test(char);
}

// Punctuation that terminates a proposed-name clause.
const NAME_STOP_CHARS = "，,、。.！!？?；;：:\\s";

// Verb cues that introduce a proposed name in zh natural language.
const NAME_INTRO_PATTERNS: readonly RegExp[] = [
  // Quoted forms: 「…」 / "…" / '…' / "…" / '…'.
  /[「『""']([^」』""',，、。.！!？?；;：:]+)[」』""']/u,
  // Verb-led forms: 叫X / 名为X / 名叫X / 取名X / 起名X / 命名为X / 称为X.
  /(?:命名为|取名为|起名为|名叫|名为|取名|起名|叫做|叫作|叫|称为)\s*([^，,、。.！!？?；;：:\s]+)/u,
];

/**
 * Pull a proposed Chinese name out of a free-form goal. Returns undefined when
 * no quoted/verb-led name is present so callers can apply their own fallback.
 * Drops any trailing profession/common-noun ("叫白衣的剑客" -> 白衣); callers
 * that also need the profession should use {@link extractRoleName}.
 */
export function extractProposedName(goal: string): string | undefined {
  return extractRoleName(goal).name;
}

/**
 * Split a proposed name from a trailing profession noun. Covers three zh
 * phrasings that pack a job title next to the name:
 *   - 叫X的Y / 名为X的Y / 名叫X的Y  (X=name, Y=profession)
 *   - 一个Y叫X / 一名Y叫X            (Y=profession, X=name)
 *   - 叫X的Y where Y is a recognized profession noun (handled via 的-split)
 * Returns the bare name plus the profession when one is detected so the
 * displayName stays a clean name and the profession seeds the summary.
 * Returns name=undefined when no quoted/verb-led name is present.
 */
export function extractRoleName(goal: string): {
  name: string | undefined;
  profession?: string;
} {
  // "一个Y叫X" / "一名Y叫X": the profession precedes the verb cue. Capture it so
  // a later 叫-pattern match doesn't strand the profession in the displayName.
  const professionBeforeName = goal.match(
    /(?:一个|一名|一位)\s*([^，,、。.！!？?；;：:\s]+?)(?:叫做|叫作|名叫|名为|叫)\s*([^，,、。.！!？?；;：:\s的]+)/u,
  );
  if (professionBeforeName) {
    const profession = professionBeforeName[1]?.trim();
    const candidate = professionBeforeName[2]?.trim();
    if (candidate) {
      const split = splitNameAndProfession(candidate);
      return {
        name: split.name,
        profession: split.profession ?? sanitizeProfession(profession),
      };
    }
  }

  for (const pattern of NAME_INTRO_PATTERNS) {
    const match = goal.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      // The verb cue can sweep in a trailing "的{profession}" or a bare
      // profession suffix (叫沈墨的剑修 -> 沈墨 + 剑修); peel it off here.
      return splitNameAndProfession(candidate);
    }
  }
  return { name: undefined };
}

// Profession / role nouns that commonly trail a name. The job title belongs in
// the summary, never the displayName. Covers both 修真/武侠 archetypes and common
// modern professions so "叫零号的黑客" splits into name=零号 / profession=黑客
// instead of swallowing the job title into the displayName.
const PROFESSION_NOUNS: readonly string[] = [
  // 修真 / 武侠 archetypes.
  "剑修",
  "剑客",
  "侠客",
  "炼丹师",
  "法师",
  "术士",
  "武者",
  "修士",
  "弟子",
  "长老",
  "掌门",
  // Modern professions / identities.
  "黑客",
  "程序员",
  "工程师",
  "侦探",
  "律师",
  "医生",
  "护士",
  "记者",
  "特工",
  "间谍",
  "雇佣兵",
  "赏金猎人",
  "猎人",
  "杀手",
  "刺客",
  "商人",
  "学者",
  "教授",
  "老师",
  "画家",
  "歌手",
  "演员",
  "作家",
  "诗人",
  "厨师",
  "司机",
  "警察",
  "军人",
  "士兵",
  "将军",
  "队长",
  "船长",
  "助手",
  "助理",
];

// Structural common nouns (not professions) that can also trail a name.
const STRUCTURAL_COMMON_NOUNS: readonly string[] = ["角色", "世界", "门派"];

// Union used by the summary distiller to recognize non-trait structural tails.
const TRAILING_COMMON_NOUNS: readonly string[] = [...PROFESSION_NOUNS, ...STRUCTURAL_COMMON_NOUNS];

/** Keep a profession candidate only when it is a recognized job-title noun. */
function sanitizeProfession(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return PROFESSION_NOUNS.some((noun) => value.includes(noun)) ? value : undefined;
}

/**
 * Separate a name candidate from a trailing profession noun.
 *   - "沈墨的剑修" -> { name: 沈墨, profession: 剑修 } (的 + profession noun)
 *   - "白衣的剑客角色" -> { name: 白衣, profession: 剑客 } (structural tail dropped)
 *   - "沈墨剑修" -> { name: 沈墨, profession: 剑修 } (bare profession suffix)
 *   - "孤傲的人" / "冷峻寡言" -> name kept intact (no profession noun present)
 */
function splitNameAndProfession(candidate: string): {
  name: string;
  profession?: string;
} {
  // "{name}的{tail}" — split when the tail leads with a recognized common noun.
  const deIndex = candidate.indexOf("的");
  if (deIndex > 0) {
    const tail = candidate.slice(deIndex + 1);
    const noun = TRAILING_COMMON_NOUNS.find((entry) => tail.startsWith(entry));
    if (noun) {
      return { name: candidate.slice(0, deIndex), profession: sanitizeProfession(noun) };
    }
  }
  // Bare profession suffix: "沈墨剑修" -> 沈墨 + 剑修.
  for (const noun of PROFESSION_NOUNS) {
    if (candidate.length > noun.length && candidate.endsWith(noun)) {
      return { name: candidate.slice(0, -noun.length), profession: noun };
    }
  }
  // Bare structural suffix carries no profession: "白衣角色" -> 白衣.
  for (const noun of STRUCTURAL_COMMON_NOUNS) {
    if (candidate.length > noun.length && candidate.endsWith(noun)) {
      return { name: candidate.slice(0, -noun.length) };
    }
  }
  return { name: candidate };
}

/**
 * Distill a short Chinese summary from the profession + every trait clause that
 * follows the name (e.g. "叫沈墨的剑修，孤傲、护短" -> "沈墨，剑修。孤傲，护短。").
 * Collects ALL trailing trait clauses, not just the first, so secondary traits
 * (护短) survive. Falls back to a generic zh sentence for pure-English / no-trait
 * goals instead of echoing raw goal text.
 */
function distillRoleSummary(goal: string, name: string, profession?: string): string {
  // Take whatever comes after the name; the trait clauses usually trail it.
  const afterName = name ? goal.slice(goal.indexOf(name) + name.length) : goal;
  const traits = afterName
    .split(new RegExp(`[${NAME_STOP_CHARS}]+`, "u"))
    // Drop residual quote/bracket glyphs the name extractor stopped beside.
    .map((segment) => segment.replace(/^[「『""'」』""']+|[「『""'」』""']+$/gu, "").trim())
    .filter(Boolean)
    // Keep descriptive traits: drop residual structural noun phrases the name
    // extractor swept past (e.g. "的剑修") and bare connectors.
    .filter(
      (segment) =>
        containsCjk(segment) &&
        !segment.startsWith("的") &&
        !TRAILING_COMMON_NOUNS.some((noun) => segment.includes(noun)),
    );

  // Compose "{name}，{profession}。{trait1，trait2}。" — profession and traits
  // are independent: either, both, or neither may be present.
  const traitClause = traits.length > 0 ? `${traits.join("，")}。` : "";
  if (profession && traitClause) {
    return `${name}，${profession}。${traitClause}`;
  }
  if (profession) {
    return `${name}，${profession}。`;
  }
  if (traitClause) {
    return `${name}，${traitClause}`;
  }
  return `${name}，由对话设定的自定义角色。`;
}

function containsCjk(value: string): boolean {
  return /[一-鿿]/u.test(value);
}
