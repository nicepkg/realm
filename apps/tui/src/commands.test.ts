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
    expect(parseTuiCommand(":god mute leijun story pause")).toEqual({
      action: "mute",
      kind: "god",
      reason: "story pause",
      targetRoleId: "leijun",
    });
    expect(parseTuiCommand(":model openai gpt-5.2")).toEqual({
      kind: "model",
      provider: "openai",
      model: "gpt-5.2",
    });
    expect(parseTuiCommand(":drafts")).toEqual({ kind: "drafts" });
    expect(parseTuiCommand(":retry-draft draft-1")).toEqual({
      kind: "retryDraft",
      draftId: "draft-1",
    });
    expect(parseTuiCommand(":state /publicState")).toEqual({
      kind: "state",
      path: "/publicState",
    });
    expect(parseTuiCommand(":memory leijun")).toEqual({ kind: "memory", roleId: "leijun" });
    expect(parseTuiCommand(":patch")).toEqual({ kind: "patchPreview" });
    expect(parseTuiCommand(":patch reject")).toEqual({ kind: "patchReject" });
    expect(parseTuiCommand(":patch apply APPLY patch-1")).toEqual({
      kind: "patchApply",
      confirmation: "APPLY patch-1",
    });
    expect(parseTuiCommand("hello world")).toEqual({ kind: "send", content: "hello world" });
  });

  test("renders discoverable commands", () => {
    expect(renderTuiHelp()).toContain(":send <message>");
    expect(renderTuiHelp()).toContain(":assistant <goal>");
    expect(renderTuiHelp()).toContain(":god <action> <role> <reason>");
    expect(renderTuiHelp()).toContain(":model <provider> <id>");
    expect(renderTuiHelp()).toContain(":retry-draft <id>");
    expect(renderTuiHelp()).toContain(":patch show|apply|reject");
    expect(renderTuiHelp()).toContain(":state [json-pointer]");
    expect(renderTuiHelp("zh-CN")).toContain("失败草稿");
    expect(renderTuiHelp("zh-CN")).toContain("配置补丁");
  });
});
