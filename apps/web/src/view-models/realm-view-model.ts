import type {
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  WorkflowApproval,
  WorkflowProjectPatch,
} from "@realm/api-contract";

export type ConversationRow = {
  id: string;
  room: Room;
  title: string;
  subtitle: string;
  badge: string;
  lastMessage: string;
  timestamp: string;
};

export type IdentityLabels = {
  god?: string;
  owner?: string;
};

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

export function buildConversationRows(
  rooms: Room[],
  messages: Message[],
  roles: RoleSummary[],
  labels: IdentityLabels = defaultIdentityLabels,
): ConversationRow[] {
  const latestByRoom = new Map<string, Message>();
  for (const message of messages) {
    const previous = latestByRoom.get(message.roomId);
    if (!previous || previous.createdAt < message.createdAt) {
      latestByRoom.set(message.roomId, message);
    }
  }
  return rooms
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
          subtitle: participantNames || roomTypeLabel(room.type),
          badge: roomTypeLabel(room.type),
          lastMessage: latest
            ? `${displayNameForIdentity(latest.displayedAuthorId, roles, labels)}: ${latest.content}`
            : "",
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

export function roomTypeLabel(type: Room["type"]): string {
  if (type === "world-main") {
    return "all";
  }
  if (type === "god-channel") {
    return "god";
  }
  if (type === "dm") {
    return "dm";
  }
  if (type === "system") {
    return "system";
  }
  return "group";
}

export function turnStatusLabel(status: "idle" | "running" | "error"): string {
  if (status === "running") {
    return "role running";
  }
  if (status === "error") {
    return "needs attention";
  }
  return "ready";
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

export function describeTraceEvent(event: TraceEvent): { title: string; body: string } {
  if (event.type === "turn.started") {
    return {
      title: `Turn started: ${event.turn.actorId}`,
      body: describeTurn(event.turn),
    };
  }
  if (event.type === "turn.delta") {
    return {
      title: `Streaming: ${event.delta.roleId}`,
      body: event.delta.delta,
    };
  }
  if (event.type === "tool.called") {
    return {
      title: `Tool ${event.toolCall.status}: ${event.toolCall.name}`,
      body: event.toolCall.reason ?? event.toolCall.id,
    };
  }
  if (event.type === "audit.created") {
    return {
      title: `Audit: ${event.audit.action}`,
      body: `${event.audit.target}: ${event.audit.reason}`,
    };
  }
  if (event.type === "world.event.triggered") {
    return {
      title: `World event: ${event.event.title}`,
      body: `${event.event.kind} · ${event.event.status}`,
    };
  }
  if (event.type === "world.tick.triggered") {
    return {
      title: `Tick ${event.tick.tick}`,
      body: event.tick.eventId ? `Triggered ${event.tick.eventId}` : event.tick.status,
    };
  }
  return {
    title: `Turn ${event.turn.status}: ${event.turn.actorId}`,
    body: describeTurn(event.turn),
  };
}

type TraceTurn = Extract<TraceEvent, { type: "turn.started" }>["turn"];

function describeTurn(turn: TraceTurn): string {
  const details = [turn.model ? `Model: ${turn.model}` : "Model: default"];
  if (turn.runtime) {
    details.push(formatRuntime(turn.runtime));
  }
  if (turn.usage) {
    details.push(formatUsage(turn.usage));
  }
  return details.join(" | ");
}

function formatRuntime(runtime: NonNullable<TraceTurn["runtime"]>): string {
  const version = runtime.packageVersion ? ` ${runtime.packageVersion}` : "";
  const packageName = runtime.packageName ? ` (${runtime.packageName}${version})` : "";
  const fallback = runtime.fallback ? `, fallback ${runtime.fallback.status}` : "";
  return `Runtime: ${runtime.adapterKind}${packageName}${fallback}`;
}

function formatUsage(usage: NonNullable<TraceTurn["usage"]>): string {
  const base = `${usage.totalTokens.toLocaleString()} tokens`;
  const split = `in ${usage.input.toLocaleString()}, out ${usage.output.toLocaleString()}`;
  const cache =
    usage.cacheRead > 0 || usage.cacheWrite > 0
      ? `, cache ${usage.cacheRead.toLocaleString()}/${usage.cacheWrite.toLocaleString()}`
      : "";
  const cost = usage.cost.total > 0 ? `, $${usage.cost.total.toFixed(6)}` : "";
  return `Usage: ${base} (${split}${cache}${cost})`;
}
