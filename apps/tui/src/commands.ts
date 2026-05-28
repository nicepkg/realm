import { type TuiLocale, t } from "./i18n.ts";
import type { TuiCommand, TuiGodRoleAction, TuiRoomType } from "./types.ts";

const GOD_ROLE_ACTIONS = new Set<TuiGodRoleAction>(["kill", "mute", "revive"]);
const ROOM_TYPES = new Set<TuiRoomType>(["group", "dm", "god-channel", "system"]);

export function parseTuiCommand(input: string): TuiCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: "refresh" };
  }
  if (trimmed === ":q" || trimmed === ":quit" || trimmed === "quit") {
    return { kind: "quit" };
  }
  if (trimmed === ":h" || trimmed === ":help" || trimmed === "help") {
    return { kind: "help" };
  }
  if (trimmed === ":r" || trimmed === ":refresh" || trimmed === "refresh") {
    return { kind: "refresh" };
  }
  if (trimmed === ":settings" || trimmed === "settings") {
    return { kind: "settings" };
  }
  const [head = "", ...tail] = splitCommandWords(trimmed);
  const rest = tail.join(" ").trim();
  if ((head === ":model" || head === "model") && tail.length >= 2) {
    return { kind: "model", provider: tail[0] ?? "", model: tail.slice(1).join(" ") };
  }
  if ((head === ":world" || head === "world") && rest) {
    return { kind: "world", worldId: rest };
  }
  if ((head === ":room" || head === "room") && rest) {
    return { kind: "room", roomId: rest };
  }
  if ((head === ":id" || head === ":identity" || head === "identity") && rest) {
    return { kind: "identity", identity: rest };
  }
  if ((head === ":assistant" || head === "assistant") && rest) {
    return { kind: "assistant", goal: rest };
  }
  if (head === ":drafts" || head === "drafts") {
    return { kind: "drafts" };
  }
  if ((head === ":draft" || head === "draft") && rest) {
    return { kind: "draftDetails", draftId: rest };
  }
  if ((head === ":copy-draft" || head === "copy-draft") && rest) {
    return { kind: "copyDraft", draftId: rest };
  }
  if ((head === ":edit-draft" || head === "edit-draft") && tail.length >= 2) {
    return { kind: "editDraft", draftId: tail[0] ?? "", content: tail.slice(1).join(" ") };
  }
  if ((head === ":retry-draft" || head === "retry-draft") && rest) {
    return { kind: "retryDraft", draftId: rest };
  }
  if ((head === ":create-room" || head === "create-room") && tail.length >= 2) {
    const roomType = tail[0] as TuiRoomType | undefined;
    if (roomType && ROOM_TYPES.has(roomType)) {
      return {
        kind: "createRoom",
        memberIds: tail.slice(2),
        name: tail[1] ?? "",
        roomType,
      };
    }
  }
  if ((head === ":run-role" || head === "run-role") && rest) {
    return {
      kind: "runRole",
      ...(tail.slice(1).join(" ").trim() ? { prompt: tail.slice(1).join(" ").trim() } : {}),
      roleId: tail[0] ?? rest,
    };
  }
  if (head === ":state" || head === "state") {
    return { kind: "state", ...(rest ? { path: rest } : {}) };
  }
  if ((head === ":memory" || head === "memory") && rest) {
    return { kind: "memory", roleId: rest };
  }
  if (head === ":patch" || head === "patch") {
    const action = tail[0] ?? "show";
    if (action === "apply") {
      const confirmation = tail.slice(1).join(" ").trim();
      return { kind: "patchApply", ...(confirmation ? { confirmation } : {}) };
    }
    if (action === "reject") {
      return { kind: "patchReject" };
    }
    return { kind: "patchPreview" };
  }
  if ((head === ":god" || head === "god") && tail.length >= 3) {
    const action = tail[0] as TuiGodRoleAction | undefined;
    const targetRoleId = tail[1] ?? "";
    const reason = tail.slice(2).join(" ").trim();
    if (action && GOD_ROLE_ACTIONS.has(action) && targetRoleId && reason) {
      return { action, kind: "god", reason, targetRoleId };
    }
  }
  if ((head === ":send" || head === "send") && rest) {
    return { kind: "send", content: rest };
  }
  return { kind: "send", content: trimmed.replace(/^:/, "") };
}

function splitCommandWords(input: string): string[] {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

export function renderTuiHelp(locale: TuiLocale = "en"): string {
  if (locale === "zh-CN") {
    return [
      "按键：",
      "  Enter                 发送输入内容",
      "  Ctrl+K                命令面板",
      "  Ctrl+W / Ctrl+L       世界选择 / 房间选择",
      "  Ctrl+R / Ctrl+G       角色选择 / 上帝控制台",
      "  Esc                   关闭覆盖层",
      "  ?                     帮助",
      "",
      "命令：",
      "  :send <message>        用当前身份发送",
      "  :id <identity>         切换发送身份",
      "  :world <world-id>       切换世界",
      "  :room <room-id>        切换房间",
      "  :create-room <type> <name> [members...]",
      "                         创建群聊/私聊/系统房间",
      "  :run-role <role-id> [prompt]",
      "                         运行角色回合",
      "  :assistant <goal>      生成配置补丁提案",
      "  :patch show|apply|reject",
      "                         预览、应用或拒绝当前配置补丁",
      "  :state [json-pointer]   查看当前世界状态",
      "  :memory <role-id>       查看角色记忆",
      "  :god <action> <role> <reason>",
      "                         受保护的上帝动作；需输入角色 id 确认",
      "  :drafts                查看失败草稿",
      "  :draft <id>            查看草稿详情",
      "  :edit-draft <id> <msg>  修改草稿内容",
      "  :copy-draft <id>        输出可复制草稿详情",
      "  :retry-draft <id>      重试并删除草稿",
      "  :settings              显示设置摘要",
      "  :model <provider> <id>  更新默认模型设置",
      "  :refresh               重新加载项目状态",
      "  :q                     退出",
    ].join("\n");
  }
  const dict = t(locale);
  return [
    "Keys:",
    "  Enter                 send composer text",
    "  Ctrl+K                command palette",
    "  Ctrl+W / Ctrl+L       world picker / room picker",
    "  Ctrl+R / Ctrl+G       role picker / God Console",
    "  Esc                   close overlay",
    "  ?                     help",
    "",
    "Commands:",
    "  :send <message>        send as current identity",
    "  :id <identity>         switch speaking identity",
    "  :world <world-id>       switch world",
    "  :room <room-id>        switch room",
    "  :create-room <type> <name> [members...]",
    "                         create a group, DM, or system room",
    "  :run-role <role-id> [prompt]",
    "                         run a role turn",
    "  :assistant <goal>      propose a config patch",
    "  :patch show|apply|reject",
    "                         preview, apply, or reject the current config patch",
    "  :state [json-pointer]   inspect current world state",
    "  :memory <role-id>       inspect role memory",
    "  :god <action> <role> <reason>",
    "                         guarded God action; type role id to confirm",
    "  :drafts                list failed drafts",
    "  :draft <id>            show draft details",
    "  :edit-draft <id> <msg>  edit draft content",
    "  :copy-draft <id>        print copyable draft details",
    "  :retry-draft <id>      retry and remove a draft",
    "  :settings              show settings summary",
    "  :model <provider> <id>  update default model settings",
    "  :refresh               reload project state",
    "  :q                     quit",
    "",
    `Footer: ${dict.footer}`,
  ].join("\n");
}
