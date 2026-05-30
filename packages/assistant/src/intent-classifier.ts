import { inferConfigPlanFromGoal } from "./index.ts";
import type {
  GodAction,
  IntentRouter,
  IntentRouterContext,
  IntentRouterRole,
  IntentRouterWorld,
  IntentStateOperation,
  RealmIntent,
} from "./intent-types.ts";
import { isInterrogative } from "./is-interrogative.ts";

/**
 * Deterministic NL → intent classifier. Pure logic, no network: powers the fake
 * runtime (coherent demo with no API key) and the model-backed router's fallback.
 */

// --- Keyword tables (zh-CN first, English aliases) ---------------------------

const GOD_KEYWORDS: { action: GodAction; needles: string[] }[] = [
  { action: "mute", needles: ["禁言", "封口", "闭嘴", "mute", "silence"] },
  {
    action: "revive",
    needles: ["解禁", "复活", "恢复", "解除", "unmute", "revive", "unban"],
  },
  { action: "kill", needles: ["处死", "杀掉", "击杀", "灭", "kill", "remove"] },
];

/**
 * Genuine speech / action verbs that justify advancing a turn. Note "让" is NOT
 * here: alone it is too generic ("让顾辰风心生退意" is a state change, not a
 * turn). Bare "让" is only a run-turn signal when combined with one of these
 * verbs ("让顾辰风说话"), which `classifyIntent` enforces.
 */
const RUN_TURN_KEYWORDS = [
  "说话",
  "发言",
  "回应",
  "回复",
  "出场",
  "轮到",
  "出手",
  "开口",
  // Common "say something / chat / a few words" speak verbs. An operator routinely
  // asks a role to "说点什么 / 聊聊 / 说几句" — these advance the role's turn, not a
  // state change. (Live-model defect: '让顾辰风在全员议事说点什么' misrouted to inspect.)
  "说点什么",
  "说些什么",
  "说几句",
  "说两句",
  "说说",
  "聊聊",
  "聊几句",
  "讲两句",
  "开口说",
  "speak",
  "respond",
  "reply",
  "act",
  "say something",
  "take a turn",
  "run turn",
];

/**
 * Action verbs ambiguous on their own ("行动" can read as a state change) that
 * only mean run-turn when the operator framed it as a directive with "让".
 * Splitting these out keeps a bare "顾辰风受伤行动不便" from triggering a turn.
 */
const RUN_TURN_DIRECTIVE_VERBS = ["行动", "动起来"];

const INSPECT_KEYWORDS = [
  "什么状态",
  "现在状态",
  "状态如何",
  "查看",
  "知道",
  "了解",
  "记得",
  "有哪些",
  "看看",
  "查询",
  "是什么",
  "怎么样",
  "?",
  "？",
  "status",
  "inspect",
  "what",
  "which",
  "show",
  "list",
  "know",
  "remember",
];

const ROLE_MEMORY_KEYWORDS = ["知道", "记得", "了解", "memory", "knows", "remember"];

const CONFIG_KEYWORDS = [
  "创建",
  "新建",
  "建一个",
  "添加",
  "加一个",
  "新增",
  "设定规则",
  "设置规则",
  "规则",
  "世界",
  "角色",
  "create",
  "add",
  "new world",
  "new role",
  "rule",
];

// State-patch is detected by attribute-assignment phrasing ("给X加上Y", "把X的Y设为Z").
const STATE_PATCH_KEYWORDS = [
  "加上",
  "添加属性",
  "属性",
  "状态设为",
  "设为",
  "设置成",
  "改成",
  "增加",
  "减少",
  "扣",
  "受伤",
  "中毒",
  "断了",
  "失去",
  "获得",
  "condition",
  "attribute",
  "set state",
];

/**
 * Emotional / physical / mental condition phrasing. A sentence carrying any of
 * these describes a CHANGE to a role's inner or bodily state — it is a
 * state-patch, NOT a turn, even when phrased as "让X<condition>". Splitting
 * these from STATE_PATCH_KEYWORDS keeps the "让X<emotion>" pattern (which also
 * needs "让" / a role) readable while the plain list above stays a pure
 * keyword check. (F8: "让顾辰风此刻心生退意" used to leak into run-turn.)
 */
const CONDITION_PHRASE_KEYWORDS = [
  "心生",
  "产生",
  "变得",
  "此刻",
  "陷入",
  "感到",
  "感受到",
  "退意",
  "动摇",
  "恐惧",
  "害怕",
  "愤怒",
  "绝望",
  "退缩",
  "心灰意冷",
  "心软",
  "犹豫",
  "悲伤",
  "崩溃",
  "情绪",
];

/**
 * World-rule phrasing — declares a WORLD-LEVEL rule, not an attribute change on a
 * specific role. Two flavours:
 *  (a) explicit rule markers at/near the head of the sentence ("设定规则 / 规则是 /
 *      世界规则"); and
 *  (b) rule-shaped statements describing a recurring/economic mechanic ("每天… /
 *      每回合… / …可以买… / …会掉/会增加/会减少…").
 * A sentence that matches but ALSO names a concrete role is handled as an on-role
 * state-patch upstream — this branch only fires for role-less, world-level rules,
 * so it never swallows "给顾辰风加上…".
 */
const WORLD_RULE_MARKERS = [
  "设定规则",
  "设置规则",
  "规则是",
  "规则：",
  "规则:",
  "世界规则",
  "游戏规则",
  "world rule",
  "game rule",
];

/**
 * Rule-shaped statement patterns (no explicit "规则" word). These describe a
 * standing mechanic rather than a one-off state change, so they belong in
 * /metaState/rules. Kept conservative: each needs a recurrence/economy cue.
 */
const WORLD_RULE_PATTERN_KEYWORDS = [
  "每天",
  "每回合",
  "每个回合",
  "每轮",
  "可以买",
  "可以购买",
  "会掉",
  "会增加",
  "会减少",
  "会下降",
  "会上升",
];

/**
 * World-switch phrasing — "切换到X / 打开X / 进入X / 去X世界 / switch to X". These
 * are DIRECTIVE markers that, combined with a world the operator named (resolved
 * against context.worlds), mean "make X the active world", NOT a question about
 * the current world's state. We require BOTH a marker AND a name match so an
 * inspect like "进入世界后会怎样？" never mis-fires as a switch.
 */
const WORLD_SWITCH_KEYWORDS = [
  "切换到",
  "切换至",
  "切到",
  "打开",
  "进入",
  "去",
  "前往",
  "回到",
  "切换世界",
  "切换地图",
  "switch to",
  "switch world",
  "go to",
  "open world",
  "enter world",
];

// Trust-elevation phrasing — "提升信任 / 允许运行角色 / 解除只读 / run roles".
const TRUST_ELEVATION_KEYWORDS = [
  "提升信任",
  "提高信任",
  "抬升信任",
  "信任等级",
  "信任级别",
  "允许运行角色",
  "允许运行",
  "允许写入状态",
  "允许写入",
  "允许执行",
  "解除只读",
  "退出只读",
  "关闭只读",
  "解锁写入",
  "trust",
  "elevate",
  "run roles",
  "allow write",
  "exit read-only",
];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/** Match against both the raw and lowercased goal (CJK-safe, Latin case-insensitive). */
function matchesEither(goal: string, normalized: string, needles: string[]): boolean {
  return includesAny(normalized, needles) || includesAny(goal, needles);
}

/** Lowercase for case-insensitive Latin matching; CJK is unaffected. */
function normalize(goal: string): string {
  return goal.toLowerCase();
}

/**
 * Find the role the operator referenced by display name or id. Longest match
 * wins so "顾辰风" beats a stray "顾". Returns undefined when no role matches.
 */
function matchRole(goal: string, roles: IntentRouterRole[]): IntentRouterRole | undefined {
  const normalized = normalize(goal);
  let best: IntentRouterRole | undefined;
  let bestLength = 0;
  for (const role of roles) {
    const candidates = [role.displayName, role.id].filter(Boolean);
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (lower.length === 0) {
        continue;
      }
      const matched = goal.includes(candidate) || normalized.includes(lower);
      if (matched && candidate.length > bestLength) {
        best = role;
        bestLength = candidate.length;
      }
    }
  }
  return best;
}

/**
 * Find the world the operator named by display name or id. Longest match wins so
 * "云岭修仙界" beats a stray "云岭". Mirrors `matchRole` (the palette already proves
 * this name→id resolver). Returns undefined when no world name appears in the goal.
 */
function matchWorld(goal: string, worlds: IntentRouterWorld[]): IntentRouterWorld | undefined {
  const normalized = normalize(goal);
  let best: IntentRouterWorld | undefined;
  let bestLength = 0;
  for (const world of worlds) {
    const candidates = [world.name, world.id].filter(Boolean);
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (lower.length === 0) {
        continue;
      }
      const matched = goal.includes(candidate) || normalized.includes(lower);
      if (matched && candidate.length > bestLength) {
        best = world;
        bestLength = candidate.length;
      }
    }
  }
  return best;
}

/**
 * Detect a world-level rule declaration. True when the sentence carries an
 * explicit rule marker OR a rule-shaped recurrence/economy pattern. The caller
 * guards on `!role` so an on-role state-patch ("给顾辰风加上…") is never absorbed.
 */
function isWorldRuleDeclaration(goal: string, normalized: string): boolean {
  return (
    matchesEither(goal, normalized, WORLD_RULE_MARKERS) ||
    matchesEither(goal, normalized, WORLD_RULE_PATTERN_KEYWORDS)
  );
}

function matchGodAction(goal: string): GodAction | undefined {
  const normalized = normalize(goal);
  for (const entry of GOD_KEYWORDS) {
    if (includesAny(normalized, entry.needles) || includesAny(goal, entry.needles)) {
      return entry.action;
    }
  }
  return undefined;
}

/**
 * Build a single JSON-pointer state operation from free text. We keep the raw
 * sentence as the value so the patch is human-readable and reversible; the path
 * namespaces conditions under the matched role. This is deliberately simple and
 * deterministic — the model-backed router produces richer ops.
 */
function buildStateOperation(
  goal: string,
  role: IntentRouterRole | undefined,
): IntentStateOperation {
  const roleSegment = role ? sanitizePointerSegment(role.id) : "world";
  // Land the condition under the privateState container the world schema (and the
  // chat context rail's 角色私密 counter) actually track. Writing to a bare
  // `/roles/...` path created an orphan branch the rail never counted; namespacing
  // under `/privateState/roles/<id>/conditions` keeps the write where readers look.
  return {
    op: "append",
    path: `/privateState/roles/${roleSegment}/conditions`,
    value: goal.trim(),
  };
}

/** JSON Pointer segments escape "~" and "/" (RFC 6901). */
function sanitizePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Deterministic NL → intent classifier. Order matters: the most specific,
 * write-bearing families are checked first, and anything ambiguous falls back
 * to a safe `inspect` answer so we never perform a silent write.
 */
export function classifyIntent(goal: string, context: IntentRouterContext): RealmIntent {
  const trimmed = goal.trim();
  const normalized = normalize(trimmed);
  const role = matchRole(trimmed, context.roles);
  const worldId = context.worldId ?? "";

  // A QUESTION must never become a write. Detected up front so every write-bearing
  // branch (god / state-patch / run-turn) can defer to a read. "现在世界什么状态？
  // 顾辰风被禁言了吗" is an inspect, NOT a God mute (NO-QUESTION-WRITE).
  const interrogative = isInterrogative(trimmed);

  // 0. Trust elevation — "提升信任等级 / 允许运行角色 / 解除只读". Checked FIRST so a
  // permission request is never swallowed by the config classifier (a config
  // edit itself needs trust, which would dead-loop the operator).
  if (matchesEither(trimmed, normalized, TRUST_ELEVATION_KEYWORDS)) {
    return { kind: "trust-elevation", tier: "run-roles" };
  }

  // 1. God adjudication — explicit punish/pardon verbs targeting a role. Gated on
  // `!interrogative`: "顾辰风被禁言了吗？" carries a God keyword + a role but is a
  // question, so it falls through to inspect instead of executing a mute write.
  const godAction = matchGodAction(trimmed);
  if (godAction && role && !interrogative) {
    return {
      kind: "god",
      targetRoleId: role.id,
      action: godAction,
      reason: trimmed,
    };
  }

  // 2. State patch — attribute/condition assignment on a (usually named) role.
  // Two detectors: (a) plain assignment keywords ("加上 / 设为 / 受伤"); and (b)
  // emotional·physical·mental condition phrasing ("心生退意 / 变得恐惧 / 此刻动摇"),
  // including the directive form "让X<condition>". Both yield an append op so the
  // condition reads back verbatim. (F8: condition phrasing must NOT fall to run-turn.)
  // Gated on `!interrogative`: an imperative assignment ("给顾辰风加上断了一根肋骨")
  // writes, but a question that merely contains an assignment word ("顾辰风的状态
  // 设为什么了？") is a read and must fall through to inspect.
  const hasStatePatchKeyword = matchesEither(trimmed, normalized, STATE_PATCH_KEYWORDS);
  const hasConditionPhrase = matchesEither(trimmed, normalized, CONDITION_PHRASE_KEYWORDS);
  if ((hasStatePatchKeyword || hasConditionPhrase) && !interrogative) {
    return {
      kind: "state-patch",
      worldId,
      operations: [buildStateOperation(trimmed, role)],
      reason: trimmed,
    };
  }

  // 2b. World rule — a WORLD-LEVEL rule declaration ("设定规则：每天掉一点灵气").
  // Must run BEFORE config (whose CONFIG_KEYWORDS also list 规则, but route to the
  // role/world-only planner that mints a placeholder "新角色"). Guarded on `!role`
  // so it only fires for role-less rule sentences; "给顾辰风加上…" already returned
  // as an on-role state-patch above. The rule is world-level, so it writes to
  // /metaState/rules (the per-world meta container readers/the rail already track),
  // NOT the per-role /privateState path buildStateOperation produces.
  if (!role && !interrogative && isWorldRuleDeclaration(trimmed, normalized)) {
    return {
      kind: "state-patch",
      worldId,
      operations: [{ op: "append", path: "/metaState/rules", value: trimmed }],
      reason: trimmed,
    };
  }

  // 3. Run turn — "现在让顾辰风说话": names a role AND a real speech/action verb,
  // not a question. A bare "让" is NOT enough (F8): it only counts when paired
  // with a directive verb ("让X行动"); otherwise a genuine speak verb is required.
  // Uses the shared interrogative guard so "让顾辰风说话了吗？" reads as inspect.
  const hasSpeechVerb = matchesEither(trimmed, normalized, RUN_TURN_KEYWORDS);
  const hasDirective = matchesEither(trimmed, normalized, ["让", "let"]);
  const hasDirectiveVerb =
    hasDirective && matchesEither(trimmed, normalized, RUN_TURN_DIRECTIVE_VERBS);
  if (role && !interrogative && (hasSpeechVerb || hasDirectiveVerb)) {
    const roomId = context.defaultRoomId ?? context.rooms[0]?.id ?? "";
    return { kind: "run-turn", roleId: role.id, roomId };
  }

  // 3b. World switch — "切换到云岭修仙界 / 打开X世界". A directive marker PLUS a world
  // the operator named (resolved against context.worlds) means "make X active",
  // NOT a world-state inspect. Checked BEFORE inspect so a clear switch command is
  // never swallowed by the catch-all read (NO-NL-WORLD-SWITCH). Requiring a name
  // match keeps "进入世界后会怎样？" (no real world named) out of this branch.
  const worlds = context.worlds ?? [];
  if (matchesEither(trimmed, normalized, WORLD_SWITCH_KEYWORDS)) {
    const world = matchWorld(trimmed, worlds);
    if (world) {
      return { kind: "world-switch", worldId: world.id };
    }
  }

  // 4. Inspect — questions / read requests answer from state or role memory.
  if (includesAny(normalized, INSPECT_KEYWORDS) || includesAny(trimmed, INSPECT_KEYWORDS)) {
    const roleMemory =
      role &&
      (includesAny(normalized, ROLE_MEMORY_KEYWORDS) || includesAny(trimmed, ROLE_MEMORY_KEYWORDS));
    if (roleMemory) {
      return { kind: "inspect", target: "role-memory", roleId: role.id, query: trimmed };
    }
    return { kind: "inspect", target: "world-state", query: trimmed };
  }

  // 5. Config — world/role/rule creation routes THROUGH the existing planner so
  // world/role creation behaviour is unchanged.
  if (includesAny(normalized, CONFIG_KEYWORDS) || includesAny(trimmed, CONFIG_KEYWORDS)) {
    return { kind: "config", goal: trimmed, plan: inferConfigPlanFromGoal(trimmed) };
  }

  // 6. Ambiguous fallback — answer, never silently write.
  return { kind: "inspect", target: "world-state", query: trimmed };
}

/** Deterministic router wrapper for symmetry with the model-backed one. */
export class DeterministicIntentRouter implements IntentRouter {
  async classify(goal: string, context: IntentRouterContext): Promise<RealmIntent> {
    return classifyIntent(goal, context);
  }
}
