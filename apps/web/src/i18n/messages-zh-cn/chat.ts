import type { MessageValue } from "../message-types.ts";

/**
 * 简体中文（权威）：天道对话主界面 —— 外壳、输入框、预置建议、
 * 内联动作卡（配置 / 上帝 / 状态补丁 / 角色回合）、反馈与上下文边栏。
 * 须与 `chatEn` 严格键对齐。
 */
export const chatZhCn = {
  "chat.title": "与天道对话",
  "chat.placeholder": "和「天道」说话，创造、设定、掌控这个世界…",
  "chat.send": "发送",
  "chat.busy": "天道正在运转…",
  "chat.confirm": "确认",
  "chat.cancel": "取消",
  "chat.advanced": "高级",
  "chat.error.retry": "重试",
  "chat.suggestion.createWorld": "创造一个分三个境界的修仙世界",
  "chat.suggestion.controlRole": "让主角突破到筑基期",
  "chat.suggestion.inspect": "看看这个世界现在的状态",
  "chat.card.configTitle": "配置变更",
  "chat.card.godTitle": "天道法旨",
  "chat.card.statePatchTitle": "状态更新",
  "chat.card.runTurnTitle": "角色回合",
  "chat.feedback.applied": "已应用",
  "chat.feedback.failed": "应用失败",
  "chat.contextRail.worldState": "世界状态",
  "chat.contextRail.roles": "角色",
  "chat.contextSheet.title": "当前世界",
  "chat.contextSheet.description": "瞥一眼这个世界的状态和角色，或做一点精细调整。",
  "chat.contextSheet.stateTitle": "世界状态",
  "chat.contextSheet.rolesTitle": "角色",
  "chat.contextSheet.emptyState": "世界还是一张白纸。",
  "chat.contextSheet.emptyRoles": "还没有角色。",
  "chat.contextSheet.stateMeta": (version: number, fieldCount: number) =>
    `v${version} · ${fieldCount} 个字段`,
  "chat.contextSheet.rolesMeta": (count: number) => `${count} 个角色`,
  "chat.contextSheet.tweaksTitle": "精细调整",
  "chat.contextSheet.commandPalette": "命令面板",
  "chat.contextSheet.commandPaletteHint": "更精细的操作与高级界面（⌘K）",
  "chat.contextSheet.settings": "设置",
  "chat.contextSheet.settingsHint": "模型、运行时与配置导入导出",
} satisfies Record<string, MessageValue>;
