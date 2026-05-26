import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";

export type ConversationRow = {
  id: string;
  room: Room;
  title: string;
  subtitle: string;
  badge: string;
  lastMessage: string;
  timestamp: string;
};

export type TraceEvent = Extract<
  RealmEvent,
  { type: "turn.started" | "turn.delta" | "turn.completed" | "tool.called" }
>;

export function buildConversationRows(
  rooms: Room[],
  messages: Message[],
  roles: RoleSummary[],
): ConversationRow[] {
  const latestByRoom = new Map<string, Message>();
  for (const message of messages) {
    const previous = latestByRoom.get(message.roomId);
    if (!previous || previous.createdAt < message.createdAt) {
      latestByRoom.set(message.roomId, message);
    }
  }
  return rooms.map((room) => {
    const latest = latestByRoom.get(room.id);
    const participantNames = room.memberIds
      .slice(0, 3)
      .map((id) => displayNameForIdentity(id, roles))
      .join(", ");
    return {
      id: room.id,
      room,
      title: room.name,
      subtitle: participantNames || roomTypeLabel(room.type),
      badge: roomTypeLabel(room.type),
      lastMessage: latest
        ? `${displayNameForIdentity(latest.displayedAuthorId, roles)}: ${latest.content}`
        : "",
      timestamp: latest ? formatConversationTime(latest.createdAt) : "",
    };
  });
}

export function displayNameForIdentity(identity: string, roles: RoleSummary[]): string {
  if (identity === "owner") {
    return "Boss";
  }
  if (identity === "god") {
    return "God";
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
    event.type === "tool.called"
  );
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
  return {
    title: `Turn ${event.turn.status}: ${event.turn.actorId}`,
    body: describeTurn(event.turn),
  };
}

type TraceTurn = Extract<TraceEvent, { type: "turn.started" }>["turn"];

function describeTurn(turn: TraceTurn): string {
  const details = [turn.model ? `Model: ${turn.model}` : "Model: default"];
  if (turn.usage) {
    details.push(formatUsage(turn.usage));
  }
  return details.join(" | ");
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
