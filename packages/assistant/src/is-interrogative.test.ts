import { describe, expect, test } from "bun:test";
import { isInterrogative } from "./is-interrogative.ts";

describe("isInterrogative — A-not-A / yes-no questions", () => {
  test("'是不是' lead-in marks a yes-no question even ending in 了 (no 吗)", () => {
    expect(isInterrogative("顾辰风现在是不是被禁言了")).toBe(true);
  });

  test("'他是不是受伤了' is a question", () => {
    expect(isInterrogative("他是不是受伤了")).toBe(true);
  });

  test("'能不能行' — V-not-V is a question", () => {
    expect(isInterrogative("能不能行")).toBe(true);
  });

  test("'对不对' — A-not-A is a question", () => {
    expect(isInterrogative("对不对")).toBe(true);
  });
});

describe("isInterrogative — imperatives are NOT questions (write must stay)", () => {
  test("'把顾辰风禁言' is imperative, not a question", () => {
    expect(isInterrogative("把顾辰风禁言")).toBe(false);
  });

  test("'禁言他' is imperative, not a question", () => {
    expect(isInterrogative("禁言他")).toBe(false);
  });

  test("'让顾辰风说话' is imperative, not a question", () => {
    expect(isInterrogative("让顾辰风说话")).toBe(false);
  });
});

describe("isInterrogative — A-not-A guard does not over-match", () => {
  test("'不死不休的战斗' — different chars around 不, NOT a question", () => {
    expect(isInterrogative("不死不休的战斗")).toBe(false);
  });
});
