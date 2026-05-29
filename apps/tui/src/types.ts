import type {
  ConfigPatchProposal,
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorldSummary,
} from "@realm/api-contract";
import type { TuiLocale } from "./i18n.ts";
import type { TuiPendingIdentitySwitch } from "./identity-switch-confirmation.ts";
import type { TuiWorldStateSnapshot } from "./state-inspection.ts";

export type TuiConfigPatchApplyResult = {
  patchId: string;
  historyId: string;
  changedPaths: string[];
};

export type TuiPolicySummary = {
  allowedCapabilities: number;
  deniedCapabilities: number;
  highRiskAllowed: number;
  trustTier: string;
  warnings: string[];
};

export type TuiState = {
  projectName: string;
  worlds: WorldSummary[];
  world?: WorldSummary;
  rooms: Room[];
  room?: Room;
  roles: RoleSummary[];
  messages: Message[];
  events: RealmEvent[];
  identity: string;
  policySummary?: TuiPolicySummary;
  providerModel?: string;
  worldState?: TuiWorldStateSnapshot;
  stateInspection?: string;
  memoryInspection?: string;
  settingsSummary?: string;
  assistantProposal?: ConfigPatchProposal;
  lastPatchApply?: TuiConfigPatchApplyResult;
};

export type TuiSettingsItem = {
  currentValue: string;
  description: string;
  id: string;
  label: string;
};

export type TuiPendingRoleSend = {
  content: string;
  identity: string;
  identityLabel: string;
  roomId: string;
  roomName: string;
  worldId: string;
  worldName: string;
};

export type TuiPendingRoleTurn = {
  model: string;
  permissionSummary: string;
  prompt?: string;
  provider: string;
  roleId: string;
  roleLabel: string;
  roomId: string;
  roomName: string;
  worldId: string;
  worldName: string;
};

export type TuiGodRoleAction = "kill" | "mute" | "revive";
export type TuiRoomType = "group" | "dm" | "god-channel" | "system";
export type TuiWorldMode = "debate" | "workflow" | "game" | "simulation" | "sandbox";
export type TuiSimAction =
  | { kind: "status" }
  | { kind: "tick"; ticks: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "fork"; label?: string }
  | { kind: "export" };

export type TuiPendingGodAction = {
  action: TuiGodRoleAction;
  reason: string;
  targetRoleId: string;
  targetRoleLabel: string;
  worldId: string;
  worldName: string;
};

export type { TuiPendingIdentitySwitch };

export type TuiCommand =
  | { kind: "quit" }
  | { kind: "help" }
  | { kind: "refresh" }
  | { kind: "settings" }
  | { kind: "model"; provider: string; model: string }
  | { kind: "world"; worldId: string }
  | { kind: "room"; roomId: string }
  | { kind: "identity"; identity: string }
  | { kind: "send"; content: string }
  | { kind: "createRoom"; roomType: TuiRoomType; name: string; memberIds: string[] }
  | { kind: "createWorld"; worldId: string; name: string; mode: TuiWorldMode }
  | { kind: "createRole"; roleId: string; displayName: string; model: string }
  | { kind: "sim"; action: TuiSimAction }
  | { kind: "locale"; locale: TuiLocale }
  | { kind: "runRole"; roleId: string; prompt?: string }
  | { kind: "drafts" }
  | { kind: "draftDetails"; draftId: string }
  | { kind: "editDraft"; draftId: string; content: string }
  | { kind: "copyDraft"; draftId: string }
  | { kind: "retryDraft"; draftId: string }
  | { kind: "state"; path?: string }
  | { kind: "memory"; roleId: string }
  | { kind: "patchPreview" }
  | { kind: "patchApply"; confirmation?: string }
  | { kind: "patchReject" }
  | { kind: "god"; action: TuiGodRoleAction; targetRoleId: string; reason: string }
  | { kind: "rollback"; historyId?: string }
  | { kind: "assistant"; goal: string };
