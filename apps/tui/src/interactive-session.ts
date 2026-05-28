import {
  Box,
  CombinedAutocompleteProvider,
  Container,
  Editor,
  Markdown,
  ProcessTerminal,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  TUI,
} from "@earendil-works/pi-tui";
import { renderTuiHelp } from "./commands.ts";
import { type TuiLocale, t } from "./i18n.ts";
import { isCtrlC, renderStatusLine } from "./interactive-helpers.ts";
import {
  buildCommandItems,
  buildRoleItems,
  buildRoomItems,
  buildWorldItems,
  type TuiPickerItem,
} from "./interactive-items.ts";
import { hideOverlayIfPresent, replaceOverlay } from "./interactive-overlays.ts";
import { resolveTuiKeybinding } from "./keybindings.ts";
import { buildTuiSlashCommands } from "./tui-autocomplete.ts";
import { editorTheme, markdownTheme, selectTheme, settingsTheme } from "./tui-themes.ts";
import type { TuiSettingsItem, TuiState } from "./types.ts";
import { clampScrollOffset, DEFAULT_TRANSCRIPT_WINDOW, renderTui } from "./view-model.ts";

const TRANSCRIPT_WINDOW = DEFAULT_TRANSCRIPT_WINDOW;

export type InteractiveSessionController = {
  applyPaletteItem: (value: string) => Promise<string>;
  /**
   * Clears any armed transient confirmation (role send, identity switch, God
   * action, role turn). Returns true when something was actually cleared so the
   * caller can decide whether to surface a footer notice.
   */
  clearTransient: () => boolean;
  handleInteractiveInput: (
    input: string,
    showHelp: () => void,
    showSettings: () => Promise<void>,
  ) => Promise<string | undefined>;
  load: () => Promise<TuiState>;
  loadSettingsItems: () => Promise<TuiSettingsItem[]>;
  locale: TuiLocale;
};

export async function runInteractiveSession(
  controller: InteractiveSessionController,
): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const root = new Container();
  const status = new Text("", 0, 0);
  const bodyBox = new Box(0, 0);
  const body = new Markdown("", 0, 0, markdownTheme());
  const footer = new Text("", 0, 0);
  const editor = new Editor(tui, editorTheme(), { paddingX: 1 });
  // Scrollback offset measured in messages from the newest. 0 keeps the latest
  // pinned to the bottom; PageUp increases it to reveal older history while
  // status/editor/footer stay on screen.
  let scrollOffset = 0;
  let lastMessageCount = 0;

  bodyBox.addChild(body);
  root.addChild(status);
  root.addChild(new Spacer(1));
  root.addChild(bodyBox);
  root.addChild(new Spacer(1));
  root.addChild(editor);
  root.addChild(footer);
  tui.addChild(root);
  tui.setFocus(editor);

  const render = async (notice?: string) => {
    const state = await controller.load();
    lastMessageCount = state.messages.length;
    scrollOffset = clampScrollOffset(lastMessageCount, TRANSCRIPT_WINDOW, scrollOffset);
    editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(
        buildTuiSlashCommands(state, controller.locale),
        process.cwd(),
      ),
    );
    status.setText(renderStatusLine(state, controller.locale));
    body.setText(renderTui(state, controller.locale, { scrollOffset }));
    footer.setText(notice ?? t(controller.locale).footer);
    tui.requestRender(true);
  };

  const scrollBy = (delta: number) => {
    const next = clampScrollOffset(lastMessageCount, TRANSCRIPT_WINDOW, scrollOffset + delta);
    if (next === scrollOffset) {
      return;
    }
    scrollOffset = next;
    void render();
  };

  const showHelp = () => {
    const help = new Markdown(renderTuiHelp(controller.locale), 1, 1, markdownTheme());
    replaceOverlay(tui, help, { anchor: "center", maxHeight: "70%", width: "70%" });
  };

  const showSettings = async () => {
    const list = new SettingsList(
      await controller.loadSettingsItems(),
      8,
      settingsTheme(),
      () => {},
      () => tui.hideOverlay(),
    );
    replaceOverlay(tui, list, { anchor: "center", maxHeight: "70%", width: "70%" });
  };

  const showGodConsole = async () => {
    const dict = t(controller.locale);
    const state = await controller.load();
    const roleLines =
      state.roles.length > 0
        ? state.roles.map((role) => `- ${role.id}: ${role.displayName}`).join("\n")
        : `- ${dict.noRolesLoaded}`;
    const consoleBody = dict.godConsoleBody(roleLines);
    const overlay = new Markdown(consoleBody, 1, 1, markdownTheme());
    replaceOverlay(tui, overlay, { anchor: "center", maxHeight: "70%", width: "70%" });
  };

  const showPicker = (items: TuiPickerItem[]) => {
    const list = new SelectList(items, 10, selectTheme());
    list.onCancel = () => tui.hideOverlay();
    list.onSelect = (item) => {
      tui.hideOverlay();
      void controller.applyPaletteItem(item.value).then((notice) => render(notice));
    };
    replaceOverlay(tui, list, { anchor: "center", maxHeight: "70%", width: "76%" });
  };

  const showCommandPalette = async () =>
    showPicker(buildCommandItems(await controller.load(), controller.locale));
  const showWorldPicker = async () =>
    showPicker(buildWorldItems(await controller.load(), controller.locale));
  const showRoomPicker = async () =>
    showPicker(buildRoomItems(await controller.load(), controller.locale));
  const showRolePicker = async () =>
    showPicker(buildRoleItems(await controller.load(), controller.locale));

  editor.onSubmit = (text) => {
    void controller
      .handleInteractiveInput(text, showHelp, showSettings)
      .then((notice) => render(notice));
  };

  const removeCtrlCListener = installCtrlCStop(tui, (notice) => {
    footer.setText(notice);
    tui.requestRender(true);
  });
  tui.addInputListener((data) => {
    const action = resolveTuiKeybinding(data, { editorHasText: editor.getText().length > 0 });
    if (!action) {
      return undefined;
    }
    if (action === "command-palette") {
      void showCommandPalette();
    } else if (action === "world-picker") {
      void showWorldPicker();
    } else if (action === "room-picker") {
      void showRoomPicker();
    } else if (action === "role-picker") {
      void showRolePicker();
    } else if (action === "god-console") {
      void showGodConsole();
    } else if (action === "help") {
      showHelp();
    } else if (action === "close-overlay") {
      hideOverlayIfPresent(tui);
      // Restore composer focus so the next keystroke types into the editor
      // (an overlay can capture focus; without this, input after closing an
      // overlay is silently dropped).
      tui.setFocus(editor);
      if (controller.clearTransient()) {
        // Re-render the footer back to the default hint so an aborted role-send
        // or God confirmation prompt no longer lingers in the status line.
        footer.setText(t(controller.locale).footer);
        tui.requestRender(true);
      }
    } else if (action === "scroll-older") {
      scrollBy(TRANSCRIPT_WINDOW);
    } else if (action === "scroll-newer") {
      scrollBy(-TRANSCRIPT_WINDOW);
    }
    return { consume: true };
  });

  await render();
  await new Promise<void>((resolve) => {
    const stop = tui.stop.bind(tui);
    tui.stop = () => {
      removeCtrlCListener();
      stop();
      resolve();
    };
    tui.start();
  });
}

function installCtrlCStop(tui: TUI, onFirstPress: (notice: string) => void): () => void {
  let firstPressAt = 0;
  const onRawInput = (chunk: Buffer | string) => {
    const data = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (!isCtrlC(data)) {
      return;
    }
    const now = Date.now();
    if (now - firstPressAt < 1500) {
      setTimeout(() => tui.stop(), 0);
      return;
    }
    firstPressAt = now;
    onFirstPress("Press Ctrl+C again to exit.");
  };
  process.stdin.on("data", onRawInput);
  return () => process.stdin.removeListener("data", onRawInput);
}
