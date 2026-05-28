import { matchesKey } from "@earendil-works/pi-tui";
import { type TuiLocale, t } from "./i18n.ts";
import type { TuiState } from "./types.ts";

export function renderStatusLine(state: TuiState, locale: TuiLocale = "en"): string {
  const dict = t(locale);
  const world = state.world?.id ?? dict.noWorld;
  const room = state.room?.id ?? dict.noRoom;
  return `Realm | ${state.projectName} | ${dict.world}:${world} | ${dict.room}:${room} | ${dict.speaking}:${state.identity}`;
}

export function renderWhereami(state: TuiState, locale: TuiLocale = "en"): string {
  const dict = t(locale);
  return [
    `${dict.project}: ${state.projectName}`,
    `${dict.world}: ${state.world?.name ?? dict.noValue}`,
    `${dict.room}: ${state.room?.name ?? dict.noValue}`,
    `${dict.speaking}: ${state.identity}`,
    `${dict.visibleRoles}: ${state.roles.map((role) => role.id).join(", ") || dict.noValue}`,
  ].join(" · ");
}

export function slashToCommand(input: string): string {
  const [head, ...tail] = input.slice(1).split(/\s+/);
  const rest = tail.join(" ").trim();
  if (head === "room" && rest) {
    return `:room ${rest}`;
  }
  if ((head === "as" || head === "id") && rest) {
    return `:id ${rest}`;
  }
  if (head === "assistant" && rest) {
    return `:assistant ${rest}`;
  }
  if (head === "state") {
    return rest ? `:state ${rest}` : ":state";
  }
  if (head === "memory" && rest) {
    return `:memory ${rest}`;
  }
  if (head === "patch") {
    return rest ? `:patch ${rest}` : ":patch";
  }
  if (head === "send" && rest) {
    return `:send ${rest}`;
  }
  if (head === "refresh") {
    return ":refresh";
  }
  if (head === "drafts") {
    return ":drafts";
  }
  return input;
}

export function isCtrlC(data: string): boolean {
  return (
    matchesKey(data, "ctrl+c") || data === "\x03" || data.includes("\x03") || data.includes("[99;5")
  );
}
