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

describe("isInterrogative — imperative '说点什么' is NOT a question (run-turn must fire)", () => {
  const imperativeSpeak = [
    "让顾辰风在全员议事说点什么",
    "顾辰风说点什么",
    "让云遥说些什么",
    "做点什么吧",
    "聊点什么",
    "讲两句什么",
    "来几句什么",
    "说什么",
  ];
  for (const goal of imperativeSpeak) {
    test(`'${goal}' is an imperative directive, not interrogative`, () => {
      expect(isInterrogative(goal)).toBe(false);
    });
  }
});

describe("isInterrogative — genuine 什么 wh-questions still read (NO regression)", () => {
  const whQuestions = [
    "现在世界什么状态？",
    "现在世界什么状态",
    "他是什么状态",
    "顾辰风的状态设为什么了",
    "雷军知道什么",
    "这是什么",
  ];
  for (const goal of whQuestions) {
    test(`'${goal}' is a wh-question`, () => {
      expect(isInterrogative(goal)).toBe(true);
    });
  }

  test("mixed: imperative-speak + a real wh-question still reads as interrogative", () => {
    // The trailing "现在是什么状态" is a genuine wh-question even after the
    // imperative "说点什么" is stripped.
    expect(isInterrogative("先说点什么，现在是什么状态")).toBe(true);
  });

  test("'顾辰风被禁言了吗？' stays interrogative (clause-final 吗 + ？)", () => {
    expect(isInterrogative("顾辰风被禁言了吗？")).toBe(true);
  });
});
