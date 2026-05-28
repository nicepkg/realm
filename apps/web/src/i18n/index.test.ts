import { describe, expect, test } from "bun:test";
import { dictionaries, locales } from "./index.tsx";

describe("Web i18n", () => {
  test("keeps English and Chinese dictionaries aligned", () => {
    expect(locales).toEqual(["en", "zh-CN"]);
    expect(Object.keys(dictionaries["zh-CN"]).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  test("keeps visible labels populated in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(dictionaries[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  test("keeps interpolation placeholders aligned across locales", () => {
    for (const key of Object.keys(dictionaries.en) as Array<keyof typeof dictionaries.en>) {
      expect(placeholders(dictionaries["zh-CN"][key]), key).toEqual(
        placeholders(dictionaries.en[key]),
      );
    }
  });
});

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[a-zA-Z0-9_.-]+\}/g)].map(([match]) => match).sort();
}
