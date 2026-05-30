import { createRolePatchInputSchema, createWorldPatchInputSchema } from "@realm/config";
import { z } from "zod";
import { type AssistantConfigPlan, inferConfigPlanFromGoal } from "./config-plan-inference.ts";

// NL goal → config-plan inference (role/world name extraction + theming) lives in
// its own module so this file stays under the 500-line guard; re-export the full
// surface so consumers and tests keep importing it from "@realm/assistant".
export {
  type AssistantConfigPlan,
  extractProposedName,
  extractRoleName,
  extractWorldName,
  inferConfigPlanFromGoal,
  inferRoleFromGoal,
  inferWorldFromGoal,
  inferWorldThemeFromGoal,
} from "./config-plan-inference.ts";
export * from "./intent-router.ts";
export { detectWorldStructureClues } from "./world-structure-clues.ts";

export type ConfigPlannerModel = {
  complete: (input: { system: string; prompt: string }) => Promise<string>;
};

export interface ConfigAssistantPlanner {
  plan(goal: string): Promise<AssistantConfigPlan>;
}

const assistantConfigPlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: createRolePatchInputSchema }),
  z.object({ kind: z.literal("world"), world: createWorldPatchInputSchema }),
]);

export class DeterministicConfigAssistantPlanner implements ConfigAssistantPlanner {
  async plan(goal: string): Promise<AssistantConfigPlan> {
    return inferConfigPlanFromGoal(goal);
  }
}

export class ModelBackedConfigAssistantPlanner implements ConfigAssistantPlanner {
  constructor(private readonly model: ConfigPlannerModel) {}

  async plan(goal: string): Promise<AssistantConfigPlan> {
    const response = await this.model.complete({
      system: CONFIG_PLANNER_SYSTEM_PROMPT,
      prompt: buildConfigPlannerPrompt(goal),
    });
    return parseAssistantConfigPlan(response);
  }
}

export function buildConfigPlannerPrompt(goal: string): string {
  return [
    "Create one Realm config proposal plan for this user goal.",
    "Return JSON only. Do not include prose.",
    "",
    `Goal: ${goal}`,
  ].join("\n");
}

export function parseAssistantConfigPlan(content: string): AssistantConfigPlan {
  return assistantConfigPlanSchema.parse(JSON.parse(extractJsonObject(content)));
}

const CONFIG_PLANNER_SYSTEM_PROMPT = [
  "You are the Realm configuration planner.",
  "You convert user goals into one reviewed config proposal plan.",
  "You must return a JSON object with kind=role or kind=world.",
  "For role plans, provide role: { id, displayName, model, summary }.",
  "For world plans, provide world: { id, name, mode, roomName, roleIds }.",
  "Use kebab-case ids and preserve the user's intent.",
].join("\n");

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
