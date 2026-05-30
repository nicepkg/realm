import type { ConfigAssistantPlanner, ConfigPlannerModel } from "@realm/assistant";
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
  /**
   * Direct model override for the NL intent router. When set, the model-backed
   * router is used regardless of runtime mode (still failure-safe). Normally
   * unset — the service resolves a provider via the role-turn path instead.
   */
  intentRouterModel?: ConfigPlannerModel;
  piBridge?: PiBridge;
  extensionBaseUrl?: string;
  piExtensionPath?: string;
  fakeVerticalSlice?: boolean;
  env?: NodeJS.ProcessEnv;
  extensionStaticTokens?: Array<ExtensionSessionScope & { token: string }>;
};
