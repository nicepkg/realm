import { describe, expect, test } from "bun:test";
import {
  inferConfigPlanFromGoal,
  inferRoleFromGoal,
  ModelBackedConfigAssistantPlanner,
  parseAssistantConfigPlan,
} from "./index.ts";

describe("assistant config planner", () => {
  test("infers role proposals from natural language goals", () => {
    expect(inferRoleFromGoal("创建一个巴菲特角色")).toMatchObject({
      id: "buffett",
      displayName: "Warren Buffett",
    });
    expect(inferRoleFromGoal("Add QA reviewer")).toMatchObject({
      id: "qa",
      displayName: "QA",
    });
  });

  test("infers world proposals from world creation goals", () => {
    expect(inferConfigPlanFromGoal("创建一个修真世界")).toEqual({
      kind: "world",
      world: {
        id: "assistant-world",
        name: "Cultivation World",
        mode: "game",
        roomName: "All Hands",
        roleIds: [],
      },
    });
  });

  test("parses model-backed role plans from fenced JSON", () => {
    const plan = parseAssistantConfigPlan(
      [
        "```json",
        JSON.stringify({
          kind: "role",
          role: {
            id: "product-manager",
            displayName: "Product Manager",
            model: "default",
            summary: "Clarifies requirements and tradeoffs.",
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(plan).toEqual({
      kind: "role",
      role: {
        id: "product-manager",
        displayName: "Product Manager",
        model: "default",
        summary: "Clarifies requirements and tradeoffs.",
      },
    });
  });

  test("uses an injected model client for assistant planning", async () => {
    const planner = new ModelBackedConfigAssistantPlanner({
      complete: async () =>
        JSON.stringify({
          kind: "world",
          world: {
            id: "stock-council",
            name: "Stock Council",
            mode: "debate",
            roomName: "All Hands",
            roleIds: ["buffett"],
          },
        }),
    });

    await expect(planner.plan("Create stock council")).resolves.toMatchObject({
      kind: "world",
      world: { id: "stock-council", mode: "debate" },
    });
  });
});
