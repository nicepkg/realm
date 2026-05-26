import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";
import type { TuiState } from "./types.ts";

const width = 88;

export function renderTui(state: TuiState): string {
  return [
    titleLine(state),
    divider(),
    renderRooms(state.rooms, state.room),
    divider(),
    renderChat(state.messages, state.roles),
    divider(),
    renderInspector(state),
    divider(),
    renderCommandPalette(state),
  ].join("\n");
}

function titleLine(state: TuiState): string {
  const world = state.world ? `${state.world.name} (${state.world.mode.type})` : "No world";
  const room = state.room ? state.room.name : "No room";
  return fit(`Realm TUI | ${state.projectName} | ${world} | ${room}`, width);
}

function renderRooms(rooms: Room[], selectedRoom: Room | undefined): string {
  const rows =
    rooms.length === 0 ? ["  no rooms"] : rooms.map((room) => roomRow(room, selectedRoom));
  return ["Rooms", ...rows].join("\n");
}

function roomRow(room: Room, selectedRoom: Room | undefined): string {
  const marker = room.id === selectedRoom?.id ? ">" : " ";
  return fit(`${marker} ${room.id.padEnd(16)} ${room.type.padEnd(11)} ${room.name}`, width);
}

function renderChat(messages: Message[], roles: RoleSummary[]): string {
  if (messages.length === 0) {
    return "Chat\n  no messages yet";
  }
  return ["Chat", ...messages.slice(-12).map((message) => messageRow(message, roles))].join("\n");
}

function messageRow(message: Message, roles: RoleSummary[]): string {
  const author = displayName(message.displayedAuthorId, roles);
  return fit(`  ${author}: ${message.content.replace(/\s+/g, " ")}`, width);
}

function renderInspector(state: TuiState): string {
  const trace = latestTrace(state.events);
  const rows = [
    `Identity: ${state.identity}`,
    `Roles: ${state.roles.map((role) => role.id).join(", ") || "none"}`,
    `Events: ${state.events.length}`,
    `Latest trace: ${trace}`,
  ];
  if (state.settingsSummary) {
    rows.push(`Settings: ${state.settingsSummary}`);
  }
  if (state.assistantProposal) {
    rows.push(`Assistant proposal: ${state.assistantProposal.title}`);
  }
  return ["Inspector", ...rows.map((row) => fit(`  ${row}`, width))].join("\n");
}

function renderCommandPalette(state: TuiState): string {
  const roomId = state.room?.id ?? "main";
  return [
    "Commands",
    fit(`  :send <message>  :id ${state.identity}  :room ${roomId}  :settings`, width),
    fit("  :model <provider> <id>  :assistant <goal>  :refresh  :q", width),
  ].join("\n");
}

function latestTrace(events: RealmEvent[]): string {
  const event = events.at(-1);
  if (!event) {
    return "none";
  }
  if (event.type === "message.created") {
    return `message ${event.message.displayedAuthorId}`;
  }
  if (event.type === "world.event.triggered") {
    return `world event ${event.event.title}`;
  }
  if (event.type === "turn.completed" || event.type === "turn.failed") {
    return `turn ${event.turn.status} ${event.turn.actorId}`;
  }
  return event.type;
}

function displayName(identity: string, roles: RoleSummary[]): string {
  if (identity === "owner") {
    return "Boss";
  }
  if (identity === "god") {
    return "God";
  }
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}

function divider(): string {
  return "-".repeat(width);
}

function fit(value: string, maxWidth: number): string {
  return value.length > maxWidth ? `${value.slice(0, maxWidth - 1)}…` : value;
}
