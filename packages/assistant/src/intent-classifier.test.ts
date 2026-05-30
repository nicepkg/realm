import { describe, expect, test } from "bun:test";
import {
  classifyIntent,
  declaresWorldRule,
  extractWorldRuleBody,
  stripRuleMarkerPrefix,
} from "./intent-classifier.ts";
import type { IntentRouterContext } from "./intent-types.ts";

const CONTEXT: IntentRouterContext = {
  roles: [
    { id: "gu-chenfeng", displayName: "顾辰风" },
    { id: "leijun", displayName: "雷军" },
    { id: "yunyao", displayName: "云遥" },
  ],
  rooms: [{ id: "main" }, { id: "sect-hall" }],
  worlds: [
    { id: "cultivation", name: "云岭修仙界" },
    { id: "cyber", name: "赛博江湖" },
  ],
  worldId: "cultivation",
  defaultRoomId: "main",
};

describe("buildStateOperation — privateState container", () => {
  test("condition write lands under /privateState/roles/<id>/conditions", () => {
    const intent = classifyIntent("让雷军加上断了一根肋骨", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.worldId).toBe("cultivation");
    expect(intent.operations).toEqual([
      {
        op: "append",
        path: "/privateState/roles/leijun/conditions",
        value: "让雷军加上断了一根肋骨",
      },
    ]);
  });

  test("named-role condition phrasing also targets privateState", () => {
    const intent = classifyIntent("给顾辰风加上断了一根肋骨", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations[0]?.path).toBe("/privateState/roles/gu-chenfeng/conditions");
  });

  test("unmatched role falls back to /privateState/roles/world/conditions", () => {
    const intent = classifyIntent("给一个无名氏加上中毒状态", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations[0]?.path).toBe("/privateState/roles/world/conditions");
  });
});

describe("world-rule — /metaState/rules", () => {
  test("explicit '设定规则：…' stores the rule BODY, marker prefix stripped", () => {
    const goal = "设定规则：每天掉一点灵气，灵石可以买丹药";
    const body = "每天掉一点灵气，灵石可以买丹药";
    const intent = classifyIntent(goal, CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.worldId).toBe("cultivation");
    expect(intent.operations).toEqual([{ op: "append", path: "/metaState/rules", value: body }]);
    expect(intent.reason).toBe(body);
    // Regression guard: it must NOT fall through to config/create-role anymore.
    expect(intent.kind).not.toBe("config");
  });

  test("'给世界加一条规则：…' also stores only the rule body", () => {
    const goal = "给世界加一条规则：每回合掉血";
    const intent = classifyIntent(goal, CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations).toEqual([
      { op: "append", path: "/metaState/rules", value: "每回合掉血" },
    ]);
  });

  test("rule-shaped statement without the word '规则' still hits /metaState/rules", () => {
    const goal = "每回合所有人都会损失一点灵气";
    const intent = classifyIntent(goal, CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations).toEqual([{ op: "append", path: "/metaState/rules", value: goal }]);
  });

  test("'给顾辰风加上…' stays an on-role state-patch (world-rule must not swallow it)", () => {
    const intent = classifyIntent("给顾辰风加上断了一根肋骨", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations[0]?.path).toBe("/privateState/roles/gu-chenfeng/conditions");
  });

  test("regression: '加一个叫沈墨的剑修' still routes to config (role creation)", () => {
    const intent = classifyIntent("加一个叫沈墨的剑修", CONTEXT);
    expect(intent.kind).toBe("config");
  });
});

describe("declaresWorldRule — explicit, question-safe, marker-only world-rule predicate", () => {
  // TRUE: an explicit rule marker is present and the utterance is NOT a question.
  // Mixes the two real-model-failed boardroom phrasings, the cultivation phrasing,
  // and polite / short / multi-clause / role-naming / English variants so the web
  // model-backed router can recover any of them when a provider mis-classifies.
  const declares: string[] = [
    "设定规则：每推进一个季度，现金跑道减少一个季度",
    "给世界加一条规则：每推进一个季度，现金跑道减少一个季度",
    "设定规则：每天掉一点灵气，灵石可以买丹药",
    "麻烦给世界设定规则：闭门会议内容不得外泄", // polite lead-in
    "规则：IPO 前不得稀释陈牧的股份", // names a role but is an explicit world rule
    "设置规则：董事会决议需三分之二通过，且每季度复核一次", // multi-clause
    "世界规则就是强者为尊", // marker without colon (规则 head form)
    "world rule: hp drains each turn", // English
    "game rule: no insider trading", // English alias
  ];
  for (const text of declares) {
    test(`declares a world rule: '${text}'`, () => {
      expect(declaresWorldRule(text)).toBe(true);
    });
  }

  // FALSE: no explicit marker (ordinary patch / create-world / mechanic sentence) OR
  // a question — so an ordinary write A is never converted into a world-rule write B,
  // and NO-QUESTION-WRITE is preserved even when 规则 appears.
  const notDeclares: string[] = [
    "每推进一个季度，现金跑道减少一个季度", // marker-less mechanic
    "现金跑道减少一个季度", // ordinary attribute change
    "给顾辰风加上断了一根肋骨", // on-role state-patch
    "创建一个修真世界", // create-world
    "加一个叫沈墨的剑修", // add-role
    "现在世界设定了哪些规则？", // question (？ + 设定…规则)
    "这个世界有什么规则", // wh-question (什么), no explicit marker anyway
    "世界规则是怎样的呢", // marker present but clause-final 呢 question
    "", // empty
  ];
  for (const text of notDeclares) {
    test(`does NOT declare a world rule: '${text || "<empty>"}'`, () => {
      expect(declaresWorldRule(text)).toBe(false);
    });
  }
});

describe("extractWorldRuleBody — marker-stripped rule body (matches the classifier branch)", () => {
  test("strips '设定规则：' to the body", () => {
    expect(extractWorldRuleBody("设定规则：每天掉一点灵气，灵石可以买丹药")).toBe(
      "每天掉一点灵气，灵石可以买丹药",
    );
  });

  test("strips the long opener '给世界加一条规则：'", () => {
    expect(extractWorldRuleBody("给世界加一条规则：每推进一个季度，现金跑道减少一个季度")).toBe(
      "每推进一个季度，现金跑道减少一个季度",
    );
  });

  test("a role-named rule keeps the role in the body", () => {
    expect(extractWorldRuleBody("规则：IPO 前不得稀释陈牧的股份")).toBe("IPO 前不得稀释陈牧的股份");
  });

  test("trims surrounding whitespace before stripping", () => {
    expect(extractWorldRuleBody("  设定规则：每回合掉血  ")).toBe("每回合掉血");
  });

  test("equals the classifier's own /metaState/rules branch body", () => {
    const goal = "设定规则：每推进一个季度，现金跑道减少一个季度";
    const intent = classifyIntent(goal, CONTEXT);
    // Note: a stray '减少' steals this into the generic state-patch branch, so the
    // classifier itself does NOT reach /metaState/rules here — which is exactly why
    // the web router needs extractWorldRuleBody to synthesize the same body the
    // direct rule branch would have stored.
    expect(extractWorldRuleBody(goal)).toBe("每推进一个季度，现金跑道减少一个季度");
    expect(intent.kind).toBe("state-patch");
  });
});

describe("stripRuleMarkerPrefix — strip the marker, keep the rule body", () => {
  test("strips '设定规则：' and keeps the full body", () => {
    expect(stripRuleMarkerPrefix("设定规则：每天掉一点灵气，灵石可以买丹药")).toBe(
      "每天掉一点灵气，灵石可以买丹药",
    );
  });

  test("strips the long opener '给世界加一条规则：'", () => {
    expect(stripRuleMarkerPrefix("给世界加一条规则：每回合掉血")).toBe("每回合掉血");
  });

  test("strips ASCII colon variant 'world rule:'", () => {
    expect(stripRuleMarkerPrefix("world rule: hp drains each turn")).toBe("hp drains each turn");
  });

  test("preserves a colon inside the rule body", () => {
    expect(stripRuleMarkerPrefix("规则：胜利条件：先到 100 灵石者赢")).toBe(
      "胜利条件：先到 100 灵石者赢",
    );
  });

  test("a marker-less rule sentence is returned untouched", () => {
    expect(stripRuleMarkerPrefix("每天掉一点灵气")).toBe("每天掉一点灵气");
  });

  test("marker word without a colon is NOT decapitated", () => {
    // "规则只是参考" has no introductory colon, so "规则" is body text, not a prefix.
    expect(stripRuleMarkerPrefix("规则只是参考")).toBe("规则只是参考");
  });

  test("marker followed by only a colon (empty body) falls back to the original", () => {
    expect(stripRuleMarkerPrefix("设定规则：")).toBe("设定规则：");
  });
});

describe("world-rule — marker-less sentences must not be over-stripped", () => {
  test("plain rule sentence '每天掉一点灵气' keeps its full text in the patch", () => {
    const goal = "每天掉一点灵气";
    const intent = classifyIntent(goal, CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations).toEqual([{ op: "append", path: "/metaState/rules", value: goal }]);
  });
});

describe("world-switch — name→id, never a silent inspect (NO-NL-WORLD-SWITCH)", () => {
  test("'切换到云岭修仙界' resolves the named world to its id", () => {
    const intent = classifyIntent("切换到云岭修仙界", CONTEXT);
    expect(intent.kind).toBe("world-switch");
    if (intent.kind !== "world-switch") {
      throw new Error("expected world-switch");
    }
    expect(intent.worldId).toBe("cultivation");
  });

  test("'打开赛博江湖' resolves the other world, not the active one", () => {
    const intent = classifyIntent("打开赛博江湖", CONTEXT);
    expect(intent.kind).toBe("world-switch");
    if (intent.kind !== "world-switch") {
      throw new Error("expected world-switch");
    }
    expect(intent.worldId).toBe("cyber");
  });

  test("longest world name wins (no partial-name false match)", () => {
    const ctx: IntentRouterContext = {
      ...CONTEXT,
      worlds: [
        { id: "yunling", name: "云岭" },
        { id: "yunling-xian", name: "云岭修仙界" },
      ],
    };
    const intent = classifyIntent("进入云岭修仙界", ctx);
    expect(intent.kind).toBe("world-switch");
    if (intent.kind !== "world-switch") {
      throw new Error("expected world-switch");
    }
    expect(intent.worldId).toBe("yunling-xian");
  });

  test("a switch marker with NO named world does NOT become a world-switch (hook lists worlds instead)", () => {
    // "进入" is a marker but no world name appears → the classifier must not invent
    // a switch; it falls through to inspect so the hook can answer calmly.
    const intent = classifyIntent("进入世界后会发生什么？", CONTEXT);
    expect(intent.kind).not.toBe("world-switch");
  });

  test("a plain world-state question is NOT a world-switch (inspect stays the read path)", () => {
    const intent = classifyIntent("现在世界什么状态？", CONTEXT);
    expect(intent.kind).toBe("inspect");
  });

  test("no worlds wired in context → a switch phrasing cannot resolve, never a switch", () => {
    const intent = classifyIntent("切换到云岭修仙界", { ...CONTEXT, worlds: [] });
    expect(intent.kind).not.toBe("world-switch");
  });
});

describe("run-turn / god robustness — exact live-failed phrasings never fall to inspect", () => {
  test("'现在让顾辰风说话' → run-turn (role present in context)", () => {
    const intent = classifyIntent("现在让顾辰风说话", CONTEXT);
    expect(intent.kind).toBe("run-turn");
    if (intent.kind !== "run-turn") {
      throw new Error("expected run-turn");
    }
    expect(intent.roleId).toBe("gu-chenfeng");
    expect(intent.roomId).toBe("main");
  });

  test("'让顾辰风发言一回合' → run-turn, not inspect", () => {
    const intent = classifyIntent("让顾辰风发言一回合", CONTEXT);
    expect(intent.kind).toBe("run-turn");
    if (intent.kind !== "run-turn") {
      throw new Error("expected run-turn");
    }
    expect(intent.roleId).toBe("gu-chenfeng");
  });

  test("'顾辰风作弊，把他禁言' → god mute, not inspect", () => {
    const intent = classifyIntent("顾辰风作弊，把他禁言", CONTEXT);
    expect(intent.kind).toBe("god");
    if (intent.kind !== "god") {
      throw new Error("expected god");
    }
    expect(intent.action).toBe("mute");
    expect(intent.targetRoleId).toBe("gu-chenfeng");
  });
});

describe("run-turn — 'say something / chat' speak verbs (live-model defect)", () => {
  // Live-model defect: '让顾辰风在全员议事说点什么' misrouted to inspect because (a)
  // bare 什么 was treated interrogative and (b) the speak verb was not in the table.
  const speakPhrasings: { goal: string; roleId: string }[] = [
    { goal: "让顾辰风在全员议事说点什么", roleId: "gu-chenfeng" },
    { goal: "顾辰风说点什么", roleId: "gu-chenfeng" },
    { goal: "让云遥说些什么", roleId: "yunyao" },
    { goal: "让雷军说几句", roleId: "leijun" },
    { goal: "让顾辰风说两句", roleId: "gu-chenfeng" },
    { goal: "让云遥说说", roleId: "yunyao" },
    { goal: "让雷军聊聊", roleId: "leijun" },
    { goal: "让顾辰风聊几句", roleId: "gu-chenfeng" },
    { goal: "让云遥讲两句", roleId: "yunyao" },
    { goal: "让顾辰风开口说点什么", roleId: "gu-chenfeng" },
    { goal: "let gu-chenfeng say something", roleId: "gu-chenfeng" },
  ];
  for (const { goal, roleId } of speakPhrasings) {
    test(`'${goal}' → run-turn on ${roleId}, not inspect`, () => {
      const intent = classifyIntent(goal, CONTEXT);
      expect(intent.kind).toBe("run-turn");
      if (intent.kind !== "run-turn") {
        throw new Error("expected run-turn");
      }
      expect(intent.roleId).toBe(roleId);
      expect(intent.roomId).toBe("main");
    });
  }

  test("interrogative containing 什么 still reads as inspect, not run-turn", () => {
    // '顾辰风现在什么状态？' carries a real role but is a wh-question → inspect.
    const intent = classifyIntent("顾辰风现在什么状态？", CONTEXT);
    expect(intent.kind).toBe("inspect");
  });
});

describe("interrogatives route to inspect, never to a God write (NO-QUESTION-WRITE)", () => {
  test("defect: '现在世界什么状态？顾辰风被禁言了吗' → inspect world-state, NOT god mute", () => {
    const intent = classifyIntent("现在世界什么状态？顾辰风被禁言了吗", CONTEXT);
    expect(intent.kind).toBe("inspect");
    if (intent.kind !== "inspect") {
      throw new Error("expected inspect");
    }
    expect(intent.target).toBe("world-state");
  });

  test("defect F1: '顾辰风现在是不是被禁言了' → inspect world-state, NOT god mute (A-not-A)", () => {
    const intent = classifyIntent("顾辰风现在是不是被禁言了", CONTEXT);
    expect(intent.kind).toBe("inspect");
    if (intent.kind !== "inspect") {
      throw new Error("expected inspect");
    }
    expect(intent.target).toBe("world-state");
  });

  test("'顾辰风被禁言了吗？' → inspect (god keyword + role, but a question)", () => {
    const intent = classifyIntent("顾辰风被禁言了吗？", CONTEXT);
    expect(intent.kind).toBe("inspect");
  });

  test("clause-final 吗 with no question mark still reads as inspect", () => {
    const intent = classifyIntent("顾辰风被禁言了吗", CONTEXT);
    expect(intent.kind).toBe("inspect");
  });

  test("'顾辰风的状态设为什么了？' → inspect, not a state-patch write", () => {
    const intent = classifyIntent("顾辰风的状态设为什么了？", CONTEXT);
    expect(intent.kind).toBe("inspect");
  });

  test("imperative '把顾辰风禁言' → god mute (no interrogative signal, write stays)", () => {
    const intent = classifyIntent("把顾辰风禁言", CONTEXT);
    expect(intent.kind).toBe("god");
    if (intent.kind !== "god") {
      throw new Error("expected god");
    }
    expect(intent.action).toBe("mute");
    expect(intent.targetRoleId).toBe("gu-chenfeng");
  });

  test("imperative '给顾辰风加上断了一根肋骨' → state-patch (write stays)", () => {
    const intent = classifyIntent("给顾辰风加上断了一根肋骨", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.operations[0]?.path).toBe("/privateState/roles/gu-chenfeng/conditions");
  });

  test("'现在让顾辰风说话' → run-turn (imperative, unchanged)", () => {
    const intent = classifyIntent("现在让顾辰风说话", CONTEXT);
    expect(intent.kind).toBe("run-turn");
    if (intent.kind !== "run-turn") {
      throw new Error("expected run-turn");
    }
    expect(intent.roleId).toBe("gu-chenfeng");
  });

  test("softened imperative '把顾辰风禁言吧' (mid-clause 吧, no ？) stays a god write", () => {
    // 吧 is not a clause-final question particle here → must not become inspect.
    const intent = classifyIntent("把顾辰风禁言吧", CONTEXT);
    expect(intent.kind).toBe("god");
  });
});
