import { describe, expect, test } from "bun:test";
import { pages } from "./content.ts";

describe("docs content", () => {
  test("keeps English and Chinese section ids aligned", () => {
    expect(pages.zh.sections.map((section) => section.id)).toEqual(
      pages.en.sections.map((section) => section.id),
    );
  });

  test("documents install, governance, and deployment paths", () => {
    for (const page of Object.values(pages)) {
      const ids = new Set(page.sections.map((section) => section.id));
      expect(ids.has("install")).toBe(true);
      expect(ids.has("governance")).toBe(true);
      expect(ids.has("deployment")).toBe(true);
      expect(page.sections.length).toBeGreaterThanOrEqual(8);
    }
  });
});
