import type { GodAction } from "./intent-types.ts";

/**
 * Keyword tables for the deterministic intent classifier (zh-CN first, English
 * aliases). Split out from `intent-classifier.ts` so the classifier file stays
 * pure routing logic and these data tables read as a cohesive lexicon. Each
 * table's routing rationale lives next to its `classifyIntent` branch.
 */

export const GOD_KEYWORDS: { action: GodAction; needles: string[] }[] = [
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
export const RUN_TURN_KEYWORDS = [
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
export const RUN_TURN_DIRECTIVE_VERBS = ["行动", "动起来"];

export const INSPECT_KEYWORDS = [
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

export const ROLE_MEMORY_KEYWORDS = ["知道", "记得", "了解", "memory", "knows", "remember"];

export const CONFIG_KEYWORDS = [
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
export const STATE_PATCH_KEYWORDS = [
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
export const CONDITION_PHRASE_KEYWORDS = [
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
export const WORLD_RULE_MARKERS = [
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
export const WORLD_RULE_PATTERN_KEYWORDS = [
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
export const WORLD_SWITCH_KEYWORDS = [
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
export const TRUST_ELEVATION_KEYWORDS = [
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
