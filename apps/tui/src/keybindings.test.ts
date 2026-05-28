import { describe, expect, test } from "bun:test";
import { resolveTuiKeybinding, TUI_KEYBINDINGS } from "./keybindings.ts";

describe("TUI keybindings", () => {
  test("keeps the documented keybinding contract explicit", () => {
    expect(TUI_KEYBINDINGS).toEqual([
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
    ]);
  });

  test("maps raw terminal input to keybinding actions", () => {
    expect(resolveTuiKeybinding("\u000b")).toBe("command-palette");
    expect(resolveTuiKeybinding("\u0017")).toBe("world-picker");
    expect(resolveTuiKeybinding("\u000c")).toBe("room-picker");
    expect(resolveTuiKeybinding("\u0012")).toBe("role-picker");
    expect(resolveTuiKeybinding("\u0007")).toBe("god-console");
    expect(resolveTuiKeybinding("?")).toBe("help");
    expect(resolveTuiKeybinding("\u001b")).toBe("close-overlay");
    expect(resolveTuiKeybinding("\u0003")).toBe("exit");
    expect(resolveTuiKeybinding("x")).toBeUndefined();
  });

  test("maps PageUp/PageDown to scrollback actions", () => {
    expect(resolveTuiKeybinding("[5~")).toBe("scroll-older");
    expect(resolveTuiKeybinding("[6~")).toBe("scroll-newer");
  });

  test("forwards a bare ? to the editor when the composer holds text", () => {
    // Empty composer: ? opens help. Non-empty: ? must reach the editor.
    expect(resolveTuiKeybinding("?", { editorHasText: false })).toBe("help");
    expect(resolveTuiKeybinding("?", { editorHasText: true })).toBeUndefined();
  });
});
