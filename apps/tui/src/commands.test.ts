import { describe, expect, test } from "bun:test";
import { parseTrustCommandArg, parseTuiCommand, renderTuiHelp } from "./commands.ts";

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
    expect(parseTuiCommand(":world cultivation")).toEqual({
      kind: "world",
      worldId: "cultivation",
    });
    expect(parseTuiCommand(':create-room group "Smoke Room" leijun yun')).toEqual({
      kind: "createRoom",
      memberIds: ["leijun", "yun"],
      name: "Smoke Room",
      roomType: "group",
    });
    expect(parseTuiCommand(":run-role leijun check the state")).toEqual({
      kind: "runRole",
      prompt: "check the state",
      roleId: "leijun",
    });
    expect(parseTuiCommand(":drafts")).toEqual({ kind: "drafts" });
    expect(parseTuiCommand(":draft draft-1")).toEqual({
      kind: "draftDetails",
      draftId: "draft-1",
    });
    expect(parseTuiCommand(":edit-draft draft-1 patched body")).toEqual({
      content: "patched body",
      kind: "editDraft",
      draftId: "draft-1",
    });
    expect(parseTuiCommand(":copy-draft draft-1")).toEqual({
      kind: "copyDraft",
      draftId: "draft-1",
    });
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
    expect(renderTuiHelp()).toContain(":world <world-id>");
    expect(renderTuiHelp()).toContain(":create-room <type> <name> [members...]");
    expect(renderTuiHelp()).toContain(":run-role <role-id> [prompt]");
    expect(renderTuiHelp()).toContain(":god <action> <role> <reason>");
    expect(renderTuiHelp()).toContain(":model <provider> <id>");
    expect(renderTuiHelp()).toContain(":retry-draft <id>");
    expect(renderTuiHelp()).toContain(":edit-draft <id> <msg>");
    expect(renderTuiHelp()).toContain(":patch show|apply|reject");
    expect(renderTuiHelp()).toContain(":state [json-pointer]");
    expect(renderTuiHelp("zh-CN")).toContain("失败草稿");
    expect(renderTuiHelp("zh-CN")).toContain("配置补丁");
    expect(renderTuiHelp()).toContain(":trust [tier]");
    expect(renderTuiHelp("zh-CN")).toContain(":trust [tier]");
  });

  test("parses :trust argument into a trust tier", () => {
    // Bare :trust defaults to run-roles (smallest tier that unblocks writes).
    expect(parseTrustCommandArg(undefined)).toEqual({ tier: "run-roles" });
    expect(parseTrustCommandArg("")).toEqual({ tier: "run-roles" });
    expect(parseTrustCommandArg("  ")).toEqual({ tier: "run-roles" });
    expect(parseTrustCommandArg("run-roles")).toEqual({ tier: "run-roles" });
    expect(parseTrustCommandArg("read-only")).toEqual({ tier: "read-only" });
    expect(parseTrustCommandArg("elevated-tools")).toEqual({ tier: "elevated-tools" });
    // Unknown tiers are reported as invalid so the caller surfaces a named error
    // instead of POSTing a bad value.
    expect(parseTrustCommandArg("bogus")).toEqual({ invalid: "bogus" });
  });
});
