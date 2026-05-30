import { resolveTuiLocale, type TuiLocale, t, tuiLocales } from "./i18n.ts";
import type {
  TuiCommand,
  TuiGodRoleAction,
  TuiRoomType,
  TuiSimAction,
  TuiWorldMode,
} from "./types.ts";

/** Trust tiers accepted by `POST /api/trust` (mirrors setTrustRequestSchema). */
export const TUI_TRUST_TIERS = ["read-only", "run-roles", "elevated-tools"] as const;
export type TuiTrustTier = (typeof TUI_TRUST_TIERS)[number];

/**
 * Parses a `:trust [tier]` argument into a concrete trust tier. With no
 * argument it defaults to `run-roles` (the smallest tier that unblocks writes /
 * role turns under the read-only gate). Returns `{ invalid }` for an
 * unrecognized tier so the caller can surface a localized error instead of
 * silently POSTing a bad value.
 */
export function parseTrustCommandArg(arg: string | undefined): {
  tier?: TuiTrustTier;
  invalid?: string;
} {
  const value = arg?.trim();
  if (!value) {
    return { tier: "run-roles" };
  }
  if ((TUI_TRUST_TIERS as readonly string[]).includes(value)) {
    return { tier: value as TuiTrustTier };
  }
  return { invalid: value };
}

const GOD_ROLE_ACTIONS = new Set<TuiGodRoleAction>(["kill", "mute", "revive"]);
const ROOM_TYPES = new Set<TuiRoomType>(["group", "dm", "god-channel", "system"]);
const WORLD_MODES = new Set<TuiWorldMode>(["debate", "workflow", "game", "simulation", "sandbox"]);

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
  if ((head === ":create-world" || head === "create-world") && tail.length >= 2) {
    const modeArg = tail[2] as TuiWorldMode | undefined;
    return {
      kind: "createWorld",
      worldId: tail[0] ?? "",
      name: tail[1] ?? "",
      mode: modeArg && WORLD_MODES.has(modeArg) ? modeArg : "sandbox",
    };
  }
  if ((head === ":create-role" || head === "create-role") && tail.length >= 2) {
    return {
      kind: "createRole",
      roleId: tail[0] ?? "",
      displayName: tail[1] ?? "",
      model: tail[2]?.trim() ? tail[2] : "default",
    };
  }
  if ((head === ":sim" || head === "sim") && tail.length >= 1) {
    const simAction = parseSimAction(tail);
    if (simAction) {
      return { kind: "sim", action: simAction };
    }
  }
  if ((head === ":locale" || head === ":lang" || head === "locale") && rest) {
    const normalized = resolveTuiLocale(rest);
    if (tuiLocales.includes(normalized)) {
      return { kind: "locale", locale: normalized };
    }
  }
  if (head === ":run-role" || head === "run-role") {
    // No role id: surface the room-member roles to pick from (DISC-R7-4) rather
    // than falling through to `send` and silently posting "run-role" as a chat
    // message. An empty roleId is the picker signal the app resolves.
    const prompt = tail.slice(1).join(" ").trim();
    return {
      kind: "runRole",
      ...(prompt ? { prompt } : {}),
      roleId: tail[0]?.trim() ?? "",
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
  if (head === ":rollback" || head === "rollback" || head === "/rollback") {
    return { kind: "rollback", ...(rest ? { historyId: rest } : {}) };
  }
  if ((head === ":send" || head === "send") && rest) {
    return { kind: "send", content: rest };
  }
  return { kind: "send", content: trimmed.replace(/^:/, "") };
}

function parseSimAction(tail: string[]): TuiSimAction | undefined {
  const action = tail[0]?.toLowerCase();
  if (action === "status") {
    return { kind: "status" };
  }
  if (action === "pause") {
    return { kind: "pause" };
  }
  if (action === "resume") {
    return { kind: "resume" };
  }
  if (action === "export") {
    return { kind: "export" };
  }
  if (action === "fork") {
    const label = tail.slice(1).join(" ").trim();
    return { kind: "fork", ...(label ? { label } : {}) };
  }
  if (action === "tick") {
    const ticks = Number.parseInt(tail[1] ?? "1", 10);
    return { kind: "tick", ticks: Number.isFinite(ticks) && ticks > 0 ? ticks : 1 };
  }
  return undefined;
}

function splitCommandWords(input: string): string[] {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

export function renderTuiHelp(locale: TuiLocale = "en"): string {
  if (locale === "zh-CN") {
    return [
      "直接对天道说话（主要方式）：",
      "  用一句话下达指令，天道会自动执行——危险写入仍会先预览再确认。",
      "  · 创建一个有宗门的修真世界      → 生成创建世界提案，确认后建立",
      "  · 加一个叫云遥的炼丹师          → 生成创建角色提案",
      "  · 让顾辰风发言一回合            → 运行该角色回合（需确认）",
      "  · 让顾辰风心生退意            → 修改角色状态（需确认）",
      "  · 把顾辰风禁言                → 上帝裁判（需确认）",
      "  · 现在世界什么状态？          → 查看世界状态（只读）",
      "  普通聊天会直接作为消息发送。",
      "",
      "按键：",
      "  Enter                 发送输入内容",
      "  Ctrl+K                命令面板",
      "  Ctrl+W / Ctrl+L       世界选择 / 房间选择",
      "  Ctrl+R / Ctrl+G       角色选择 / 上帝控制台",
      "  Esc                   关闭覆盖层",
      "  ?                     帮助",
      "",
      "命令（高级快捷方式，可选）：",
      "  :send <message>        用当前身份发送",
      "  :id <identity>         切换发送身份",
      "  :world <world-id>       切换世界",
      "  :room <room-id>        切换房间",
      "  :create-room <type> <name> [members...]",
      "                         创建群聊/私聊/系统房间",
      "  :create-world <id> <name> [mode]",
      "                         生成创建世界的配置补丁提案",
      "  :create-role <id> <name> [model]",
      "                         生成创建角色的配置补丁提案",
      "  :sim status|tick N|pause|resume|fork|export",
      "                         模拟控制：状态/步进/暂停/恢复/分叉/导出",
      "  :locale en|zh-CN        切换界面语言并保存",
      "  :run-role <role-id> [prompt]",
      "                         运行角色回合",
      "  :assistant <goal>      生成配置补丁提案",
      "  :patch show|apply|reject",
      "                         预览、应用或拒绝当前配置补丁",
      "  :state [json-pointer]   查看当前世界状态",
      "  :memory <role-id>       查看角色记忆",
      "  :god <action> <role> <reason>",
      "                         受保护的上帝动作；需输入角色 id 确认",
      "  :rollback [history-id]  将配置回滚到某个历史记录",
      "  :trust [tier]          提升信任级别（read-only|run-roles|elevated-tools）以启用写入",
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
    "Just talk to 天道 (the primary path):",
    "  Give an instruction in plain language; risky writes still preview + confirm.",
    "  · Create a cultivation world with a sect → propose + build a world",
    "  · Add an alchemist named 云遥             → propose a new role",
    "  · Have 顾辰风 take a turn                 → run that role's turn (confirm)",
    "  · Make 顾辰风 want to retreat             → patch role state (confirm)",
    "  · Mute 顾辰风                            → God adjudication (confirm)",
    "  · What is the world state now?           → inspect world state (read)",
    "  Plain chatter is posted as a chat message.",
    "",
    "Keys:",
    "  Enter                 send composer text",
    "  Ctrl+K                command palette",
    "  Ctrl+W / Ctrl+L       world picker / room picker",
    "  Ctrl+R / Ctrl+G       role picker / God Console",
    "  Esc                   close overlay",
    "  ?                     help",
    "",
    "Commands (optional power-user fast path):",
    "  :send <message>        send as current identity",
    "  :id <identity>         switch speaking identity",
    "  :world <world-id>       switch world",
    "  :room <room-id>        switch room",
    "  :create-room <type> <name> [members...]",
    "                         create a group, DM, or system room",
    "  :create-world <id> <name> [mode]",
    "                         propose a config patch that creates a world",
    "  :create-role <id> <name> [model]",
    "                         propose a config patch that creates a role",
    "  :sim status|tick N|pause|resume|fork|export",
    "                         drive the simulation runtime",
    "  :locale en|zh-CN        switch interface language and persist it",
    "  :run-role <role-id> [prompt]",
    "                         run a role turn",
    "  :assistant <goal>      propose a config patch",
    "  :patch show|apply|reject",
    "                         preview, apply, or reject the current config patch",
    "  :state [json-pointer]   inspect current world state",
    "  :memory <role-id>       inspect role memory",
    "  :god <action> <role> <reason>",
    "                         guarded God action; type role id to confirm",
    "  :rollback [history-id]  roll config back to a history entry",
    "  :trust [tier]          raise trust tier (read-only|run-roles|elevated-tools) to enable writes",
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
