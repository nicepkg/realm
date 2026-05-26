import { describe, expect, test } from "bun:test";
import { parseTuiCommand, renderTuiHelp } from "./commands.ts";

describe("TUI commands", () => {
  test("parses command palette input", () => {
    expect(parseTuiCommand(":q")).toEqual({ kind: "quit" });
    expect(parseTuiCommand(":room main")).toEqual({ kind: "room", roomId: "main" });
    expect(parseTuiCommand(":id god")).toEqual({ kind: "identity", identity: "god" });
    expect(parseTuiCommand(":assistant add QA")).toEqual({
      kind: "assistant",
      goal: "add QA",
    });
    expect(parseTuiCommand(":model openai gpt-5.2")).toEqual({
      kind: "model",
      provider: "openai",
      model: "gpt-5.2",
    });
    expect(parseTuiCommand("hello world")).toEqual({ kind: "send", content: "hello world" });
  });

  test("renders discoverable commands", () => {
    expect(renderTuiHelp()).toContain(":send <message>");
    expect(renderTuiHelp()).toContain(":assistant <goal>");
    expect(renderTuiHelp()).toContain(":model <provider> <id>");
  });
});
