import { describe, expect, test } from "bun:test";
import { resolveTuiLocale, t, tuiDictionaries, tuiLocales } from "./i18n.ts";

describe("TUI i18n", () => {
  test("keeps English and Chinese dictionaries aligned", () => {
    expect(tuiLocales).toEqual(["en", "zh-CN"]);
    expect(Object.keys(tuiDictionaries["zh-CN"]).sort()).toEqual(
      Object.keys(tuiDictionaries.en).sort(),
    );
  });

  test("resolves locale flags and browser-style language ids", () => {
    expect(resolveTuiLocale("zh-CN")).toBe("zh-CN");
    expect(resolveTuiLocale("zh-Hans")).toBe("zh-CN");
    expect(resolveTuiLocale("en")).toBe("en");
    expect(t("zh-CN").messageSent).toContain("消息");
  });
});
