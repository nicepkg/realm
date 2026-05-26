import { describe, expect, test } from "bun:test";
import { ContextBudgetBroker, estimateTokens, formatContextPack } from "./index.ts";

describe("ContextBudgetBroker", () => {
  test("includes high-priority context inside bucket and global budgets", () => {
    const pack = new ContextBudgetBroker().compile({
      policy: {
        maxInputTokens: 20,
        allocation: {
          system: 8,
          roleMemory: 4,
          roomRecentMessages: 4,
          stateView: 1,
          retrievedHistory: 1,
          toolManifest: 1,
          reserve: 1,
        },
      },
      items: [
        { id: "low", bucket: "system", title: "Low", text: "x".repeat(20), priority: 1 },
        { id: "high", bucket: "system", title: "High", text: "abcd", priority: 10 },
      ],
    });

    expect(pack.sections.map((section) => section.id)).toEqual(["high", "low"]);
    expect(pack.omitted).toEqual([]);
  });

  test("omits context that exceeds a bucket allocation", () => {
    const pack = new ContextBudgetBroker().compile({
      policy: {
        maxInputTokens: 10,
        allocation: {
          system: 2,
          roleMemory: 1,
          roomRecentMessages: 1,
          stateView: 1,
          retrievedHistory: 1,
          toolManifest: 1,
          reserve: 1,
        },
      },
      items: [{ id: "huge", bucket: "system", title: "Huge", text: "x".repeat(20) }],
    });

    expect(pack.sections).toEqual([]);
    expect(pack.omitted[0]?.reason).toBe("bucket_budget_exceeded");
  });

  test("formats included and omitted context for prompt compilers", () => {
    const pack = new ContextBudgetBroker().compile({
      policy: {
        maxInputTokens: 6,
        allocation: {
          system: 2,
          roleMemory: 1,
          roomRecentMessages: 1,
          stateView: 1,
          retrievedHistory: 0,
          toolManifest: 0,
          reserve: 1,
        },
      },
      items: [
        { id: "identity", bucket: "system", title: "Identity", text: "abcd" },
        { id: "empty", bucket: "roleMemory", title: "Empty", text: "  " },
      ],
    });

    expect(formatContextPack(pack)).toContain("## Identity");
    expect(formatContextPack(pack)).toContain("roleMemory:empty");
  });

  test("uses deterministic rough token estimates", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
