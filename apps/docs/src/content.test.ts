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

  test("ships the 6 core NL flows with the captured-shot ids aligned across locales", () => {
    const expectedShots = [
      "create-world",
      "set-rule",
      "add-role",
      "run-turn",
      "god-action",
      "state-inspect",
    ];
    for (const page of Object.values(pages)) {
      const showcase = page.flowShowcase;
      expect(showcase.eyebrow.length).toBeGreaterThan(0);
      expect(showcase.title.length).toBeGreaterThan(0);
      expect(showcase.intro.length).toBeGreaterThan(0);
      expect(showcase.shotCaption.length).toBeGreaterThan(0);
      expect(showcase.steps.map((step) => step.shot)).toEqual(expectedShots);
      for (const step of showcase.steps) {
        expect(step.label.length).toBeGreaterThan(0);
        expect(step.utterance.length).toBeGreaterThan(0);
        expect(step.outcome.length).toBeGreaterThan(0);
      }
    }
    // The zh-CN utterances are the tested path and must mirror the live capture.
    const zhUtterances = pages["zh-CN"].flowShowcase.steps.map((step) => step.utterance);
    expect(zhUtterances).toContain("创建一个有宗门、对手和师父的修真世界");
    expect(zhUtterances).toContain("现在让顾辰风说话");
    expect(zhUtterances).toContain("现在世界什么状态？");
    // Both locales quote the SAME Chinese utterance the operator types into the
    // chat window — the docs must not invent an English command that does not run.
    expect(pages.en.flowShowcase.steps.map((step) => step.utterance)).toEqual(zhUtterances);
  });

  test("ships an honest capability/limits block in both locales", () => {
    for (const page of Object.values(pages)) {
      const caps = page.capabilities;
      expect(caps.title.length).toBeGreaterThan(0);
      expect(caps.intro.length).toBeGreaterThan(0);
      expect(caps.worksTitle.length).toBeGreaterThan(0);
      expect(caps.limitsTitle.length).toBeGreaterThan(0);
      expect(caps.works.length).toBeGreaterThanOrEqual(3);
      expect(caps.limits.length).toBeGreaterThanOrEqual(3);
      for (const item of [...caps.works, ...caps.limits]) {
        expect(item.length).toBeGreaterThan(0);
      }
    }
    // The works/limits counts stay aligned across locales (parallel translation).
    expect(pages["zh-CN"].capabilities.works).toHaveLength(pages.en.capabilities.works.length);
    expect(pages["zh-CN"].capabilities.limits).toHaveLength(pages.en.capabilities.limits.length);
  });

  test("grounds the Examples list to real shipped artifacts in both locales", () => {
    for (const page of Object.values(pages)) {
      const examples = page.examples;
      expect(examples.title.length).toBeGreaterThan(0);
      expect(examples.intro.length).toBeGreaterThan(0);
      // Three real artifacts: cultivation-sim, boardroom-saga, software-company template.
      expect(examples.items).toHaveLength(3);
      for (const item of examples.items) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.value.length).toBeGreaterThan(0);
      }
      const blob = examples.items.map((item) => `${item.label} ${item.value}`).join("\n");
      // The real, end-to-end-verified boardroom-saga example must be surfaced.
      expect(blob).toContain("examples/boardroom-saga");
      // The existing cultivation example dir must stay listed.
      expect(blob).toContain("examples/cultivation-sim");
      // Software company is a real init template, framed as such (not a phantom dir).
      expect(blob).toContain("software-company");
      // The retired aspirational entry with no backing example dir is gone.
      expect(blob).not.toContain("Investment council");
      expect(blob).not.toContain("投资委员会");
    }
    // zh-CN keeps the 商战 framing; en keeps the bilingual Boardroom saga label.
    expect(pages["zh-CN"].examples.items.some((item) => item.label.includes("商战推演"))).toBe(
      true,
    );
    expect(pages.en.examples.items.some((item) => /Boardroom saga/i.test(item.label))).toBe(true);
    // The Examples item count stays aligned across locales.
    expect(pages["zh-CN"].examples.items).toHaveLength(pages.en.examples.items.length);
  });

  test("keeps zh-CN showcase + capabilities prose free of leaked English sentences", () => {
    // Whitelisted tokens that legitimately stay Latin even in zh-CN copy: real
    // file/runtime/identifier names, provider brands, and CLI artifacts.
    const allowed = [
      "天道",
      "fake",
      "OpenAI",
      "Gemini",
      "SDK",
      "client",
      "TUI",
      "Web",
      "key",
      "401",
      "skill",
      "SKILL.md",
      "provider",
      "rules.yaml",
      "schema",
      "scripts/capture-docs-shots.ts",
      "examples/cultivation-sim",
      "demo",
    ];
    const zh = pages["zh-CN"];
    const prose = [
      zh.flowShowcase.eyebrow,
      zh.flowShowcase.title,
      zh.flowShowcase.intro,
      zh.flowShowcase.shotCaption,
      ...zh.flowShowcase.steps.flatMap((step) => [step.label, step.outcome]),
      zh.capabilities.title,
      zh.capabilities.intro,
      zh.capabilities.worksTitle,
      zh.capabilities.limitsTitle,
      ...zh.capabilities.works,
      ...zh.capabilities.limits,
    ].join("\n");
    // Strip whitelisted tokens, then assert no remaining run of >=3 ASCII letters
    // survives — that would be an untranslated English word leaking into zh copy.
    let stripped = prose;
    for (const token of allowed) {
      stripped = stripped.split(token).join(" ");
    }
    const leaked = stripped.match(/[A-Za-z]{3,}/g) ?? [];
    expect(leaked).toEqual([]);
  });
});
