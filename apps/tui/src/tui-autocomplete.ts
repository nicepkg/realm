import type { SlashCommand } from "@earendil-works/pi-tui";
import { type TuiLocale, t } from "./i18n.ts";
import type { TuiState } from "./types.ts";

export function buildTuiSlashCommands(state: TuiState, locale: TuiLocale = "en"): SlashCommand[] {
  const dict = t(locale);
  return [
    { name: "send", description: dict.slashSendDescription, argumentHint: "<message>" },
    {
      name: "as",
      description: dict.slashAsDescription,
      argumentHint: "<identity>",
      getArgumentCompletions: (prefix) => identityCompletions(state, prefix),
    },
    {
      name: "room",
      description: dict.slashRoomDescription,
      argumentHint: "<room-id>",
      getArgumentCompletions: (prefix) =>
        state.rooms
          .filter((room) => room.id.includes(prefix) || room.name.includes(prefix))
          .map((room) => ({ value: room.id, label: room.name, description: room.type })),
    },
    { name: "state", description: dict.slashStateDescription, argumentHint: "[json-pointer]" },
    {
      name: "memory",
      description: dict.slashMemoryDescription,
      argumentHint: "<role-id>",
      getArgumentCompletions: (prefix) => roleCompletions(state, prefix),
    },
    { name: "patch", description: dict.slashPatchDescription, argumentHint: "show|apply|reject" },
    { name: "assistant", description: dict.slashAssistantDescription, argumentHint: "<goal>" },
    { name: "settings", description: dict.slashSettingsDescription },
    { name: "drafts", description: dict.slashDraftsDescription },
    { name: "whereami", description: dict.slashWhereamiDescription },
    { name: "refresh", description: dict.slashRefreshDescription },
  ];
}

function identityCompletions(state: TuiState, prefix: string) {
  return [
    { value: "owner", label: "Boss", description: "owner" },
    ...roleCompletions(state, prefix),
  ].filter((item) => item.value.includes(prefix) || item.label.includes(prefix));
}

function roleCompletions(state: TuiState, prefix: string) {
  return state.roles
    .filter((role) => role.id.includes(prefix) || role.displayName.includes(prefix))
    .map((role) => ({
      value: role.id,
      label: role.displayName,
      description: role.model ?? "default",
    }));
}
