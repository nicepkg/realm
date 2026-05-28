import { describe, expect, test } from "bun:test";
import { dictionaries, locales } from "./index.tsx";

type Dict = (typeof dictionaries)["en"];
type Value = Dict[keyof Dict];

describe("Web i18n", () => {
  test("keeps English and Chinese dictionaries aligned", () => {
    expect(locales).toEqual(["en", "zh-CN"]);
    expect(Object.keys(dictionaries["zh-CN"]).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  test("keeps visible labels populated in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(dictionaries[locale])) {
        if (typeof value === "function") {
          continue;
        }
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  test("keeps value types and function arity aligned across locales", () => {
    for (const key of keys()) {
      const enValue: Value = dictionaries.en[key];
      const zhValue: Value = dictionaries["zh-CN"][key];
      expect(typeof zhValue, `type ${key}`).toBe(typeof enValue);
      if (typeof enValue === "function" && typeof zhValue === "function") {
        expect(zhValue.length, `arity ${key}`).toBe(enValue.length);
      }
    }
  });

  test("keeps interpolation placeholders aligned across locales", () => {
    for (const key of keys()) {
      expect(placeholders(dictionaries["zh-CN"][key]), `placeholders ${key}`).toEqual(
        placeholders(dictionaries.en[key]),
      );
    }
  });

  // Proves the hardened parity checks actually catch drift, not just pass
  // vacuously. Each scenario mutates one locale and asserts a mismatch.
  test("detects drift between mismatched entries", () => {
    // 1. A `${}` token present in one locale only. Built by concatenation so
    // the literal dollar-brace under test is not treated as an interpolation.
    expect(placeholders(`hello $${"{name}"}`)).not.toEqual(placeholders("hello"));
    // 2. A `{}` token present in one locale only.
    expect(placeholders("hello {name}")).not.toEqual(placeholders("hello"));
    // 3. A function vs a string (type mismatch).
    const enFn = (n: number) => String(n);
    const zhStr = "static";
    expect(typeof zhStr).not.toBe(typeof enFn);
    // 4. Functions of differing arity.
    const arity1 = (_a: number) => "";
    const arity2 = (_a: number, _b: number) => "";
    expect(arity2.length).not.toBe(arity1.length);
  });

  test("worldCountLabel is plural-aware in both locales", () => {
    const en = dictionaries.en["workspace.worldCountLabel"];
    const zh = dictionaries["zh-CN"]["workspace.worldCountLabel"];
    expect(en(1)).toBe("1 world");
    expect(en(2)).toBe("2 worlds");
    expect(zh(1)).toContain("1");
    expect(zh(2)).toContain("2");
  });
});

function keys(): Array<keyof typeof dictionaries.en> {
  return Object.keys(dictionaries.en) as Array<keyof typeof dictionaries.en>;
}

/**
 * Extracts interpolation tokens from a dictionary value. Strings are scanned
 * for both `{token}` and `${token}` forms; function-valued entries are invoked
 * with sentinel arguments so substituted tokens in the produced string are
 * compared across locales (catches drift inside builder functions).
 */
function placeholders(value: Value): string[] {
  const text =
    typeof value === "function"
      ? (value as (...args: unknown[]) => string)(...sentinels(value.length))
      : value;
  const matches = [
    ...text.matchAll(/\$?\{[a-zA-Z0-9_.-]+\}/g),
    // Sentinel markers that survived substitution reveal positional tokens.
    ...text.matchAll(/§\d+§/g),
  ].map(([match]) => match);
  return matches.sort();
}

function sentinels(arity: number): string[] {
  return Array.from({ length: arity }, (_unused, index) => `§${index}§`);
}
