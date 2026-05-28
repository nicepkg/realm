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
  | "scroll-older"
  | "scroll-newer"
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
  { action: "scroll-older", key: "pageUp" },
  { action: "scroll-newer", key: "pageDown" },
  { action: "exit", key: "ctrl+c" },
] as const satisfies readonly TuiKeybinding[];

export type ResolveKeybindingContext = {
  /**
   * Whether the composer currently holds text. When the editor is focused and
   * non-empty, a bare "?" must reach the editor so the user can type a literal
   * question mark instead of opening help.
   */
  editorHasText?: boolean;
};

export function resolveTuiKeybinding(
  data: string,
  context: ResolveKeybindingContext = {},
): TuiKeybindingAction | undefined {
  if (data === "?") {
    // Only hijack a bare "?" as help when the composer is empty. With text in
    // the composer, forward to the editor so the character is typed.
    return context.editorHasText ? undefined : "help";
  }
  if (isCtrlC(data)) {
    return "exit";
  }
  return TUI_KEYBINDINGS.find((binding) => matchesKey(data, binding.key))?.action;
}
