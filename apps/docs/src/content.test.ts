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
    expect(pages["zh-CN"].quickStart.steps).toHaveLength(pages.en.quickStart.steps.length);
    expect(pages["zh-CN"].concepts.nodes).toHaveLength(pages.en.concepts.nodes.length);
  });

  test("supports only shareable en and zh-CN locales", () => {
    expect(locales).toEqual(["en", "zh-CN"]);
    expect(Object.keys(pages).sort()).toEqual(["en", "zh-CN"]);
  });
});
