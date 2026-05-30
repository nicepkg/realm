import { describe, expect, test } from "bun:test";
import {
  classifyIntent,
  DeterministicIntentRouter,
  type IntentRouterContext,
  ModelBackedIntentRouter,
} from "./intent-router.ts";

const CONTEXT: IntentRouterContext = {
  roles: [
    { id: "gu-chenfeng", displayName: "顾辰风" },
    { id: "leijun", displayName: "雷军" },
    { id: "yunyao", displayName: "云遥" },
  ],
  rooms: [{ id: "main" }, { id: "sect-hall" }],
  worlds: [
    { id: "cultivation", name: "云岭修仙界" },
    { id: "software-company", name: "软件公司" },
  ],
  worldId: "cultivation",
  defaultRoomId: "main",
};

describe("classifyIntent — deterministic families", () => {
  test("god: 禁言 maps to mute on the named role", () => {
    const intent = classifyIntent("顾辰风作弊，把他禁言", CONTEXT);
    expect(intent).toMatchObject({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
    });
  });

  test("god: 解禁 maps to revive", () => {
    const intent = classifyIntent("给顾辰风解禁", CONTEXT);
    expect(intent).toMatchObject({ kind: "god", action: "revive", targetRoleId: "gu-chenfeng" });
  });

  test("state-patch: condition assignment targets the role under a JSON pointer", () => {
    const intent = classifyIntent("给顾辰风加上断了一根肋骨", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.worldId).toBe("cultivation");
    expect(intent.operations).toEqual([
      {
        op: "append",
        path: "/privateState/roles/gu-chenfeng/conditions",
        value: "给顾辰风加上断了一根肋骨",
      },
    ]);
    expect(intent.reason.length).toBeGreaterThan(0);
  });

  test("state-patch: falls back to empty worldId when context omits it", () => {
    const intent = classifyIntent("给云遥加上中毒状态", { ...CONTEXT, worldId: undefined });
    expect(intent).toMatchObject({ kind: "state-patch", worldId: "" });
  });

  test("run-turn: '现在让顾辰风说话' runs the role in the default room", () => {
    const intent = classifyIntent("现在让顾辰风说话", CONTEXT);
    expect(intent).toEqual({ kind: "run-turn", roleId: "gu-chenfeng", roomId: "main" });
  });

  test("state-patch: '让顾辰风此刻心生退意' is a condition write, not a turn (F8)", () => {
    const intent = classifyIntent("让顾辰风此刻心生退意", CONTEXT);
    expect(intent.kind).toBe("state-patch");
    if (intent.kind !== "state-patch") {
      throw new Error("expected state-patch");
    }
    expect(intent.worldId).toBe("cultivation");
    expect(intent.operations).toEqual([
      {
        op: "append",
        path: "/privateState/roles/gu-chenfeng/conditions",
        value: "让顾辰风此刻心生退意",
      },
    ]);
  });

  test("state-patch: '让云遥变得恐惧' (emotion phrasing) routes to state-patch", () => {
    const intent = classifyIntent("让云遥变得恐惧", CONTEXT);
    expect(intent).toMatchObject({ kind: "state-patch", worldId: "cultivation" });
  });

  test("run-turn: bare '让' without a speech verb does NOT advance a turn", () => {
    // No speech/directive verb → not a run-turn; falls back to a safe inspect.
    const intent = classifyIntent("让顾辰风", CONTEXT);
    expect(intent.kind).not.toBe("run-turn");
  });

  test("trust-elevation: '提升信任等级' returns a trust-elevation intent", () => {
    const intent = classifyIntent("提升信任等级", CONTEXT);
    expect(intent).toEqual({ kind: "trust-elevation", tier: "run-roles" });
  });

  test("trust-elevation: '允许运行角色' / '解除只读' also elevate trust", () => {
    expect(classifyIntent("允许运行角色", CONTEXT)).toEqual({
      kind: "trust-elevation",
      tier: "run-roles",
    });
    expect(classifyIntent("解除只读，允许写入状态", CONTEXT)).toEqual({
      kind: "trust-elevation",
      tier: "run-roles",
    });
  });

  test("run-turn: falls back to first room when no default", () => {
    const intent = classifyIntent("让雷军发言", { ...CONTEXT, defaultRoomId: undefined });
    expect(intent).toMatchObject({ kind: "run-turn", roleId: "leijun", roomId: "main" });
  });

  test("inspect: world-state question", () => {
    const intent = classifyIntent("现在世界什么状态？", CONTEXT);
    expect(intent).toMatchObject({ kind: "inspect", target: "world-state" });
  });

  test("inspect: role-memory question routes to role-memory with roleId", () => {
    const intent = classifyIntent("雷军知道哪些事？", CONTEXT);
    expect(intent).toMatchObject({ kind: "inspect", target: "role-memory", roleId: "leijun" });
  });

  test("config: world creation routes through the existing planner", () => {
    const intent = classifyIntent("创建一个有宗门、对手和师父的修真世界", CONTEXT);
    expect(intent.kind).toBe("config");
    if (intent.kind !== "config") {
      throw new Error("expected config");
    }
    expect(intent.plan).toEqual({
      kind: "world",
      world: {
        // Deterministic, idSchema-safe id hashed from the resolved zh name
        // (修真世界 has no safe kebab slug → pure FNV-1a `world-<hash>` token).
        id: "world-ff3d9068",
        name: "修真世界",
        mode: "game",
        // world-main room display NAME persisted verbatim — zh-CN label, not "main".
        roomName: "全员议事",
        roleIds: [],
      },
    });
  });

  test("config: role creation produces a role plan", () => {
    const intent = classifyIntent("加一个叫云遥的炼丹师角色", CONTEXT);
    expect(intent).toMatchObject({ kind: "config", plan: { kind: "role" } });
  });

  test("ambiguous: bare text defaults to a world-state inspect, never a silent write", () => {
    const intent = classifyIntent("嗯", CONTEXT);
    expect(intent).toEqual({ kind: "inspect", target: "world-state", query: "嗯" });
  });

  test("god requires a matched role; punish verb without a role is not a write", () => {
    const intent = classifyIntent("把那个人禁言", CONTEXT);
    expect(intent.kind).not.toBe("god");
    expect(intent.kind).toBe("inspect");
  });

  test("longest role-name match wins over a shorter overlapping one", () => {
    const context: IntentRouterContext = {
      ...CONTEXT,
      roles: [
        { id: "gu", displayName: "顾" },
        { id: "gu-chenfeng", displayName: "顾辰风" },
      ],
    };
    const intent = classifyIntent("现在让顾辰风说话", context);
    expect(intent).toMatchObject({ kind: "run-turn", roleId: "gu-chenfeng" });
  });
});

describe("DeterministicIntentRouter", () => {
  test("classifies via the same deterministic path", async () => {
    const router = new DeterministicIntentRouter();
    await expect(router.classify("把顾辰风禁言", CONTEXT)).resolves.toMatchObject({
      kind: "god",
      action: "mute",
    });
  });
});

describe("ModelBackedIntentRouter", () => {
  test("hydrates a model god intent", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({ kind: "god", targetRoleId: "leijun", action: "mute", reason: "扰乱秩序" }),
    });
    await expect(router.classify("处置雷军", CONTEXT)).resolves.toEqual({
      kind: "god",
      targetRoleId: "leijun",
      action: "mute",
      reason: "扰乱秩序",
    });
  });

  test("config from the model still routes through the deterministic planner", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "config" }),
    });
    const intent = await router.classify("创建一个修真世界", CONTEXT);
    expect(intent).toMatchObject({
      kind: "config",
      plan: { kind: "world", world: { mode: "game" } },
    });
  });

  test("hydrates run-turn room from context when the model omits it", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "run-turn", roleId: "yunyao" }),
    });
    await expect(router.classify("让云遥行动", CONTEXT)).resolves.toEqual({
      kind: "run-turn",
      roleId: "yunyao",
      roomId: "main",
    });
  });

  test("hydrates state-patch worldId from context", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({
          kind: "state-patch",
          operations: [{ op: "increment", path: "/roles/leijun/qi", amount: -10 }],
          reason: "灵气流失",
        }),
    });
    const intent = await router.classify("雷军灵气掉10", CONTEXT);
    expect(intent).toMatchObject({ kind: "state-patch", worldId: "cultivation" });
  });

  test("hydrates trust-elevation, defaulting the tier when the model omits it", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "trust-elevation" }),
    });
    await expect(router.classify("允许运行角色", CONTEXT)).resolves.toEqual({
      kind: "trust-elevation",
      tier: "run-roles",
    });
  });

  test("falls back to deterministic classifier on model error", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => {
        throw new Error("provider down");
      },
    });
    await expect(router.classify("把顾辰风禁言", CONTEXT)).resolves.toMatchObject({
      kind: "god",
      action: "mute",
    });
  });

  test("falls back to deterministic classifier on unparseable model output", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => "not json at all",
    });
    await expect(router.classify("现在世界什么状态？", CONTEXT)).resolves.toMatchObject({
      kind: "inspect",
      target: "world-state",
    });
  });

  test("world-switch: resolves a model-named world to a concrete id", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "world-switch", worldName: "软件公司" }),
    });
    await expect(router.classify("切换到软件公司", CONTEXT)).resolves.toEqual({
      kind: "world-switch",
      worldId: "software-company",
    });
  });

  test("world-switch: resolves by exact id when the model supplies one", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "world-switch", worldId: "cultivation" }),
    });
    await expect(router.classify("打开云岭修仙界", CONTEXT)).resolves.toEqual({
      kind: "world-switch",
      worldId: "cultivation",
    });
  });

  test("world-switch: unknown world falls back to the deterministic path, never a wrong switch", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({ kind: "world-switch", worldId: "ghost", worldName: "幽冥界" }),
    });
    // No "幽冥界" in the roster → must NOT emit a switch. The deterministic path has
    // no switch marker + no name match either, so it degrades to a calm inspect.
    const intent = await router.classify("切换到幽冥界", CONTEXT);
    expect(intent.kind).not.toBe("world-switch");
    expect(intent).toMatchObject({ kind: "inspect", target: "world-state" });
  });

  test("NO-QUESTION-WRITE: model returning god for an interrogative goal is downgraded to inspect", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({ kind: "god", targetRoleId: "gu-chenfeng", action: "mute", reason: "x" }),
    });
    // "顾辰风被禁言了吗？" is a question — must NEVER become a write even if the model says so.
    const intent = await router.classify("顾辰风被禁言了吗？", CONTEXT);
    expect(intent.kind).not.toBe("god");
    expect(intent).toMatchObject({ kind: "inspect", target: "world-state" });
  });

  test("NO-QUESTION-WRITE: model returning state-patch for an interrogative goal is downgraded to inspect", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({
          kind: "state-patch",
          operations: [
            { op: "append", path: "/privateState/roles/leijun/conditions", value: "中毒" },
          ],
          reason: "x",
        }),
    });
    const intent = await router.classify("雷军中毒了吗？", CONTEXT);
    expect(intent.kind).not.toBe("state-patch");
    expect(intent).toMatchObject({ kind: "inspect" });
  });

  test("NO-QUESTION-WRITE: model returning world-switch for an interrogative goal is downgraded", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () => JSON.stringify({ kind: "world-switch", worldId: "software-company" }),
    });
    // A question that merely names a world must read, not switch.
    const intent = await router.classify("软件公司现在什么状态？", CONTEXT);
    expect(intent.kind).not.toBe("world-switch");
    expect(intent).toMatchObject({ kind: "inspect", target: "world-state" });
  });

  test("imperative god write is still honored (question guard does not over-block)", async () => {
    const router = new ModelBackedIntentRouter({
      complete: async () =>
        JSON.stringify({
          kind: "god",
          targetRoleId: "gu-chenfeng",
          action: "mute",
          reason: "扰乱秩序",
        }),
    });
    // "把顾辰风禁言" is an imperative, not a question → the model write stands.
    await expect(router.classify("把顾辰风禁言", CONTEXT)).resolves.toEqual({
      kind: "god",
      targetRoleId: "gu-chenfeng",
      action: "mute",
      reason: "扰乱秩序",
    });
  });
});
