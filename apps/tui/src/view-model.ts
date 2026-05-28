import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";
import { renderConfigPatchPreview } from "./config-patch-preview.ts";
import { type TuiLocale, t } from "./i18n.ts";
import { previewJson } from "./state-inspection.ts";
import type { TuiState } from "./types.ts";

const width = 88;

export function renderTui(state: TuiState, locale: TuiLocale = "en"): string {
  return [
    renderStatus(state, locale),
    divider(),
    renderConversations(state.rooms, state.room, locale),
    divider(),
    renderMessages(state.messages, state.roles, locale),
    divider(),
    renderContext(state, locale),
    divider(),
    renderShortcuts(state, locale),
  ].join("\n");
}

function renderStatus(state: TuiState, locale: TuiLocale): string {
  const dict = t(locale);
  const world = state.world ? `${state.world.name} (${state.world.mode.type})` : dict.noWorld;
  const room = state.room ? state.room.name : dict.noRoom;
  return [
    fit(`Realm TUI | ${state.projectName}`, width),
    fit(
      `${dict.world}: ${world} | ${dict.room}: ${room} | ${dict.speaking}: ${state.identity}`,
      width,
    ),
  ].join("\n");
}

function renderConversations(
  rooms: Room[],
  selectedRoom: Room | undefined,
  locale: TuiLocale,
): string {
  const dict = t(locale);
  const rows =
    rooms.length === 0
      ? [`  ${dict.noConversations}`]
      : rooms.map((room) => roomRow(room, selectedRoom));
  return [dict.conversations, ...rows].join("\n");
}

function roomRow(room: Room, selectedRoom: Room | undefined): string {
  const marker = room.id === selectedRoom?.id ? ">" : " ";
  return fit(`${marker} ${room.id.padEnd(16)} ${room.type.padEnd(11)} ${room.name}`, width);
}

function renderMessages(messages: Message[], roles: RoleSummary[], locale: TuiLocale): string {
  const dict = t(locale);
  if (messages.length === 0) {
    return `${dict.messages}\n  ${dict.noMessages}`;
  }
  return [dict.messages, ...messages.slice(-12).map((message) => messageRow(message, roles))].join(
    "\n",
  );
}

function messageRow(message: Message, roles: RoleSummary[]): string {
  const author = displayName(message.displayedAuthorId, roles);
  return fit(`  ${author}: ${message.content.replace(/\s+/g, " ")}`, width);
}

function renderContext(state: TuiState, locale: TuiLocale): string {
  const dict = t(locale);
  const trace = latestTrace(state.events, dict);
  const rows = [
    `${dict.visibleRoles}: ${state.roles.map((role) => role.id).join(", ") || dict.noValue}`,
    `${dict.eventsRecorded}: ${state.events.length}`,
    `${dict.latestTrace}: ${trace}`,
  ];
  if (state.worldState) {
    rows.push(
      `${dict.worldState}: v${state.worldState.version} ${previewJson(state.worldState.state, 160).replace(/\s+/g, " ")}`,
    );
  }
  if (state.stateInspection) {
    rows.push(state.stateInspection);
  }
  if (state.memoryInspection) {
    rows.push(state.memoryInspection);
  }
  if (state.settingsSummary) {
    rows.push(`${dict.settings}: ${state.settingsSummary}`);
  }
  if (state.assistantProposal) {
    rows.push(renderConfigPatchPreview(state.assistantProposal, locale));
  }
  if (state.lastPatchApply) {
    rows.push(
      `${dict.configPatch}: ${state.lastPatchApply.patchId} -> ${state.lastPatchApply.changedPaths.join(", ")}`,
    );
  }
  return [
    dict.context,
    ...rows.flatMap((row) => row.split("\n").map((line) => fit(`  ${line}`, width))),
  ].join("\n");
}

function renderShortcuts(state: TuiState, locale: TuiLocale): string {
  const dict = t(locale);
  const roomId = state.room?.id ?? "main";
  return [
    dict.shortcuts,
    fit(`  ${dict.shortcutKeys}`, width),
    fit(`  ${dict.shortcutSlash(state.identity, roomId)}`, width),
  ].join("\n");
}

function latestTrace(events: RealmEvent[], dict: ReturnType<typeof t>): string {
  const event = events.at(-1);
  if (!event) {
    return dict.noTrace;
  }
  if (event.type === "message.created") {
    return dict.traceMessage(event.message.displayedAuthorId);
  }
  if (event.type === "world.event.triggered") {
    return dict.traceWorldEvent(event.event.title);
  }
  if (event.type === "turn.completed" || event.type === "turn.failed") {
    return dict.traceTurn(event.turn.status, event.turn.actorId);
  }
  return dict.traceEvent(event.type);
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
