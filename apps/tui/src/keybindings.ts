import { matchesKey } from "@earendil-works/pi-tui";
import { isCtrlC } from "./interactive-helpers.ts";

export type TuiKeybindingAction =
  | "command-palette"
  | "world-picker"
  | "room-picker"
  | "role-picker"
  | "god-console"
  | "help"
  | "close-overlay"
  | "exit";

export type TuiKeybinding = {
  action: TuiKeybindingAction;
  key: string;
};

export const TUI_KEYBINDINGS = [
  { action: "command-palette", key: "ctrl+k" },
  { action: "world-picker", key: "ctrl+w" },
  { action: "room-picker", key: "ctrl+l" },
  { action: "role-picker", key: "ctrl+r" },
  { action: "god-console", key: "ctrl+g" },
  { action: "help", key: "?" },
  { action: "close-overlay", key: "escape" },
  { action: "exit", key: "ctrl+c" },
] as const satisfies readonly TuiKeybinding[];

export function resolveTuiKeybinding(data: string): TuiKeybindingAction | undefined {
  if (data === "?") {
    return "help";
  }
  if (isCtrlC(data)) {
    return "exit";
  }
  return TUI_KEYBINDINGS.find((binding) => matchesKey(data, binding.key))?.action;
}
