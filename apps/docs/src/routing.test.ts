import { afterEach, describe, expect, test } from "bun:test";
import { LOCALE_STORAGE_KEY, pathForLocale, resolveInitialRoute, resolveRoute } from "./routing.ts";

type WindowStub = {
  location: { pathname: string };
  localStorage: Storage;
  navigator: { language: string };
};

/** Install a minimal `window` mirroring just what routing.ts reads. */
function installWindowStub(options: { pathname: string; language: string; stored?: string }): {
  teardown: () => void;
} {
  const data = new Map<string, string>();
  if (options.stored !== undefined) {
    data.set(LOCALE_STORAGE_KEY, options.stored);
  }
  const localStorage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
  const stub: WindowStub = {
    localStorage,
    location: { pathname: options.pathname },
    navigator: { language: options.language },
  };
  (globalThis as { window?: WindowStub }).window = stub;
  return {
    teardown: () => {
      delete (globalThis as { window?: WindowStub }).window;
    },
  };
}

describe("docs Chinese-first locale resolution", () => {
  let win: { teardown: () => void } | undefined;

  afterEach(() => {
    win?.teardown();
    win = undefined;
  });

  test("bare root honors a Chinese navigator instead of the hardcoded English default", () => {
    win = installWindowStub({ language: "zh-CN", pathname: "/" });
    expect(resolveInitialRoute()).toEqual({ locale: "zh-CN" });
  });

  test("bare root prefers a stored locale over navigator.language", () => {
    win = installWindowStub({ language: "zh-CN", pathname: "/", stored: "en" });
    expect(resolveInitialRoute()).toEqual({ locale: "en" });
  });

  test("bare root falls back to English for a non-Chinese navigator with no stored preference", () => {
    win = installWindowStub({ language: "en-US", pathname: "/" });
    expect(resolveInitialRoute()).toEqual({ locale: "en" });
  });

  test("explicit /en deep link stays English regardless of a Chinese navigator", () => {
    win = installWindowStub({ language: "zh-CN", pathname: "/en", stored: "zh-CN" });
    expect(resolveInitialRoute()).toEqual({ locale: "en", topic: undefined });
  });

  test("explicit /zh-CN deep link with a topic is preserved", () => {
    win = installWindowStub({ language: "en-US", pathname: "/zh-CN/concepts" });
    expect(resolveInitialRoute()).toEqual({ locale: "zh-CN", topic: "concepts" });
  });
});

describe("explicit-path routing is unchanged", () => {
  test("resolveRoute still maps the bare root to English for deep-link callers", () => {
    expect(resolveRoute("/")).toEqual({ locale: "en" });
  });

  test("resolveRoute maps explicit locale paths and topics", () => {
    expect(resolveRoute("/en")).toEqual({ locale: "en", topic: undefined });
    expect(resolveRoute("/zh-CN/quick-start")).toEqual({ locale: "zh-CN", topic: "quick-start" });
  });

  test("resolveRoute returns undefined for unknown first segments", () => {
    expect(resolveRoute("/about")).toBeUndefined();
  });

  test("pathForLocale keeps the English root bare and prefixes Chinese", () => {
    expect(pathForLocale("en")).toBe("/");
    expect(pathForLocale("zh-CN")).toBe("/zh-CN");
    expect(pathForLocale("en", "concepts")).toBe("/en/concepts");
  });
});
