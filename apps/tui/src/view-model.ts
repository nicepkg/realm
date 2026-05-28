import type { Message, RealmEvent, RoleSummary, Room } from "@realm/api-contract";
import { renderConfigPatchPreview } from "./config-patch-preview.ts";
import { type TuiLocale, t } from "./i18n.ts";
import { previewJson } from "./state-inspection.ts";
import type { TuiState } from "./types.ts";

const DEFAULT_WIDTH = 88;
const MIN_WIDTH = 32;
export const DEFAULT_TRANSCRIPT_WINDOW = 12;

export type RenderTuiOptions = {
  width?: number;
  /** How many transcript rows to show at once. Defaults to 12. */
  transcriptWindow?: number;
  /**
   * How many rows to skip from the newest message, enabling scrollback.
   * 0 keeps the latest messages pinned to the bottom; larger values reveal
   * older history while the window size stays constant.
   */
  scrollOffset?: number;
};

export function renderTui(
  state: TuiState,
  locale: TuiLocale = "en",
  options: RenderTuiOptions = {},
): string {
  const width = normalizeWidth(options.width);
  const window = Math.max(1, options.transcriptWindow ?? DEFAULT_TRANSCRIPT_WINDOW);
  const scrollOffset = Math.max(0, options.scrollOffset ?? 0);
  return [
    renderStatus(state, locale, width),
    divider(width),
    renderConversations(state.rooms, state.room, locale, width),
    divider(width),
    renderMessages(state.messages, state.roles, locale, width, window, scrollOffset),
    divider(width),
    renderContext(state, locale, width),
    divider(width),
    renderShortcuts(state, locale, width),
  ].join("\n");
}

/**
 * Clamps a desired scroll offset so it never reveals "below" the newest
 * message or scrolls past the oldest. Shared by the interactive session so the
 * key handler and renderer agree on bounds.
 */
export function clampScrollOffset(
  messageCount: number,
  window: number,
  desiredOffset: number,
): number {
  const maxOffset = Math.max(0, messageCount - Math.max(1, window));
  return Math.min(Math.max(0, desiredOffset), maxOffset);
}

function renderStatus(state: TuiState, locale: TuiLocale, width: number): string {
  const dict = t(locale);
  const world = state.world ? `${state.world.name} (${state.world.mode.type})` : dict.noWorld;
  const room = state.room ? state.room.name : dict.noRoom;
  return [
    fit(`Realm TUI | ${state.projectName}`, width),
    fit(
      `${dict.world}: ${world} | ${dict.room}: ${room} | ${dict.speaking}: ${state.identity}`,
      width,
    ),
    fit(
      `${dict.provider}: ${state.providerModel ?? dict.noValue} | ${dict.running}: ${renderRunState(state.events, dict)}`,
      width,
    ),
  ].join("\n");
}

function renderConversations(
  rooms: Room[],
  selectedRoom: Room | undefined,
  locale: TuiLocale,
  width: number,
): string {
  const dict = t(locale);
  const rows =
    rooms.length === 0
      ? [`  ${dict.noConversations}`]
      : rooms.map((room) => roomRow(room, selectedRoom, width));
  return [dict.conversations, ...rows].join("\n");
}

function roomRow(room: Room, selectedRoom: Room | undefined, width: number): string {
  const marker = room.id === selectedRoom?.id ? ">" : " ";
  return fit(`${marker} ${room.id.padEnd(16)} ${room.type.padEnd(11)} ${room.name}`, width);
}

function renderMessages(
  messages: Message[],
  roles: RoleSummary[],
  locale: TuiLocale,
  width: number,
  window: number,
  scrollOffset: number,
): string {
  const dict = t(locale);
  if (messages.length === 0) {
    return `${dict.messages}\n  ${dict.noMessages}`;
  }
  const offset = clampScrollOffset(messages.length, window, scrollOffset);
  const end = messages.length - offset;
  const start = Math.max(0, end - window);
  const visible = messages.slice(start, end);
  const olderHidden = start;
  const newerHidden = messages.length - end;
  const header = [dict.messages];
  if (olderHidden > 0) {
    header.push(fit(`  ${dict.transcriptOlder(olderHidden)}`, width));
  }
  const lines = visible.map((message) => messageRow(message, roles, width));
  const footer = newerHidden > 0 ? [fit(`  ${dict.transcriptNewer(newerHidden)}`, width)] : [];
  return [...header, ...lines, ...footer].join("\n");
}

function messageRow(message: Message, roles: RoleSummary[], width: number): string {
  const author = displayName(message.displayedAuthorId, roles);
  return fit(`  ${author}: ${message.content.replace(/\s+/g, " ")}`, width);
}

function renderContext(state: TuiState, locale: TuiLocale, width: number): string {
  const dict = t(locale);
  const trace = latestTrace(state.events, dict);
  const rows = [
    `${dict.visibleRoles}: ${state.roles.map((role) => role.id).join(", ") || dict.noValue}`,
    `${dict.eventsRecorded}: ${state.events.length}`,
    `${dict.latestTrace}: ${trace}`,
  ];
  if (state.policySummary) {
    rows.push(
      `${dict.policy}: ${dict.trustTier}: ${state.policySummary.trustTier}`,
      dict.policyCapabilities(
        state.policySummary.allowedCapabilities,
        state.policySummary.deniedCapabilities,
        state.policySummary.highRiskAllowed,
      ),
      dict.policyWarnings(state.policySummary.warnings.length),
    );
  }
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

function renderShortcuts(state: TuiState, locale: TuiLocale, width: number): string {
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

export function renderRunState(events: RealmEvent[], dict: ReturnType<typeof t>): string {
  const activeTurns = new Map<string, string>();
  for (const event of events) {
    if (event.type === "turn.started") {
      activeTurns.set(event.turn.id, event.turn.actorId);
    }
    if (
      event.type === "turn.completed" ||
      event.type === "turn.failed" ||
      event.type === "turn.cancelled"
    ) {
      activeTurns.delete(event.turn.id);
    }
  }
  const latest = [...activeTurns.entries()].at(-1);
  return latest ? dict.traceTurn("running", latest[1]) : dict.idle;
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

function divider(width: number): string {
  return "-".repeat(width);
}

function fit(value: string, maxWidth: number): string {
  return value.length > maxWidth ? `${value.slice(0, maxWidth - 1)}…` : value;
}

function normalizeWidth(width?: number): number {
  if (!width || !Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }
  return Math.max(MIN_WIDTH, Math.floor(width));
}
