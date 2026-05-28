import type { ConfigAssistantPlanner } from "@realm/assistant";
import type { FileConfigPatchStore } from "@realm/config";
import type { PiBridge } from "@realm/pi-bridge";
import type { TrustTier } from "@realm/policy";
import type { EventStore } from "@realm/storage";
import type { ExtensionSessionScope } from "./extension-access-service.ts";

export type RunRoleTurnInput = {
  turnId?: string;
  worldId: string;
  roomId: string;
  roleId: string;
  prompt?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type RealmApplicationServiceOptions = {
  root: string;
  eventStore?: EventStore;
  trustTier?: TrustTier;
  clock?: () => Date;
  patchStore?: FileConfigPatchStore;
  configAssistantPlanner?: ConfigAssistantPlanner;
  piBridge?: PiBridge;
  extensionBaseUrl?: string;
  piExtensionPath?: string;
  fakeVerticalSlice?: boolean;
  env?: NodeJS.ProcessEnv;
  extensionStaticTokens?: Array<ExtensionSessionScope & { token: string }>;
};
