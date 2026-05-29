import type {
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorkflowApproval,
  WorkflowProjectPatch,
} from "@realm/api-contract";
import type { StringMessageKey } from "../i18n/messages.ts";
import { en } from "../i18n/messages-en.ts";

/**
 * Locale-aware translator (the `t` from `useI18n`). Optional in the view-model
 * helpers so out-of-scope callers that have not yet threaded `t` keep compiling
 * with an English passthrough; the visible labels are localized at the render
 * sites that do pass `t`.
 */
export type Translate = (key: StringMessageKey) => string;

/**
 * English passthrough used when no `t` is supplied. It reads the English
 * source-of-truth dictionary so the labels stay in lockstep with the real UI
 * (no second hand-maintained copy) for callers that have not yet threaded a
 * translator.
 */
const englishFallback: Translate = (key) => en[key] as string;

export type ConversationRow = {
  id: string;
  room: Room;
  title: string;
  subtitle: string;
  lastMessage: string;
  timestamp: string;
  /** Latest message in the room, used by the list for unread + pin sorting. */
  latestMessage?: Message;
};

export type IdentityLabels = {
  god?: string;
  owner?: string;
};

/**
 * Last-resort English fallback for the two protocol-id pseudo-identities
 * (`owner` / `god`). Real render sites thread localized labels
 * (`t("common.boss")` / `t("common.god")`) via the `labels` arg, which
 * `displayNameForIdentity` always prefers — so no user-visible literal
 * "Boss"/"God" survives in the localized UI.
 */
const defaultIdentityLabels = {
  god: "God",
  owner: "Boss",
} satisfies Required<IdentityLabels>;

export type TraceEvent = Extract<
  RealmEvent,
  {
    type:
      | "turn.started"
      | "turn.delta"
      | "turn.completed"
      | "turn.failed"
      | "turn.cancelled"
      | "tool.called"
      | "audit.created"
      | "world.event.triggered"
      | "world.tick.triggered";
  }
>;

/**
 * Builds the conversation list from the viewer account's perspective.
 *
 * When `viewerIdentity` is `"owner"` (the operator / god-eye), every room is
 * visible. When it is a role id, only rooms that role belongs to are shown
 * (plus the always-visible world-main all-hands room). This is the literal
 * "different role's perspective" account switch (rebuild spec §7.2).
 */
export function buildConversationRows(
  rooms: Room[],
  messages: Message[],
  roles: RoleSummary[],
  labels: IdentityLabels = defaultIdentityLabels,
  viewerIdentity = "owner",
  t: Translate = englishFallback,
): ConversationRow[] {
  const latestByRoom = new Map<string, Message>();
  for (const message of messages) {
    const previous = latestByRoom.get(message.roomId);
    if (!previous || previous.createdAt < message.createdAt) {
      latestByRoom.set(message.roomId, message);
    }
  }
  return rooms
    .filter((room) => isRoomVisibleToViewer(room, viewerIdentity))
    .map((room, index) => {
      const latest = latestByRoom.get(room.id);
      const participantNames = room.memberIds
        .slice(0, 3)
        .map((id) => displayNameForIdentity(id, roles, labels))
        .join(", ");
      return {
        index,
        latestCreatedAt: latest?.createdAt ?? "",
        row: {
          id: room.id,
          room,
          title: room.name,
          subtitle: participantNames || roomTypeLabel(t, room.type),
          lastMessage: latest
            ? `${displayNameForIdentity(latest.displayedAuthorId, roles, labels)}: ${latest.content}`
            : "",
          ...(latest ? { latestMessage: latest } : {}),
          timestamp: latest ? formatConversationTime(latest.createdAt) : "",
        },
      };
    })
    .sort((left, right) => {
      if (left.latestCreatedAt && right.latestCreatedAt) {
        return right.latestCreatedAt.localeCompare(left.latestCreatedAt);
      }
      if (left.latestCreatedAt) {
        return -1;
      }
      if (right.latestCreatedAt) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}

/**
 * Owner sees every room (operator god-eye). A role account sees the always-on
 * world all-hands room plus any room it is a member of.
 */
export function isRoomVisibleToViewer(room: Room, viewerIdentity: string): boolean {
  if (viewerIdentity === "owner") {
    return true;
  }
  if (room.type === "world-main") {
    return true;
  }
  return room.memberIds.includes(viewerIdentity);
}

export function displayNameForIdentity(
  identity: string,
  roles: RoleSummary[],
  labels: IdentityLabels = defaultIdentityLabels,
): string {
  if (identity === "owner") {
    return labels.owner ?? defaultIdentityLabels.owner;
  }
  if (identity === "god") {
    return labels.god ?? defaultIdentityLabels.god;
  }
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}

export function roomTypeLabel(t: Translate, type: Room["type"]): string {
  return t(`roomType.${type}` as StringMessageKey);
}

export function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function isTraceEvent(event: RealmEvent): event is TraceEvent {
  return (
    event.type === "turn.started" ||
    event.type === "turn.delta" ||
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "turn.cancelled" ||
    event.type === "tool.called" ||
    event.type === "audit.created" ||
    event.type === "world.event.triggered" ||
    event.type === "world.tick.triggered"
  );
}

export function latestWorkflowApprovals(events: RealmEvent[]): WorkflowApproval[] {
  const approvals = new Map<string, WorkflowApproval>();
  for (const event of events) {
    if (
      event.type === "workflow.approval.requested" ||
      event.type === "workflow.approval.decided"
    ) {
      approvals.set(event.approval.id, event.approval);
    }
  }
  return [...approvals.values()].reverse();
}

export function latestProjectPatches(events: RealmEvent[]): WorkflowProjectPatch[] {
  const patches = new Map<string, WorkflowProjectPatch>();
  for (const event of events) {
    if (
      event.type === "workflow.project_patch.proposed" ||
      event.type === "workflow.project_patch.applied"
    ) {
      patches.set(event.projectPatch.id, event.projectPatch);
    }
  }
  return [...patches.values()].reverse();
}

/**
 * Localizes a trace event into a title/body pair. Machine values (role ids,
 * tool names, model names, numbers, statuses) stay verbatim; only the
 * surrounding words are translated. `t` is optional so out-of-scope render
 * sites (e.g. the world inspector) keep compiling with an English passthrough
 * until they thread a real translator.
 */
export function describeTraceEvent(
  event: TraceEvent,
  t: Translate = englishFallback,
): { title: string; body: string } {
  if (event.type === "turn.started") {
    return {
      title: `${t("trace.turnStarted")}: ${event.turn.actorId}`,
      body: describeTurn(t, event.turn),
    };
  }
  if (event.type === "turn.delta") {
    return {
      title: `${t("trace.streaming")}: ${event.delta.roleId}`,
      body: event.delta.delta,
    };
  }
  if (event.type === "tool.called") {
    return {
      title: `${t("trace.tool")} ${localizeTraceStatus(t, event.toolCall.status)}: ${event.toolCall.name}`,
      // Never surface the raw tool-call UUID as a body fallback — it is noise to
      // an operator. Prefer the human reason; otherwise say "no detail".
      body: event.toolCall.reason ?? t("trace.noDetail"),
    };
  }
  if (event.type === "audit.created") {
    return {
      title: `${t("trace.audit")}: ${event.audit.action}`,
      body: `${event.audit.target}: ${event.audit.reason}`,
    };
  }
  if (event.type === "world.event.triggered") {
    return {
      title: `${t("trace.worldEvent")}: ${event.event.title}`,
      // Keep the machine event kind verbatim (it is a stable taxonomy term) but
      // localize the lifecycle status so the zh UI never shows a raw enum.
      body: `${event.event.kind} · ${localizeTraceStatus(t, event.event.status)}`,
    };
  }
  if (event.type === "world.tick.triggered") {
    return {
      title: `${t("trace.tick")} ${event.tick.tick}`,
      body: event.tick.eventId
        ? `${t("trace.triggered")} ${event.tick.eventId}`
        : localizeTraceStatus(t, event.tick.status),
    };
  }
  return {
    title: `${t("trace.turnStatus")} ${localizeTraceStatus(t, event.turn.status)}: ${event.turn.actorId}`,
    body: describeTurn(t, event.turn),
  };
}

/**
 * Maps a machine status enum to a localized label. Known statuses collapse into
 * five human buckets (done / failed / cancelled / denied / running); anything
 * unknown passes through verbatim so the trace never hides an unexpected value.
 */
function localizeTraceStatus(t: Translate, raw: string): string {
  switch (raw) {
    case "ok":
    case "completed":
    case "success":
      return t("trace.statusDone");
    case "failed":
    case "error":
      return t("trace.statusFailed");
    case "cancelled":
      return t("trace.statusCancelled");
    case "denied":
      return t("trace.statusDenied");
    case "running":
    case "streaming":
      return t("trace.statusRunning");
    default:
      return raw;
  }
}

/**
 * Maps a runtime adapter kind to a localized label. Only the two product-facing
 * kinds are translated; any other value (e.g. a package/subprocess adapter id)
 * passes through verbatim.
 */
function localizeAdapterKind(t: Translate, raw: string): string {
  switch (raw) {
    case "fake":
      return t("trace.runtimeFake");
    case "pi":
      return t("trace.runtimePi");
    default:
      return raw;
  }
}

type TraceTurn = Extract<TraceEvent, { type: "turn.started" }>["turn"];

function describeTurn(t: Translate, turn: TraceTurn): string {
  const details = [`${t("trace.model")}: ${turn.model ?? t("common.default")}`];
  if (turn.runtime) {
    details.push(formatRuntime(t, turn.runtime));
  }
  if (turn.usage) {
    details.push(formatUsage(t, turn.usage));
  }
  return details.join(" | ");
}

function formatRuntime(t: Translate, runtime: NonNullable<TraceTurn["runtime"]>): string {
  const version = runtime.packageVersion ? ` ${runtime.packageVersion}` : "";
  const packageName = runtime.packageName ? ` (${runtime.packageName}${version})` : "";
  const fallback = runtime.fallback ? `, ${t("trace.fallback")} ${runtime.fallback.status}` : "";
  return `${t("trace.runtime")}: ${localizeAdapterKind(t, runtime.adapterKind)}${packageName}${fallback}`;
}

function formatUsage(t: Translate, usage: NonNullable<TraceTurn["usage"]>): string {
  const base = `${usage.totalTokens.toLocaleString()} ${t("trace.tokens")}`;
  const split = `${t("trace.in")} ${usage.input.toLocaleString()}, ${t("trace.out")} ${usage.output.toLocaleString()}`;
  const cache =
    usage.cacheRead > 0 || usage.cacheWrite > 0
      ? `, ${t("trace.cache")} ${usage.cacheRead.toLocaleString()}/${usage.cacheWrite.toLocaleString()}`
      : "";
  const cost = usage.cost.total > 0 ? `, $${usage.cost.total.toFixed(6)}` : "";
  return `${t("trace.usage")}: ${base} (${split}${cache}${cost})`;
}
