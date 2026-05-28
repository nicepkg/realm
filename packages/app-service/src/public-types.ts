/**
 * Public type surface re-exported by the app-service package entrypoint.
 * Split out of `index.ts` to keep the service facade under the line cap while
 * preserving the flat `@realm/app-service` import experience.
 */
export type {
  ExtensionAccessDecision,
  ExtensionAccessInput,
  ExtensionSessionScope,
} from "./extension-access-service.ts";
export type { CreateRoomInput, SendMessageInput } from "./message-service.ts";
export type { ApplyProjectPatchInput, ProposeProjectPatchInput } from "./project-patch-service.ts";
export type { RoleMemoryInput, RoleMemoryWriteInput } from "./role-memory-service.ts";
export type { RealmApplicationServiceOptions, RunRoleTurnInput } from "./types.ts";
export type {
  CreateWorkflowArtifactInput,
  CreateWorkflowTaskInput,
  DecideWorkflowApprovalInput,
  DecideWorkflowReviewInput,
  RequestWorkflowApprovalInput,
  RequestWorkflowReviewInput,
} from "./workflow-service.ts";
export type {
  AdminStatePatchInput,
  GodRoleActionInput,
  GodRoleActionResult,
  NaturalWorldEventInput,
  NaturalWorldEventResult,
  RandomNaturalWorldEventInput,
  StateQueryInput,
  WorldStateView,
} from "./world-state-service.ts";
