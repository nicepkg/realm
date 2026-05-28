import type { Message, RealmEvent, RoleSummary, Room, WorldSummary } from "@realm/api-contract";

export type AppSection = "chats" | "roles" | "worlds" | "settings";
export type GodRoleAction = "kill" | "mute" | "revive";

/**
 * Optimistic message bubble shown immediately on send, before the server
 * confirms. `status` drives the timeline render.
 */
export type PendingMessage = {
  pendingId: string;
  roomId: string;
  worldId: string;
  displayedAuthorId: string;
  content: string;
  createdAt: string;
  status: "pending" | "failed";
};

/**
 * Inline send failure surfaced near the composer. Carries the failed draft so
 * the render layer can restore it on retry and copy raw details for support.
 */
export type SendError = {
  pendingId: string;
  roomId: string;
  worldId: string;
  displayedAuthorId: string;
  draft: string;
  message: string;
};

export type TurnRunState = {
  status: "idle" | "running" | "error";
  worldId?: string;
  roomId?: string;
  roleId?: string;
  turnId?: string;
  startedAt?: string;
  error?: string;
  /** True when the failure is a trust/policy gate that the trust banner can fix. */
  trustRelated?: boolean;
};

export type AppState = {
  status: "loading" | "ready" | "error";
  projectName: string;
  worlds: WorldSummary[];
  rooms: Room[];
  roles: RoleSummary[];
  messages: Message[];
  conversationMessages: Message[];
  events: RealmEvent[];
  worldState?: {
    version: number;
    state: Record<string, unknown>;
  };
  error?: string;
};

export type LoadRealmOptions = {
  resetIdentity?: boolean;
};

export const initialState: AppState = {
  conversationMessages: [],
  events: [],
  messages: [],
  projectName: "Realm",
  roles: [],
  rooms: [],
  status: "loading",
  worlds: [],
};

export const idleTurnRun: TurnRunState = { status: "idle" };

type TurnFailureKey =
  | "roleTurn.failedReadOnly"
  | "roleTurn.failedPolicy"
  | "roleTurn.failedGeneric";

/**
 * Classify a raw error/reason string into a localized message + a flag marking
 * trust/policy gates so the UI can route them to the trust banner instead of a
 * generic "check the trace" hint. Pure so it is unit-testable in isolation.
 */
export function classifyTurnFailure(
  reason: string | undefined,
  t: (key: TurnFailureKey) => string,
): { error: string; trustRelated: boolean } {
  const normalized = reason?.toLowerCase() ?? "";
  if (normalized.includes("read-only") || normalized.includes("raise trust")) {
    return { error: t("roleTurn.failedReadOnly"), trustRelated: true };
  }
  if (
    normalized.includes("policy") ||
    normalized.includes("not in the allowlist") ||
    normalized.includes("denied")
  ) {
    return { error: t("roleTurn.failedPolicy"), trustRelated: true };
  }
  return {
    error: reason ? `${t("roleTurn.failedGeneric")} ${reason}` : t("roleTurn.failedGeneric"),
    trustRelated: false,
  };
}

/**
 * Find the most recent policy/tool denial reason in the event log, used to give
 * an async `turn.failed` (whose payload carries no reason) a real cause.
 */
export function latestDenialReason(events: RealmEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    if (event.type === "audit.created" && event.audit.action.includes("denied")) {
      return event.audit.reason ?? event.audit.action;
    }
    if (event.type === "tool.called" && event.toolCall.status === "denied") {
      return event.toolCall.reason ?? event.toolCall.name;
    }
  }
  return undefined;
}

/**
 * Pure transition that folds a server-confirmed message into app state without
 * a full realm reload. Idempotent on message id; only the active room's visible
 * timeline gains the message, while the cross-room conversation list always does.
 */
export function appendSentMessage(
  current: AppState,
  message: Message,
  options: { isActiveRoom: boolean },
): AppState {
  if (current.conversationMessages.some((existing) => existing.id === message.id)) {
    return current;
  }
  return {
    ...current,
    conversationMessages: [...current.conversationMessages, message],
    messages: options.isActiveRoom ? [...current.messages, message] : current.messages,
  };
}

export function resolveIdentityAfterRealmLoad(
  currentIdentity: string,
  availableIdentities: string[],
  resetIdentity = false,
): string {
  if (resetIdentity) {
    return "owner";
  }
  return availableIdentities.includes(currentIdentity) ? currentIdentity : "owner";
}
