import { type TuiLocale, t } from "./i18n.ts";
import type { TuiState } from "./types.ts";

export type TuiPickerItem = {
  description: string;
  label: string;
  value: string;
};

export function buildCommandItems(state: TuiState, locale: TuiLocale = "en"): TuiPickerItem[] {
  const dict = t(locale);
  return [
    ...buildWorldItems(state, locale),
    ...buildRoomItems(state, locale),
    ...buildRoleItems(state, locale),
    {
      description: dict.pickerSettingsDescription,
      label: dict.pickerSettingsLabel,
      value: "settings",
    },
    { description: dict.pickerGodDescription, label: dict.pickerGodLabel, value: "god" },
    {
      description: dict.pickerWhereamiDescription,
      label: dict.pickerWhereamiLabel,
      value: "whereami",
    },
  ];
}

export function buildWorldItems(state: TuiState, locale: TuiLocale = "en"): TuiPickerItem[] {
  const dict = t(locale);
  return state.worlds.map((world) => ({
    description: dict.pickerWorldDescription(world.mode.type),
    label: dict.pickerWorldLabel(world.name),
    value: `world:${world.id}`,
  }));
}

export function buildRoomItems(state: TuiState, locale: TuiLocale = "en"): TuiPickerItem[] {
  const dict = t(locale);
  return state.rooms.map((room) => ({
    description: dict.pickerRoomDescription(room.type),
    label: dict.pickerRoomLabel(room.name),
    value: `room:${room.id}`,
  }));
}

export function buildRoleItems(state: TuiState, locale: TuiLocale = "en"): TuiPickerItem[] {
  const dict = t(locale);
  return state.roles.map((role) => ({
    description: dict.pickerRoleDescription(role.model ?? dict.defaultValue),
    label: dict.pickerRoleLabel(role.displayName),
    value: `role:${role.id}`,
  }));
}
