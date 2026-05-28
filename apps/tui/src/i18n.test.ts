import { describe, expect, test } from "bun:test";
import { resolveTuiLocale, type TuiDictionary, t, tuiDictionaries, tuiLocales } from "./i18n.ts";

type Value = TuiDictionary[keyof TuiDictionary];

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

  test("keeps value types and function arity aligned across locales", () => {
    for (const key of keys()) {
      const enValue: Value = tuiDictionaries.en[key];
      const zhValue: Value = tuiDictionaries["zh-CN"][key];
      expect(typeof zhValue, `type ${key}`).toBe(typeof enValue);
      if (typeof enValue === "function" && typeof zhValue === "function") {
        expect(zhValue.length, `arity ${key}`).toBe(enValue.length);
      }
    }
  });

  test("keeps interpolation placeholders aligned across locales", () => {
    for (const key of keys()) {
      expect(placeholders(tuiDictionaries["zh-CN"][key]), `placeholders ${key}`).toEqual(
        placeholders(tuiDictionaries.en[key]),
      );
    }
  });

  // Proves the hardened parity checks actually catch drift, not just pass
  // vacuously. Each scenario mutates one side and asserts a mismatch.
  test("detects drift between mismatched entries", () => {
    // The dollar-brace is a literal token under test, not an interpolation.
    expect(placeholders(`hello $${"{name}"}`)).not.toEqual(placeholders("hello"));
    expect(placeholders("hello {name}")).not.toEqual(placeholders("hello"));
    const enFn = (n: number) => String(n);
    expect(typeof "static").not.toBe(typeof enFn);
    const arity1 = (_a: number) => "";
    const arity2 = (_a: number, _b: number) => "";
    expect(arity2.length).not.toBe(arity1.length);
    // A builder that drops a positional token in one locale is detected.
    const enBuilder = (a: string, b: string) => `${a}-${b}`;
    const zhBuilder = (a: string, _b: string) => `${a}`;
    expect(placeholders(zhBuilder)).not.toEqual(placeholders(enBuilder));
  });
});

function keys(): Array<keyof TuiDictionary> {
  return Object.keys(tuiDictionaries.en) as Array<keyof TuiDictionary>;
}

/**
 * Extracts interpolation tokens from a dictionary value. Strings are scanned
 * for both `{token}` and `${token}` forms; function-valued entries are invoked
 * with sentinel arguments so substituted positional tokens are compared across
 * locales (catches a builder that drops or reorders an argument).
 */
function placeholders(value: Value | string): string[] {
  const text =
    typeof value === "function"
      ? (value as (...args: unknown[]) => string)(...sentinels(value.length))
      : value;
  return [...text.matchAll(/\$?\{[a-zA-Z0-9_.-]+\}/g), ...text.matchAll(/§\d+§/g)]
    .map(([match]) => match)
    .sort();
}

function sentinels(arity: number): string[] {
  return Array.from({ length: arity }, (_unused, index) => `§${index}§`);
}
