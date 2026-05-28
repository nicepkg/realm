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

  test("keeps interpolation function arity aligned across locales", () => {
    for (const key of Object.keys(tuiDictionaries.en) as Array<keyof typeof tuiDictionaries.en>) {
      const enValue = tuiDictionaries.en[key];
      const zhValue = tuiDictionaries["zh-CN"][key];
      expect(typeof zhValue, key).toBe(typeof enValue);
      if (typeof enValue === "function" && typeof zhValue === "function") {
        expect(zhValue.length, key).toBe(enValue.length);
      }
    }
  });
});
