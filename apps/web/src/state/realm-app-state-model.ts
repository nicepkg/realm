import type {
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  StatePatchResult,
  WorldSummary,
} from "@realm/api-contract";

export type AppSection = "chats" | "roles" | "worlds" | "settings";
export type GodRoleAction = "kill" | "mute" | "revive";

/**
 * A God/admin ruling result scoped to where it was issued. Scoping lets the
 * timeline drop a stale notice the moment the operator switches world or room,
 * so a ruling applied in one world never bleeds into an unrelated conversation
 * (FB-3). `roomId` is optional because a ruling targets a world, not a room, but
 * we remember the room it was issued from so a room switch within the same world
 * also clears the notice.
 */
export type GodActionResult = {
  worldId: string;
  roomId?: string;
  result: StatePatchResult;
};

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
  /**
   * Live assistant token text streamed for the active turn (FB-401). The pipeline
   * emits `turn.delta` events carrying real token text; we accumulate them here so
   * the primary chat bubble shows the answer forming instead of an opaque
   * "thinking…" shimmer. Reset to undefined on a fresh run and on every terminal
   * transition so a finished/failed/cancelled turn never leaves stale tokens.
   */
  streamedText?: string;
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

/**
 * Accumulate the live token text for an active turn from the event log (FB-401).
 * Walks every `turn.delta` event whose payload matches `turnId` and concatenates
 * its `delta` text in stream order. Pure + idempotent: the full deltas are always
 * folded from the authoritative event log, so re-running it after a reload (which
 * replays the same events) yields the identical string rather than double-counting.
 * Returns undefined when no tokens have arrived yet so the bubble can keep its
 * pre-first-token shimmer.
 */
export function accumulateStreamedText(
  events: RealmEvent[],
  turnId: string | undefined,
): string | undefined {
  if (!turnId) {
    return undefined;
  }
  let text = "";
  for (const event of events) {
    if (event.type === "turn.delta" && event.delta.turnId === turnId) {
      text += event.delta.delta;
    }
  }
  return text.length > 0 ? text : undefined;
}

/**
 * Resolve which role should be bound to the run-turn control for a room (MC-R4-1).
 * The run target must be a VISIBLE, room-scoped choice that can actually post into
 * the room, so we clamp it to a member of the room: keep the current selection if
 * it is already a member, otherwise default to the room's first role member. When
 * the room has no role members we fall back to the configured first role so the
 * control still names a concrete (if non-member) role rather than going blank —
 * the run gate downstream then blocks it with a clear reason.
 */
export function resolveRoomRunRoleId(
  memberIds: string[],
  roleIds: string[],
  currentRunRoleId: string,
): string {
  const memberRoleIds = roleIds.filter((id) => memberIds.includes(id));
  if (memberRoleIds.includes(currentRunRoleId)) {
    return currentRunRoleId;
  }
  return memberRoleIds[0] ?? roleIds[0] ?? "";
}

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
    if (
      event.type === "audit.created" &&
      (event.audit.action.includes("denied") || event.audit.action === "turn.failed")
    ) {
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

const VIEWER_STORAGE_PREFIX = "realm-viewer:";

/** localStorage key for the last viewer account (perspective) of a world. */
export function viewerStorageKey(worldId: string): string {
  return `${VIEWER_STORAGE_PREFIX}${worldId}`;
}

/** Restore the viewer account persisted for a world, defaulting to owner. */
export function readViewerIdentity(worldId: string | undefined): string {
  if (!worldId || typeof localStorage === "undefined") {
    return "owner";
  }
  return localStorage.getItem(viewerStorageKey(worldId)) ?? "owner";
}

/**
 * Decide whether a persisted viewer identity should be *offered* as a resume
 * suggestion rather than silently re-activated on world entry (L4-01). Owner is
 * always restored silently (returning to yourself is safe); a non-owner role is
 * never auto-activated — it is surfaced as a pending suggestion the operator must
 * confirm through the gated takeover dialog. Returns the role id to suggest, or
 * undefined when there is nothing to offer.
 */
export function pendingResumeFromStoredIdentity(stored: string): string | undefined {
  return stored === "owner" ? undefined : stored;
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
