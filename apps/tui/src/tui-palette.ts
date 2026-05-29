import type { TuiDictionary } from "./i18n.ts";

/**
 * Resolves a command-palette selection to a notice. Extracted from
 * {@link RealmTuiApp} (which must stay under the file-size budget). The app
 * passes its dictionary plus the bound navigation handlers; God is intentionally
 * a no-op selection here because God actions go through the protected `:god`
 * command, never a casual palette pick.
 */
export type PaletteHandlers = {
  readonly dictionary: TuiDictionary;
  loadSettingsSummary(): Promise<void>;
  whereami(): Promise<string>;
  switchWorld(worldId: string): Promise<string>;
  switchRoom(roomId: string): Promise<string>;
  requestIdentitySwitch(identity: string): Promise<string>;
};

export async function applyTuiPaletteItem(
  handlers: PaletteHandlers,
  value: string,
): Promise<string> {
  if (value === "settings") {
    await handlers.loadSettingsSummary();
    return handlers.dictionary.settingsSummaryLoaded;
  }
  if (value === "whereami") {
    return handlers.whereami();
  }
  if (value === "god") {
    return handlers.dictionary.godConsoleOpened;
  }
  if (value.startsWith("world:")) {
    return handlers.switchWorld(value.slice("world:".length));
  }
  if (value.startsWith("room:")) {
    return handlers.switchRoom(value.slice("room:".length));
  }
  if (value.startsWith("role:")) {
    return handlers.requestIdentitySwitch(value.slice("role:".length));
  }
  return handlers.dictionary.commandIgnored;
}
