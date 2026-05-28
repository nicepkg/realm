import type {
  ConfigPatchProposal,
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorldSummary,
} from "@realm/api-contract";
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

export type TuiGodRoleAction = "kill" | "mute" | "revive";

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
  | { kind: "room"; roomId: string }
  | { kind: "identity"; identity: string }
  | { kind: "send"; content: string }
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
  | { kind: "assistant"; goal: string };
