import { tuiEn } from "./i18n-en.ts";
import { tuiZhCn } from "./i18n-zh-cn.ts";

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
  createRoleProposed: (id: string) => string;
  createWorldProposed: (id: string) => string;
  localeSwitched: (locale: string) => string;
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
  unknownRole: (roleId: string) => string;
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
  roleTurnCancelHint: string;
  roleTurnCancelled: string;
  // Two-phase running feedback (mirrors the Web in-flight turn lifecycle).
  turnRunning: (role: string, elapsed: string) => string;
  turnStarted: (role: string) => string;
  turnSucceeded: (role: string) => string;
  turnFailed: (role: string) => string;
  turnCancelActiveHint: string;
  // `:run-role` with no role id lists current room-member roles instead of erroring.
  runRoleNeedsRole: string;
  runRoleAvailableRoles: (roles: string) => string;
  runRoleNoMembers: string;
  // Confirmation dialog lines. Threaded into the four format*Confirmation
  // functions so destructive/identity gates render in the active locale.
  confirmYesNo: string;
  confirmTypeRoleId: (roleId: string) => string;
  confirmTypeWorldId: (worldId: string) => string;
  // Simulation / model / rollback safety gates (TUI-only; mirror the Web gates).
  simTickConfirmPrompt: (world: string, ticks: number) => string;
  simForkConfirmPrompt: (world: string, label: string) => string;
  simIrreversibleNote: string;
  simActionCancelled: string;
  modelChangePrompt: (current: string, next: string) => string;
  modelChangeCancelled: string;
  modelChanged: (providerModel: string) => string;
  rollbackNeedsHistoryId: string;
  rollbackHint: string;
  configRolledBack: (historyId: string, paths: string) => string;
  slashRollbackDescription: string;
  permissionTrustUnknown: string;
  permissionSummary: (trust: string, allowed: number, denied: number, highRisk: number) => string;
  roleTurnRunPrompt: (role: string, room: string) => string;
  confirmWorldOperator: (world: string) => string;
  roleTurnModelPermissions: (provider: string, model: string, permissions: string) => string;
  roleTurnPromptLine: (prompt: string) => string;
  roleSendPrompt: (identity: string, room: string) => string;
  // Surfaced when a role turn / role send targets a room the role is not a
  // member of — mirrors the Web `roomMembersForAvatar` precondition. Named
  // reason so the operator sees WHY the action was refused (never a silent no-op).
  roleNotInRoom: (roleLabel: string, roomName: string) => string;
  identitySwitchPrompt: (label: string, identity: string) => string;
  identitySwitchOperatorNote: string;
  identitySwitchConfirmHint: string;
  godActionPrompt: (action: string, target: string, world: string) => string;
  godActionReasonLine: (reason: string) => string;
  room: string;
  roomCreated: (room: string) => string;
  roomSwitched: (room: string) => string;
  roleTurnCompleted: (role: string, messageId: string) => string;
  settings: string;
  settingsOpened: string;
  settingsSummaryLoaded: string;
  shortcuts: string;
  simExported: (eventCount: number, replayHash: string) => string;
  simForked: (forkId: string, label: string) => string;
  simNoWorld: string;
  simPaused: (version: number) => string;
  simResumed: (version: number) => string;
  simStatus: (paused: boolean, tick: number, activeRuns: number) => string;
  simTicked: (ticks: number, eventCount: number) => string;
  slashAsDescription: string;
  slashAssistantDescription: string;
  slashCreateRoleDescription: string;
  slashCreateRoomDescription: string;
  slashCreateWorldDescription: string;
  slashDraftsDescription: string;
  slashLocaleDescription: string;
  slashSimDescription: string;
  slashMemoryDescription: string;
  slashPatchDescription: string;
  slashRefreshDescription: string;
  slashRoomDescription: string;
  slashRunRoleDescription: string;
  slashSendDescription: string;
  slashSettingsDescription: string;
  slashStateDescription: string;
  slashWhereamiDescription: string;
  slashWorldDescription: string;
  shortcutKeys: string;
  shortcutSlash: (identity: string, roomId: string) => string;
  speaking: string;
  model: string;
  modelDescription: string;
  traceEvent: (type: string) => string;
  traceMessage: (identity: string) => string;
  transcriptNewer: (count: number) => string;
  transcriptOlder: (count: number) => string;
  traceTurn: (status: string, actor: string) => string;
  traceWorldEvent: (title: string) => string;
  trustTier: string;
  useCtrlCToExit: string;
  pressCtrlCAgain: string;
  visibleRoles: string;
  world: string;
  worldState: string;
  worldStateLoaded: string;
  worldSwitched: (world: string) => string;
};

export const tuiLocales = ["en", "zh-CN"] as const;

export const tuiDictionaries: Record<TuiLocale, TuiDictionary> = {
  en: tuiEn,
  "zh-CN": tuiZhCn,
};

export function resolveTuiLocale(locale: string | undefined): TuiLocale {
  return locale === "zh-CN" || locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function t(locale: TuiLocale): TuiDictionary {
  return tuiDictionaries[locale];
}
