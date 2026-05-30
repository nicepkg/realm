import { z } from "zod";
import { type ConfigPlannerModel, inferConfigPlanFromGoal } from "./index.ts";
import { classifyIntent } from "./intent-classifier.ts";
import type {
  IntentRouter,
  IntentRouterContext,
  IntentRouterWorld,
  RealmIntent,
} from "./intent-types.ts";
import { isInterrogative } from "./is-interrogative.ts";

/**
 * NL intent router — the model-backed half of the core natural-language
 * classifier the whole NL-first vision rests on. Free operator text is mapped to
 * one of five action families, each carrying a structured payload that the web
 * hook later feeds to the SDK.
 *
 * The deterministic classifier and intent contract live in sibling modules
 * ({@link ./intent-classifier.ts}, {@link ./intent-types.ts}); they are
 * re-exported here so existing `@realm/assistant` imports stay unchanged. This
 * module is PURE LOGIC: no React. A model-backed router wraps a
 * {@link ConfigPlannerModel} for real OpenAI/Gemini interpretation and falls
 * back to the deterministic classifier on any failure.
 */

export { classifyIntent, DeterministicIntentRouter } from "./intent-classifier.ts";
// Re-export the contract + deterministic classifier so consumers can keep
// importing everything from "./intent-router.ts" (and via `export *`).
export * from "./intent-types.ts";

// --- Model-backed router -----------------------------------------------------

const intentStateOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("increment"), path: z.string(), amount: z.number() }),
  z.object({ op: z.literal("append"), path: z.string(), value: z.unknown() }),
]);

const modelIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("god"),
    targetRoleId: z.string().min(1),
    action: z.enum(["kill", "mute", "revive"]),
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal("state-patch"),
    worldId: z.string().optional(),
    operations: z.array(intentStateOperationSchema).min(1),
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal("run-turn"),
    roleId: z.string().min(1),
    roomId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("inspect"),
    target: z.enum(["world-state", "role-memory"]),
    roleId: z.string().optional(),
    query: z.string().optional(),
  }),
  z.object({
    kind: z.literal("trust-elevation"),
    tier: z.enum(["run-roles"]).optional(),
  }),
  // World switch — the model names the target world by id and/or display name; we
  // resolve it against context.worlds and refuse to emit a switch we cannot back
  // with a real world (see hydrateModelIntent).
  z.object({
    kind: z.literal("world-switch"),
    worldId: z.string().optional(),
    worldName: z.string().optional(),
  }),
  // Config has no model branch here: it always routes through the existing planner.
  z.object({ kind: z.literal("config") }),
]);

/**
 * Model intent kinds that perform a WRITE (mutate world state, advance a turn,
 * change the active world, or elevate trust). When the operator's goal is an
 * actual question, a model-emitted write of any of these kinds is downgraded to a
 * deterministic re-classification — a question must never become a write, even
 * when the model says so (defense-in-depth NO-QUESTION-WRITE).
 */
const MODEL_WRITE_KINDS = new Set([
  "god",
  "state-patch",
  "run-turn",
  "trust-elevation",
  "world-switch",
]);

/**
 * Wraps a {@link ConfigPlannerModel} so a real provider (OpenAI/Gemini) can
 * interpret operator text into a structured intent. Config intents always
 * delegate to the existing deterministic config planner, keeping world/role
 * creation identical to today; the model never reshapes that path.
 *
 * On any model/parse failure the router falls back to the deterministic
 * classifier so the operator always gets a coherent, write-safe result.
 */
export class ModelBackedIntentRouter implements IntentRouter {
  constructor(private readonly model: ConfigPlannerModel) {}

  async classify(goal: string, context: IntentRouterContext): Promise<RealmIntent> {
    let raw: string;
    try {
      raw = await this.model.complete({
        system: INTENT_ROUTER_SYSTEM_PROMPT,
        prompt: buildIntentRouterPrompt(goal, context),
      });
    } catch {
      return classifyIntent(goal, context);
    }

    const parsed = parseModelIntent(raw);
    if (!parsed) {
      return classifyIntent(goal, context);
    }

    // Defense-in-depth NO-QUESTION-WRITE: a question must NEVER become a write,
    // even when the model insists. If the goal is interrogative yet the model
    // returned a write-bearing kind, distrust it and re-classify deterministically
    // — that path is guaranteed read-safe for questions (it routes them to inspect).
    if (isInterrogative(goal) && MODEL_WRITE_KINDS.has(parsed.kind)) {
      return classifyIntent(goal, context);
    }

    return hydrateModelIntent(parsed, goal, context);
  }
}

export function buildIntentRouterPrompt(goal: string, context: IntentRouterContext): string {
  const roles =
    context.roles.map((role) => `${role.id} (${role.displayName})`).join(", ") || "(none)";
  const rooms = context.rooms.map((room) => room.id).join(", ") || "(none)";
  const worlds =
    (context.worlds ?? []).map((world) => `${world.id} (${world.name})`).join(", ") || "(none)";
  return [
    "Classify the operator instruction into one Realm intent.",
    "Return a single JSON object only. No prose.",
    "",
    `Roles: ${roles}`,
    `Rooms: ${rooms}`,
    `Worlds: ${worlds}`,
    `World: ${context.worldId ?? "(active)"}`,
    "",
    `Instruction: ${goal}`,
  ].join("\n");
}

const INTENT_ROUTER_SYSTEM_PROMPT = [
  "You are the Realm intent router.",
  "Map one operator instruction to exactly one intent kind:",
  "- god: punish/pardon a role. { kind, targetRoleId, action: kill|mute|revive, reason }",
  "- state-patch: change a role/world attribute or condition. { kind, worldId?, operations:[{op:set|increment|append,path:'/json/pointer',value|amount}], reason }",
  "- run-turn: make a role take its turn — speak / act / say something ('让X说话/发言/说点什么/聊聊/说几句/讲两句/开口说', 'X say something'). An imperative '说点什么/聊聊/说几句' is NOT a question even though it contains 什么. { kind, roleId, roomId? }",
  "- world-switch: make a DIFFERENT existing world the active one ('切换到X / 打开X世界 / 进入X / switch to X'). { kind, worldId?, worldName? } — name the target with an id from the Worlds list when you can, otherwise put the operator's wording in worldName. This is NOT a question about the current world.",
  "- inspect: a question/read request. { kind, target: world-state|role-memory, roleId?, query }",
  "- trust-elevation: operator wants to leave read-only / allow roles to run / allow writes (e.g. '提升信任等级', '允许运行角色', '解除只读', 'run roles'). { kind, tier: 'run-roles' }",
  "- config: create or change worlds/roles/rules. Return only { kind: 'config' } and the system will plan it.",
  "",
  "Hard rules:",
  "1. ANY interrogative — a wh-question (什么状态/是什么/如何/怎么样/有没有), a 吗/呢 yes-no question, an A-not-A question (是不是/能不能/对不对), or anything ending in ？/? — is ALWAYS inspect. A 'he-said' question reporting state ('他被禁言了吗 / 顾辰风死了吗') is inspect, never god/state-patch. Never turn a question into a write. BUT an imperative 'say something' ('说点什么/说些什么/聊聊/说几句/讲两句') is a DIRECTIVE to speak (run-turn), NOT a question, even though it contains 什么.",
  "2. An emotional/physical/mental condition '让X心生退意 / 变得恐惧 / 此刻动摇 / 中毒' is a state-patch, NOT run-turn. run-turn is only for speaking/acting verbs '让X说话/发言/行动'.",
  "3. Use only the role ids in Roles and world ids in Worlds. Never invent an id. If the named world is not in the Worlds list, do NOT emit world-switch — prefer inspect.",
  "4. Prefer inspect when unsure. Never invent a write.",
  "",
  "Disambiguation examples (instruction -> JSON):",
  '  \'请帮我把顾辰风禁言，谢谢\' -> {"kind":"god","targetRoleId":"gu-chenfeng","action":"mute","reason":"操作员请求禁言"}',
  '  \'把他禁言\' -> {"kind":"god","targetRoleId":"<the only/last referenced role id>","action":"mute","reason":"禁言"}',
  '  \'他被禁言了吗？\' -> {"kind":"inspect","target":"world-state","query":"他被禁言了吗？"}',
  '  \'顾辰风现在很愤怒，然后让他出来说话\' -> {"kind":"run-turn","roleId":"gu-chenfeng"}',
  '  \'让顾辰风在全员议事说点什么\' -> {"kind":"run-turn","roleId":"gu-chenfeng"}',
  '  \'让云遥聊聊最近的事\' -> {"kind":"run-turn","roleId":"yunyao"}',
  '  \'切换到云岭修仙界\' -> {"kind":"world-switch","worldName":"云岭修仙界"}',
  '  \'云岭修仙界现在什么情况？\' -> {"kind":"inspect","target":"world-state","query":"云岭修仙界现在什么情况？"}',
  "",
  "Return a single JSON object only. No prose.",
].join("\n");

function parseModelIntent(content: string): z.infer<typeof modelIntentSchema> | undefined {
  try {
    return modelIntentSchema.parse(JSON.parse(extractJsonObject(content)));
  } catch {
    return undefined;
  }
}

/** Fill provider-omitted fields (world id, room id, config plan) from context. */
function hydrateModelIntent(
  parsed: z.infer<typeof modelIntentSchema>,
  goal: string,
  context: IntentRouterContext,
): RealmIntent {
  switch (parsed.kind) {
    case "config":
      return { kind: "config", goal: goal.trim(), plan: inferConfigPlanFromGoal(goal.trim()) };
    case "god":
      return parsed;
    case "state-patch":
      return {
        kind: "state-patch",
        worldId: parsed.worldId ?? context.worldId ?? "",
        operations: parsed.operations,
        reason: parsed.reason,
      };
    case "run-turn":
      return {
        kind: "run-turn",
        roleId: parsed.roleId,
        roomId: parsed.roomId ?? context.defaultRoomId ?? context.rooms[0]?.id ?? "",
      };
    case "inspect":
      return {
        kind: "inspect",
        target: parsed.target,
        roleId: parsed.roleId,
        query: parsed.query ?? goal.trim(),
      };
    case "trust-elevation":
      return { kind: "trust-elevation", tier: parsed.tier ?? "run-roles" };
    case "world-switch": {
      // Resolve the model's named/id target against the real world roster. If it
      // does not resolve to a concrete world, DO NOT switch — degrade to the calm
      // deterministic path so an unknown switch never becomes a silent wrong jump.
      const world = resolveModelWorld(parsed.worldId, parsed.worldName, context.worlds ?? []);
      if (!world) {
        return classifyIntent(goal, context);
      }
      return { kind: "world-switch", worldId: world.id };
    }
  }
}

/**
 * Resolve a model-named world to a concrete roster entry using the same
 * longest-name semantics as the deterministic `matchWorld` (longest id/name match
 * wins so "云岭修仙界" beats a stray "云岭"). The model may supply an exact id, an
 * exact display name, or free text in `worldName`; any of these is matched
 * against the real roster, and an unmatched target yields `undefined` so the
 * caller can fall back rather than switch blindly.
 */
function resolveModelWorld(
  worldId: string | undefined,
  worldName: string | undefined,
  worlds: IntentRouterWorld[],
): IntentRouterWorld | undefined {
  // Exact id match first — the model was told to use only ids present in context.
  if (worldId) {
    const byId = worlds.find((world) => world.id === worldId);
    if (byId) {
      return byId;
    }
  }
  // Otherwise match the named target (longest id/name substring) against the
  // roster, mirroring the deterministic resolver so both paths agree.
  const needle = (worldName ?? worldId ?? "").toLowerCase();
  if (needle.length === 0) {
    return undefined;
  }
  let best: IntentRouterWorld | undefined;
  let bestLength = 0;
  for (const world of worlds) {
    for (const candidate of [world.name, world.id].filter(Boolean)) {
      const lower = candidate.toLowerCase();
      if (lower.length === 0) {
        continue;
      }
      const matched = needle.includes(lower) || lower.includes(needle);
      if (matched && candidate.length > bestLength) {
        best = world;
        bestLength = candidate.length;
      }
    }
  }
  return best;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}
