import { describe, expect, test } from "bun:test";
import { locales, pages } from "./content.ts";

describe("docs content", () => {
  test("keeps English and Chinese section ids aligned", () => {
    expect(pages["zh-CN"].sections.map((section) => section.id)).toEqual(
      pages.en.sections.map((section) => section.id),
    );
  });

  test("documents the required product docs topics", () => {
    for (const page of Object.values(pages)) {
      const ids = new Set(page.sections.map((section) => section.id));
      const navIds = new Set(page.nav.map((item) => item.value));
      expect(ids.has("release-install")).toBe(true);
      expect(ids.has("contributing")).toBe(true);
      expect(ids.has("web-ui")).toBe(true);
      expect(ids.has("tui")).toBe(true);
      expect(ids.has("configuration")).toBe(true);
      expect(ids.has("pi-integration")).toBe(true);
      expect(ids.has("identity-safety")).toBe(true);
      expect(ids.has("api-sdk")).toBe(true);
      expect(navIds.has("release-install")).toBe(true);
      expect(navIds.has("templates")).toBe(true);
      expect(navIds.has("github")).toBe(false);
      expect(page.sections.length).toBeGreaterThanOrEqual(8);
    }
  });

  test("keeps locale placeholders and preview strings aligned", () => {
    expect(pages["zh-CN"].nav.map((item) => item.value)).toEqual(
      pages.en.nav.map((item) => item.value),
    );
    expect(Object.keys(pages["zh-CN"].preview).sort()).toEqual(
      Object.keys(pages.en.preview).sort(),
    );
    expect(pages["zh-CN"].preview.suggestions).toHaveLength(pages.en.preview.suggestions.length);
    expect(pages["zh-CN"].quickStart.steps).toHaveLength(pages.en.quickStart.steps.length);
    expect(pages["zh-CN"].concepts.nodes).toHaveLength(pages.en.concepts.nodes.length);
    expect(pages["zh-CN"].valueProps).toHaveLength(pages.en.valueProps.length);
  });

  test("ships an NL-first chat preview, not a WeChat messenger collage", () => {
    for (const page of Object.values(pages)) {
      const preview = page.preview;
      expect(preview.emptyPrompt.length).toBeGreaterThan(0);
      expect(preview.suggestions.length).toBeGreaterThanOrEqual(2);
      expect(preview.suggestions.length).toBeLessThanOrEqual(3);
      for (const chip of preview.suggestions) {
        expect(chip.length).toBeGreaterThan(0);
      }
      expect(preview.userMessage.length).toBeGreaterThan(0);
      expect(preview.assistantReply.length).toBeGreaterThan(0);
      expect(preview.confirmTitle.length).toBeGreaterThan(0);
      expect(preview.confirmSummary.length).toBeGreaterThan(0);
      expect(preview.confirmAction.length).toBeGreaterThan(0);
      expect(preview.composer.length).toBeGreaterThan(0);
      // The old WeChat-messenger preview keys must be gone.
      const keys = Object.keys(preview);
      for (const stale of ["managerTitle", "managerAction", "worldMeta", "incomingAuthor"]) {
        expect(keys).not.toContain(stale);
      }
    }
  });

  test("sells the TUI as conversational, with no stale command-syntax copy", () => {
    const staleCommandLiterals = [":world", ":create-room", ":run-role", ":god", "Ctrl+K"];
    for (const page of Object.values(pages)) {
      const tui = page.tui;
      // The preview is now plain-language operation, not a readline command log.
      expect(tui.lines.length).toBeGreaterThanOrEqual(4);
      const previewBlob = tui.lines.join("\n");
      for (const stale of staleCommandLiterals) {
        expect(previewBlob).not.toContain(stale);
      }
      // The Ctrl+G God Console / typed-confirmation safety gate is still mentioned.
      expect(previewBlob).toContain("Ctrl+G");

      // The conversational framing carries into the title/intro and the doc card.
      expect(tui.intro.length).toBeGreaterThan(0);
      const tuiSection = page.sections.find((section) => section.id === "tui");
      expect(tuiSection).toBeDefined();
      const sectionBlob = [
        tuiSection?.title ?? "",
        tuiSection?.body ?? "",
        ...(tuiSection?.bullets ?? []),
        tuiSection?.code ?? "",
      ].join("\n");
      // The optional colon-command fast path may be referenced in prose, but the
      // old standalone command-log lines must be gone from the preview.
      for (const stale of [":world", ":create-room", ":god mute"]) {
        expect(sectionBlob).not.toContain(stale);
      }
    }

    // Locale-specific plain-language examples that replace the old command lines.
    expect(pages.en.tui.lines.some((line) => /cultivation world/i.test(line))).toBe(true);
    expect(pages.en.tui.lines.some((line) => /world state/i.test(line))).toBe(true);
    expect(pages["zh-CN"].tui.lines.some((line) => line.includes("创建一个有宗门的修真世界"))).toBe(
      true,
    );
    expect(pages["zh-CN"].tui.lines.some((line) => line.includes("让顾辰风发言一回合"))).toBe(true);
    expect(pages["zh-CN"].tui.lines.some((line) => line.includes("现在世界什么状态"))).toBe(true);
  });

  test("ships user-facing value props in both locales", () => {
    for (const page of Object.values(pages)) {
      expect(page.valueProps.length).toBe(4);
      for (const prop of page.valueProps) {
        expect(prop.label.length).toBeGreaterThan(0);
        expect(prop.value.length).toBeGreaterThan(0);
      }
      expect(page.menuLabel.length).toBeGreaterThan(0);
    }
  });

  test("supports only shareable en and zh-CN locales", () => {
    expect(locales).toEqual(["en", "zh-CN"]);
    expect(Object.keys(pages).sort()).toEqual(["en", "zh-CN"]);
  });
});
