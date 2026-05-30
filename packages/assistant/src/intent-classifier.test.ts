import { describe, expect, test } from "bun:test";
import { classifyIntent } from "./intent-classifier.ts";
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
  test("explicit '设定规则：…' routes to a world-level metaState rule patch", () => {
    const goal = "设定规则：每天掉一点灵气，灵石可以买丹药";
    const intent = classifyIntent(goal, CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.worldId).toBe("cultivation");
    expect(intent.operations).toEqual([{ op: "append", path: "/metaState/rules", value: goal }]);
    // Regression guard: it must NOT fall through to config/create-role anymore.
    expect(intent.kind).not.toBe("config");
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
