import { inferConfigPlanFromGoal } from "./index.ts";
import {
  CONDITION_PHRASE_KEYWORDS,
  CONFIG_KEYWORDS,
  GOD_KEYWORDS,
  INSPECT_KEYWORDS,
  ROLE_MEMORY_KEYWORDS,
  RUN_TURN_DIRECTIVE_VERBS,
  RUN_TURN_KEYWORDS,
  STATE_PATCH_KEYWORDS,
  TRUST_ELEVATION_KEYWORDS,
  WORLD_RULE_MARKERS,
  WORLD_RULE_PATTERN_KEYWORDS,
  WORLD_SWITCH_KEYWORDS,
} from "./intent-keywords.ts";
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
import { stripRuleMarkerPrefix } from "./rule-marker.ts";

export { stripRuleMarkerPrefix }; // re-exported for R1's read-only reuse (impl in helper)

/**
 * EXPLICIT world-rule declaration test (markers only). True when `text` literally
 * names a world rule via one of {@link WORLD_RULE_MARKERS} ("设定规则 / 规则： /
 * 世界规则 / world rule") and is NOT a question.
 *
 * This is the high-confidence "set a WORLD-LEVEL rule" signal — exposed as a pure,
 * network-free predicate so callers (notably the web model-backed router) can
 * recover the world-rule DESTINATION when a real provider mis-classifies a marked
 * rule as add-role / create-world / a god action, WITHOUT re-deriving rule
 * detection in another layer. Deliberately NARROWER than the classifier's internal
 * {@link isWorldRuleDeclaration}: it uses ONLY the explicit markers, never the
 * recurrence/economy patterns ("每天… / 会减少…"), so an ordinary attribute patch
 * ("现金跑道减少一个季度") or a plain mechanic sentence is NEVER mistaken for an
 * explicit rule declaration. The `!isInterrogative` gate preserves NO-QUESTION-WRITE:
 * "现在世界设定了哪些规则？" carries 规则 but is a question, so it returns false.
 *
 * Note: unlike the in-classifier branch this does NOT gate on `!role`. A marked
 * rule that happens to name a role ("规则：IPO 前不得稀释陈牧的股份") is still an
 * explicit WORLD rule; the explicit marker is the discriminator, not the absence of
 * a role. Callers that want on-role state-patches to win should check those first.
 */
export function declaresWorldRule(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || isInterrogative(trimmed)) {
    return false;
  }
  return matchesEither(trimmed, normalize(trimmed), WORLD_RULE_MARKERS);
}

/**
 * Extract the rule BODY from an explicit world-rule declaration — the SAME body the
 * classifier's own `/metaState/rules` branch stores. Pure wrapper over
 * {@link stripRuleMarkerPrefix} (re-exported for symmetry) so callers recovering a
 * mis-classified rule store the marker-stripped body, never a "设定规则：…"-prefixed
 * copy on one path and the bare body on the other. One source of truth for the rule
 * text; the destination pointer is the caller's concern.
 */
export function extractWorldRuleBody(text: string): string {
  return stripRuleMarkerPrefix(text.trim());
}

/**
 * Deterministic NL → intent classifier. Pure logic, no network: powers the fake
 * runtime (coherent demo with no API key) and the model-backed router's fallback.
 * Keyword tables live in `./intent-keywords.ts`; routing rationale stays inline
 * with each `classifyIntent` branch.
 */

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

  // 2b. World rule — a role-less WORLD-LEVEL rule declaration ("设定规则：每天掉一点
  // 灵气"). Runs BEFORE config (CONFIG_KEYWORDS also list 规则 but mint a placeholder
  // "新角色"). Guarded on `!role` so "给顾辰风加上…" already returned as an on-role
  // state-patch above. World-level → writes /metaState/rules (the per-world meta
  // container readers/the rail track), not the per-role /privateState path. The
  // leading "设定规则：" marker is stripped so the stored rule reads the BODY only.
  if (!role && !interrogative && isWorldRuleDeclaration(trimmed, normalized)) {
    const ruleBody = stripRuleMarkerPrefix(trimmed);
    return {
      kind: "state-patch",
      worldId,
      operations: [{ op: "append", path: "/metaState/rules", value: ruleBody }],
      reason: ruleBody,
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
