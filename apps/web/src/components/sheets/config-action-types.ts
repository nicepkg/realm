import type { ConfigPatchProposal } from "@realm/api-contract";

export type ConfigActionSheetKind = "create-world" | "assistant-config" | "create-room";
export type WorldMode = "debate" | "workflow" | "game" | "simulation" | "sandbox";
export type RoomType = "group" | "dm" | "god-channel" | "system";

export type PatchApplyResult = {
  patchId: string;
  historyId: string;
  changedPaths: string[];
};

export type PatchAppliedHandler = (proposal: ConfigPatchProposal, result: PatchApplyResult) => void;

export type AppliedConfigPatch = PatchApplyResult & {
  summary: string;
  title: string;
};
