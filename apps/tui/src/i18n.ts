export type TuiLocale = "en" | "zh-CN";

export type TuiDictionary = {
  assistantProposal: string;
  cannotApplyGodWithoutWorld: string;
  cannotSendWithoutContext: string;
  commandApplied: string;
  commandIgnored: string;
  configPatch: string;
  context: string;
  conversations: string;
  defaultValue: string;
  draftRoleTakeoverCannotConfirm: string;
  draftCopyTitle: (id: string) => string;
  draftCreatedAt: string;
  draftDetailsTitle: (id: string) => string;
  draftEditSaved: (id: string) => string;
  draftError: string;
  draftListEmpty: string;
  draftListActions: (id: string) => string;
  draftListTitle: string;
  draftPath: string;
  draftRetryMissing: (id: string) => string;
  draftRetrySent: (id: string) => string;
  draftSaved: (id: string, filePath: string) => string;
  eventsRecorded: string;
  footer: string;
  godActionApplied: (action: string, target: string) => string;
  godActionCancelled: string;
  godConsoleBody: (roleLines: string) => string;
  godConsoleOpened: string;
  helpOpened: string;
  identity: string;
  identityDescription: string;
  idle: string;
  latestTrace: string;
  memory: string;
  memoryEmpty: string;
  memoryLoaded: (roleId: string) => string;
  messageSent: string;
  messageSentAs: (identity: string) => string;
  messages: string;
  noConfigPatch: string;
  noTrace: string;
  noRolesLoaded: string;
  noConversations: string;
  noMessages: string;
  noRoom: string;
  noValue: string;
  noWorld: string;
  pickerGodDescription: string;
  pickerGodLabel: string;
  pickerRoleDescription: (model: string) => string;
  pickerRoleLabel: (name: string) => string;
  pickerRoomDescription: (type: string) => string;
  pickerRoomLabel: (name: string) => string;
  pickerSettingsDescription: string;
  pickerSettingsLabel: string;
  pickerWhereamiDescription: string;
  pickerWhereamiLabel: string;
  pickerWorldDescription: (mode: string) => string;
  pickerWorldLabel: (name: string) => string;
  patchApplied: (historyId: string) => string;
  patchApplyHint: (confirmation: string) => string;
  patchApplyNeedsConfirmation: (confirmation: string) => string;
  patchApplyNoConfirm: string;
  patchCapabilities: string;
  patchFiles: string;
  patchReasons: string;
  patchRejected: string;
  patchRisk: string;
  patchSummary: string;
  policy: string;
  policyCapabilities: (allowed: number, denied: number, highRisk: number) => string;
  policyWarnings: (count: number) => string;
  project: string;
  provider: string;
  providerDescription: string;
  reloaded: string;
  running: string;
  roleSendCancelled: string;
  roleSwitched: (identity: string) => string;
  room: string;
  roomSwitched: (room: string) => string;
  settings: string;
  settingsOpened: string;
  settingsSummaryLoaded: string;
  shortcuts: string;
  slashAsDescription: string;
  slashAssistantDescription: string;
  slashDraftsDescription: string;
  slashMemoryDescription: string;
  slashPatchDescription: string;
  slashRefreshDescription: string;
  slashRoomDescription: string;
  slashSendDescription: string;
  slashSettingsDescription: string;
  slashStateDescription: string;
  slashWhereamiDescription: string;
  shortcutKeys: string;
  shortcutSlash: (identity: string, roomId: string) => string;
  speaking: string;
  model: string;
  modelDescription: string;
  traceEvent: (type: string) => string;
  traceMessage: (identity: string) => string;
  traceTurn: (status: string, actor: string) => string;
  traceWorldEvent: (title: string) => string;
  trustTier: string;
  useCtrlCToExit: string;
  visibleRoles: string;
  world: string;
  worldState: string;
  worldStateLoaded: string;
  worldSwitched: (world: string) => string;
};

export const tuiLocales = ["en", "zh-CN"] as const;

export const tuiDictionaries: Record<TuiLocale, TuiDictionary> = {
  en: {
    assistantProposal: "Assistant proposal",
    cannotApplyGodWithoutWorld: "Cannot apply God action without an active world.",
    cannotSendWithoutContext: "Cannot send without an active world and room.",
    commandApplied: "Command applied.",
    commandIgnored: "Command ignored.",
    configPatch: "Config patch",
    context: "Context",
    conversations: "Conversations",
    defaultValue: "default",
    draftRoleTakeoverCannotConfirm: "One-shot role takeover cannot confirm.",
    draftCopyTitle: (id) => `Copyable draft details for ${id}`,
    draftCreatedAt: "Created at",
    draftDetailsTitle: (id) => `Draft ${id}`,
    draftEditSaved: (id) => `Draft ${id} updated. Use :retry-draft ${id} to send it.`,
    draftError: "Failure",
    draftListEmpty: "No failed drafts saved.",
    draftListActions: (id) =>
      `Actions: :draft ${id} · :edit-draft ${id} <message> · :copy-draft ${id} · :retry-draft ${id}`,
    draftListTitle: "Failed drafts",
    draftPath: "File",
    draftRetryMissing: (id) => `Draft ${id} was not found.`,
    draftRetrySent: (id) => `Draft ${id} sent and removed.`,
    draftSaved: (id, filePath) =>
      `Send failed. Draft ${id} saved at ${filePath}. Use :draft ${id}, :edit-draft ${id} <message>, :copy-draft ${id}, or :retry-draft ${id}.`,
    eventsRecorded: "Events recorded",
    footer: "Ctrl+K commands · Esc close · ? help · Ctrl+C exit",
    godActionApplied: (action, target) => `God ${action} applied to ${target}.`,
    godActionCancelled: "God action cancelled.",
    godConsoleBody: (roleLines) =>
      [
        "# God Console",
        "",
        "Privileged world adjudication is intentionally separated from normal chat.",
        "",
        "Run a guarded action from the composer:",
        "",
        "```text",
        ":god mute <role-id> <reason>",
        ":god kill <role-id> <reason>",
        ":god revive <role-id> <reason>",
        "```",
        "",
        "Realm will ask you to type the exact role id before applying the action.",
        "",
        "Roles:",
        roleLines,
      ].join("\n"),
    godConsoleOpened: "God Console opened. Use guarded :god commands for destructive adjudication.",
    helpOpened: "Help opened.",
    identity: "Identity",
    identityDescription: "Current participant account used by the composer.",
    idle: "idle",
    latestTrace: "Latest trace",
    memory: "Memory",
    memoryEmpty: "No memory recorded.",
    memoryLoaded: (roleId) => `Memory loaded for ${roleId}.`,
    messageSent: "Message sent.",
    messageSentAs: (identity) => `Message sent as ${identity}.`,
    messages: "Messages",
    noConfigPatch: "No config patch proposal is pending.",
    noTrace: "none",
    noRolesLoaded: "no roles loaded",
    noConversations: "no conversations",
    noMessages: "no messages yet",
    noRoom: "No room",
    noValue: "none",
    noWorld: "No world",
    pickerGodDescription: "privileged adjudication overlay",
    pickerGodLabel: "god console",
    pickerRoleDescription: (model) => `role · ${model}`,
    pickerRoleLabel: (name) => `as ${name}`,
    pickerRoomDescription: (type) => `room · ${type}`,
    pickerRoomLabel: (name) => `room ${name}`,
    pickerSettingsDescription: "settings overlay",
    pickerSettingsLabel: "settings",
    pickerWhereamiDescription: "current context",
    pickerWhereamiLabel: "whereami",
    pickerWorldDescription: (mode) => `world · ${mode}`,
    pickerWorldLabel: (name) => `world ${name}`,
    patchApplied: (historyId) => `Config patch applied. History: ${historyId}.`,
    patchApplyHint: (confirmation) => `Apply with :patch apply ${confirmation}`,
    patchApplyNeedsConfirmation: (confirmation) =>
      `This patch requires exact confirmation: :patch apply ${confirmation}`,
    patchApplyNoConfirm: "Apply with :patch apply",
    patchCapabilities: "Capabilities",
    patchFiles: "Files",
    patchReasons: "Reasons",
    patchRejected: "Config patch rejected.",
    patchRisk: "Risk",
    patchSummary: "Summary",
    policy: "Policy",
    policyCapabilities: (allowed, denied, highRisk) =>
      `Capabilities: ${allowed} allowed, ${denied} denied, ${highRisk} high-risk allowed`,
    policyWarnings: (count) => `${count} policy warning${count === 1 ? "" : "s"}`,
    project: "Project",
    provider: "Provider",
    providerDescription: "Default provider used by Realm role turns.",
    reloaded: "Reloaded.",
    running: "Running",
    roleSendCancelled: "Role send cancelled.",
    roleSwitched: (identity) => `Speaking as ${identity}.`,
    room: "Room",
    roomSwitched: (room) => `Room switched to ${room}.`,
    settings: "Settings",
    settingsOpened: "Settings opened.",
    settingsSummaryLoaded: "Settings summary loaded.",
    shortcuts: "Shortcuts",
    slashAsDescription: "switch composer identity with confirmation",
    slashAssistantDescription: "ask assistant for a config patch",
    slashDraftsDescription: "list failed send drafts",
    slashMemoryDescription: "inspect role memory",
    slashPatchDescription: "preview/apply/reject config patch",
    slashRefreshDescription: "reload project state",
    slashRoomDescription: "switch room",
    slashSendDescription: "send a message",
    slashSettingsDescription: "open settings summary",
    slashStateDescription: "inspect world state",
    slashWhereamiDescription: "show current context",
    shortcutKeys: "Enter send · Ctrl+K commands · Ctrl+L rooms · Ctrl+R roles · Esc close · ? help",
    shortcutSlash: (identity, roomId) =>
      `Slash: /send <message> · /as ${identity} · /room ${roomId} · /state · /patch`,
    speaking: "Speaking",
    model: "Model",
    modelDescription: "Default model used by Realm role turns.",
    traceEvent: (type) => type,
    traceMessage: (identity) => `message ${identity}`,
    traceTurn: (status, actor) => `turn ${status} ${actor}`,
    traceWorldEvent: (title) => `world event ${title}`,
    trustTier: "Trust tier",
    useCtrlCToExit: "Use Ctrl+C to exit the Pi TUI.",
    visibleRoles: "Visible roles",
    world: "World",
    worldState: "World state",
    worldStateLoaded: "World state loaded.",
    worldSwitched: (world) => `World switched to ${world}.`,
  },
  "zh-CN": {
    assistantProposal: "助手提案",
    cannotApplyGodWithoutWorld: "没有当前世界，无法应用上帝动作。",
    cannotSendWithoutContext: "没有当前世界和房间，无法发送消息。",
    commandApplied: "命令已应用。",
    commandIgnored: "命令已忽略。",
    configPatch: "配置补丁",
    context: "上下文",
    conversations: "会话",
    defaultValue: "默认",
    draftRoleTakeoverCannotConfirm: "单次命令无法确认角色接管。",
    draftCopyTitle: (id) => `草稿 ${id} 的可复制详情`,
    draftCreatedAt: "创建时间",
    draftDetailsTitle: (id) => `草稿 ${id}`,
    draftEditSaved: (id) => `草稿 ${id} 已更新。使用 :retry-draft ${id} 发送。`,
    draftError: "失败原因",
    draftListEmpty: "没有保存的失败草稿。",
    draftListActions: (id) =>
      `操作：:draft ${id} · :edit-draft ${id} <消息> · :copy-draft ${id} · :retry-draft ${id}`,
    draftListTitle: "失败草稿",
    draftPath: "文件",
    draftRetryMissing: (id) => `草稿 ${id} 不存在。`,
    draftRetrySent: (id) => `草稿 ${id} 已发送并移除。`,
    draftSaved: (id, filePath) =>
      `发送失败。草稿 ${id} 已保存到 ${filePath}。可用 :draft ${id}、:edit-draft ${id} <消息>、:copy-draft ${id} 或 :retry-draft ${id}。`,
    eventsRecorded: "已记录事件",
    footer: "Ctrl+K 命令 · Esc 关闭 · ? 帮助 · Ctrl+C 退出",
    godActionApplied: (action, target) => `上帝动作 ${action} 已应用到 ${target}。`,
    godActionCancelled: "上帝动作已取消。",
    godConsoleBody: (roleLines) =>
      [
        "# 上帝控制台",
        "",
        "上帝裁判会改变世界事实，必须和普通聊天分开。",
        "",
        "在输入区运行受保护动作：",
        "",
        "```text",
        ":god mute <role-id> <reason>",
        ":god kill <role-id> <reason>",
        ":god revive <role-id> <reason>",
        "```",
        "",
        "Realm 会要求你输入完整角色 id 后才执行。",
        "",
        "角色：",
        roleLines,
      ].join("\n"),
    godConsoleOpened: "上帝控制台已打开。破坏性裁判请使用受保护的 :god 命令。",
    helpOpened: "帮助已打开。",
    identity: "身份",
    identityDescription: "输入区当前使用的参与者账号。",
    idle: "空闲",
    latestTrace: "最新 trace",
    memory: "记忆",
    memoryEmpty: "暂无记忆记录。",
    memoryLoaded: (roleId) => `已加载 ${roleId} 的记忆。`,
    messageSent: "消息已发送。",
    messageSentAs: (identity) => `已用 ${identity} 身份发送。`,
    messages: "消息",
    noConfigPatch: "当前没有待处理的配置补丁提案。",
    noTrace: "无",
    noRolesLoaded: "没有加载角色",
    noConversations: "暂无会话",
    noMessages: "还没有消息",
    noRoom: "无房间",
    noValue: "无",
    noWorld: "无世界",
    pickerGodDescription: "高权限世界裁判面板",
    pickerGodLabel: "上帝控制台",
    pickerRoleDescription: (model) => `角色 · ${model}`,
    pickerRoleLabel: (name) => `切换为 ${name}`,
    pickerRoomDescription: (type) => `房间 · ${type}`,
    pickerRoomLabel: (name) => `房间 ${name}`,
    pickerSettingsDescription: "设置面板",
    pickerSettingsLabel: "设置",
    pickerWhereamiDescription: "当前上下文",
    pickerWhereamiLabel: "我在哪",
    pickerWorldDescription: (mode) => `世界 · ${mode}`,
    pickerWorldLabel: (name) => `世界 ${name}`,
    patchApplied: (historyId) => `配置补丁已应用。历史记录：${historyId}。`,
    patchApplyHint: (confirmation) => `使用 :patch apply ${confirmation} 应用`,
    patchApplyNeedsConfirmation: (confirmation) =>
      `该补丁需要精确确认：:patch apply ${confirmation}`,
    patchApplyNoConfirm: "使用 :patch apply 应用",
    patchCapabilities: "能力",
    patchFiles: "文件",
    patchReasons: "原因",
    patchRejected: "配置补丁已拒绝。",
    patchRisk: "风险",
    patchSummary: "摘要",
    policy: "策略",
    policyCapabilities: (allowed, denied, highRisk) =>
      `能力：允许 ${allowed}，拒绝 ${denied}，高风险允许 ${highRisk}`,
    policyWarnings: (count) => `${count} 条策略警告`,
    project: "项目",
    provider: "Provider",
    providerDescription: "Realm 角色回合默认使用的 Provider。",
    reloaded: "已刷新。",
    running: "运行状态",
    roleSendCancelled: "角色发送已取消。",
    roleSwitched: (identity) => `已切换发送身份：${identity}。`,
    room: "房间",
    roomSwitched: (room) => `已切换房间：${room}。`,
    settings: "设置",
    settingsOpened: "设置已打开。",
    settingsSummaryLoaded: "设置摘要已加载。",
    shortcuts: "快捷键",
    slashAsDescription: "确认后切换输入身份",
    slashAssistantDescription: "让助手生成配置补丁",
    slashDraftsDescription: "查看失败草稿",
    slashMemoryDescription: "查看角色记忆",
    slashPatchDescription: "预览/应用/拒绝配置补丁",
    slashRefreshDescription: "重新加载项目状态",
    slashRoomDescription: "切换房间",
    slashSendDescription: "发送消息",
    slashSettingsDescription: "打开设置摘要",
    slashStateDescription: "查看世界状态",
    slashWhereamiDescription: "显示当前上下文",
    shortcutKeys: "Enter 发送 · Ctrl+K 命令 · Ctrl+L 房间 · Ctrl+R 角色 · Esc 关闭 · ? 帮助",
    shortcutSlash: (identity, roomId) =>
      `斜杠命令：/send <message> · /as ${identity} · /room ${roomId} · /state · /patch`,
    speaking: "发送身份",
    model: "模型",
    modelDescription: "Realm 角色回合默认使用的模型。",
    traceEvent: (type) => type,
    traceMessage: (identity) => `消息 ${identity}`,
    traceTurn: (status, actor) => `回合 ${status} ${actor}`,
    traceWorldEvent: (title) => `世界事件 ${title}`,
    trustTier: "信任级别",
    useCtrlCToExit: "按 Ctrl+C 退出 Pi TUI。",
    visibleRoles: "可见角色",
    world: "世界",
    worldState: "世界状态",
    worldStateLoaded: "世界状态已加载。",
    worldSwitched: (world) => `已切换世界：${world}。`,
  },
};

export function resolveTuiLocale(locale: string | undefined): TuiLocale {
  return locale === "zh-CN" || locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function t(locale: TuiLocale): TuiDictionary {
  return tuiDictionaries[locale];
}
