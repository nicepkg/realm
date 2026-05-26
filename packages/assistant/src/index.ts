import {
  type CreateRolePatchInput,
  type CreateWorldPatchInput,
  createRolePatchInputSchema,
  createWorldPatchInputSchema,
} from "@realm/config";
import { z } from "zod";

export type AssistantConfigPlan =
  | { kind: "role"; role: CreateRolePatchInput }
  | { kind: "world"; world: CreateWorldPatchInput };

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

export function inferConfigPlanFromGoal(goal: string): AssistantConfigPlan {
  const normalized = goal.toLowerCase();
  if (normalized.includes("world") || goal.includes("世界")) {
    return {
      kind: "world",
      world: {
        id: "assistant-world",
        name: goal.includes("修真") ? "Cultivation World" : "Assistant World",
        mode: goal.includes("修真") ? "game" : "sandbox",
        roomName: "All Hands",
        roleIds: [],
      },
    };
  }

  return { kind: "role", role: inferRoleFromGoal(goal) };
}

export function inferRoleFromGoal(goal: string): CreateRolePatchInput {
  const normalized = goal.toLowerCase();
  if (normalized.includes("buffett") || goal.includes("巴菲特")) {
    return {
      id: "buffett",
      displayName: "Warren Buffett",
      model: "default",
      summary: "Long-term value investor.",
    };
  }
  if (normalized.includes("qa") || goal.includes("测试")) {
    return {
      id: "qa",
      displayName: "QA",
      model: "default",
      summary: "Quality and regression reviewer.",
    };
  }
  return {
    id: "custom-role",
    displayName: "Custom Role",
    model: "default",
    summary: goal.slice(0, 160),
  };
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
