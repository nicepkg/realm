import { z } from "zod";
import { type ConfigPlannerModel, inferConfigPlanFromGoal } from "./index.ts";
import { classifyIntent } from "./intent-classifier.ts";
import type { IntentRouter, IntentRouterContext, RealmIntent } from "./intent-types.ts";

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
  // Config has no model branch here: it always routes through the existing planner.
  z.object({ kind: z.literal("config") }),
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
    return hydrateModelIntent(parsed, goal, context);
  }
}

export function buildIntentRouterPrompt(goal: string, context: IntentRouterContext): string {
  const roles =
    context.roles.map((role) => `${role.id} (${role.displayName})`).join(", ") || "(none)";
  const rooms = context.rooms.map((room) => room.id).join(", ") || "(none)";
  return [
    "Classify the operator instruction into one Realm intent.",
    "Return a single JSON object only. No prose.",
    "",
    `Roles: ${roles}`,
    `Rooms: ${rooms}`,
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
  "- run-turn: make a role take its turn. { kind, roleId, roomId? }",
  "- inspect: a question/read request. { kind, target: world-state|role-memory, roleId?, query }",
  "- trust-elevation: operator wants to leave read-only / allow roles to run / allow writes (e.g. '提升信任等级', '允许运行角色', '解除只读', 'run roles'). { kind, tier: 'run-roles' }",
  "- config: create or change worlds/roles/rules. Return only { kind: 'config' } and the system will plan it.",
  "An emotional/physical condition like '让X心生退意 / 变得恐惧 / 此刻动摇' is a state-patch, NOT run-turn. run-turn is only for '让X说话/发言/行动'.",
  "Prefer inspect when unsure. Never invent a write. Use only the role ids provided in context.",
  "Return JSON only.",
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
  }
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
