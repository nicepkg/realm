import { describe, expect, mock, test } from "bun:test";
import type { RealmIntent } from "@realm/assistant";
import type { RealmHttpClient } from "@realm/client-sdk";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import { routeIntentPrimary } from "@/state/route-intent-primary.ts";

/**
 * PRIMARY intent routing contract. `routeIntentPrimary` calls the model-backed
 * server endpoint via the SDK and maps the returned intent onto the SAME
 * RouteResult the deterministic router produces — and on ANY failure falls back to
 * the synchronous deterministic classifier so the operator is never blocked. We
 * verify: (1) the model-route-succeeds path is shaped correctly, (2) a failed call
 * degrades to the deterministic classification, and (3) the NO-QUESTION-WRITE
 * invariant survives end to end even when a misbehaving stub server returns a
 * write intent for an interrogative goal.
 */

const CONTEXT: GodChatContext = {
  worldId: "cultivation",
  roomId: "main",
  roles: [
    { id: "gu-chenfeng", displayName: "顾辰风" } as never,
    { id: "yunyao", displayName: "云遥" } as never,
  ],
  rooms: [{ id: "main" }],
  worlds: [
    { id: "cultivation", name: "云岭修仙界" },
    { id: "software", name: "软件公司" },
  ],
  worldState: { version: 0, state: {} },
};

/** A client whose `routeAssistantIntent` returns a fixed intent (the "model"). */
function clientReturning(intent: RealmIntent): RealmHttpClient {
  return {
    routeAssistantIntent: mock(async () => ({ intent })),
  } as unknown as RealmHttpClient;
}

/** A client whose `routeAssistantIntent` always rejects (model/network failure). */
function clientFailing(): RealmHttpClient {
  return {
    routeAssistantIntent: mock(async () => {
      throw new Error("boom");
    }),
  } as unknown as RealmHttpClient;
}

describe("routeIntentPrimary — model route succeeds", () => {
  test("god intent is shaped into a staged god write with the resolved role name", async () => {
    const client = clientReturning({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
      reason: "作弊",
    });
    const route = await routeIntentPrimary("把顾辰风禁言", CONTEXT, client);
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "god") {
      throw new Error("expected a staged god write");
    }
    expect(route.proposal.action).toBe("mute");
    expect(route.proposal.targetRoleId).toBe("gu-chenfeng");
    expect(route.proposal.targetRoleName).toBe("顾辰风");
    expect(route.proposal.worldId).toBe("cultivation");
    expect(client.routeAssistantIntent).toHaveBeenCalledTimes(1);
  });

  test("inspect intent is passed through as a read (no confirm)", async () => {
    const client = clientReturning({
      kind: "inspect",
      target: "world-state",
      query: "现在世界什么状态？",
    });
    const route = await routeIntentPrimary("现在世界什么状态？", CONTEXT, client);
    expect(route.mode).toBe("inspect");
  });

  test("world-switch resolves the named world against the roster", async () => {
    const client = clientReturning({ kind: "world-switch", worldId: "software" });
    const route = await routeIntentPrimary("切换到软件公司", CONTEXT, client);
    expect(route.mode).toBe("world-switch");
    if (route.mode !== "world-switch") {
      throw new Error("expected a world-switch route");
    }
    expect(route.worldId).toBe("software");
    expect(route.worldName).toBe("软件公司");
  });

  test("config intent carries the goal for re-proposal", async () => {
    const client = clientReturning({
      kind: "config",
      goal: "创建一个修真世界",
      plan: { kind: "world", world: { id: "w", name: "修真世界" } } as never,
    });
    const route = await routeIntentPrimary("创建一个修真世界", CONTEXT, client);
    expect(route.mode).toBe("config");
    if (route.mode !== "config") {
      throw new Error("expected a config route");
    }
    expect(route.goal).toBe("创建一个修真世界");
  });
});

describe("routeIntentPrimary — model route fails → deterministic fallback", () => {
  test("a failed SDK call still routes the text deterministically (never blocks)", async () => {
    const client = clientFailing();
    // "把顾辰风禁言" is an imperative god action the deterministic router stages.
    const route = await routeIntentPrimary("把顾辰风禁言", CONTEXT, client);
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "god") {
      throw new Error("expected the deterministic god write");
    }
    expect(route.proposal.targetRoleId).toBe("gu-chenfeng");
    expect(client.routeAssistantIntent).toHaveBeenCalledTimes(1);
  });

  test("a failed call on a question still routes to a read deterministically", async () => {
    const client = clientFailing();
    const route = await routeIntentPrimary("顾辰风被禁言了吗？", CONTEXT, client);
    expect(route.mode).toBe("inspect");
  });
});

describe("routeIntentPrimary — NO-QUESTION-WRITE survives end to end", () => {
  test("an interrogative goal never stages a write even if the stub server returns one", async () => {
    // Misbehaving server: returns a god WRITE for an obvious question.
    const client = clientReturning({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
      reason: "顾辰风被禁言了吗？",
    });
    const route = await routeIntentPrimary("顾辰风被禁言了吗？", CONTEXT, client);
    // The web layer re-applies the deterministic guard: the question routes to a
    // read, NOT a staged god write.
    expect(route.mode).toBe("inspect");
    expect(route.mode).not.toBe("stage");
  });

  test("a genuine imperative write from the model is still honored", async () => {
    const client = clientReturning({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
      reason: "作弊",
    });
    const route = await routeIntentPrimary("把顾辰风禁言", CONTEXT, client);
    expect(route.mode).toBe("stage");
  });
});

/**
 * SET-RULE-OVER-MODEL (write A vs write B). A real provider has been observed
 * mis-classifying an explicit WORLD-RULE declaration as `add-role` (rule text
 * stuffed into a role name → surfaced as a `config` plan), `create-world`
 * (also a `config` route here), or a `god` action — confidently writing the WRONG
 * thing. The deterministic `routeIntent` reads the same text as a high-confidence
 * world-rule, so it must win and stage a `state-patch` appending the rule verbatim
 * to `/metaState/rules`. This is strictly narrower than NO-QUESTION-WRITE.
 */
describe("routeIntentPrimary — deterministic set-rule overrides a mis-classified model write", () => {
  /** Assert the route is a staged world-rule state-patch carrying `ruleText`. */
  function expectWorldRulePatch(
    route: Awaited<ReturnType<typeof routeIntentPrimary>>,
    ruleText: string,
  ) {
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "state-patch") {
      throw new Error("expected a staged world-rule state-patch");
    }
    const op = route.proposal.operations[0];
    if (op?.op !== "append") {
      throw new Error("expected an append op");
    }
    expect(op.path).toBe("/metaState/rules");
    expect(op.value).toBe(ruleText);
  }

  test("boardroom 'add-role' mis-classification → set-rule to /metaState/rules", async () => {
    const rule = "设定规则：每推进一个季度，现金跑道减少一个季度";
    // The stored rule is the BODY only — the directive marker is stripped so the
    // recovery path matches the classifier's own /metaState/rules branch.
    const body = "每推进一个季度，现金跑道减少一个季度";
    // The model stuffed the whole rule into a role name and returned a config plan.
    const client = clientReturning({
      kind: "config",
      goal: rule,
      plan: { kind: "role", role: { id: "r", displayName: rule } } as never,
    });
    const route = await routeIntentPrimary(rule, CONTEXT, client);
    expectWorldRulePatch(route, body);
  });

  test("boardroom 'create-world' mis-classification (给世界加一条规则…) → set-rule", async () => {
    const rule = "给世界加一条规则：每推进一个季度，现金跑道减少一个季度";
    const body = "每推进一个季度，现金跑道减少一个季度";
    const client = clientReturning({
      kind: "config",
      goal: rule,
      plan: { kind: "world", world: { id: "w", name: rule } } as never,
    });
    const route = await routeIntentPrimary(rule, CONTEXT, client);
    expectWorldRulePatch(route, body);
  });

  test("cultivation set-rule mis-classified as a god action → set-rule", async () => {
    const rule = "设定规则：每天掉一点灵气，灵石可以买丹药";
    // Marker stripped → only the rule body is stored at /metaState/rules.
    const body = "每天掉一点灵气，灵石可以买丹药";
    // The model emitted a god write (an obvious mis-fire for a rule declaration).
    const client = clientReturning({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
      reason: rule,
    });
    const route = await routeIntentPrimary(rule, CONTEXT, client);
    expectWorldRulePatch(route, body);
  });

  test("idempotent: model and deterministic both read it as a set-rule (no double-route)", async () => {
    const rule = "设定规则：每天掉一点灵气";
    // The model AGREED it is a world-rule state-patch to /metaState/rules.
    const client = clientReturning({
      kind: "state-patch",
      worldId: "cultivation",
      operations: [{ op: "append", path: "/metaState/rules", value: rule }],
      reason: rule,
    });
    const route = await routeIntentPrimary(rule, CONTEXT, client);
    expectWorldRulePatch(route, rule);
    // The deterministic cross-check is skipped entirely when the model already says
    // state-patch — the SDK is called exactly once and the model intent is shaped.
    expect(client.routeAssistantIntent).toHaveBeenCalledTimes(1);
  });

  test("a question naming a rule never becomes a write (NO-QUESTION-WRITE preserved)", async () => {
    // Misbehaving model returns a god WRITE for an interrogative that mentions rules.
    const client = clientReturning({
      kind: "god",
      action: "mute",
      targetRoleId: "gu-chenfeng",
      reason: "现在世界设定了哪些规则？",
    });
    const route = await routeIntentPrimary("现在世界设定了哪些规则？", CONTEXT, client);
    // Deterministic reads the interrogative as a READ → it stages no write, so the
    // NO-QUESTION-WRITE guard wins and the question never stages a god mute.
    expect(route.mode).not.toBe("stage");
    expect(route.mode).toBe("inspect");
  });

  test("a non-rule config from the model is shaped through unchanged (no spurious rule rewrite)", async () => {
    // Model returns config for text that carries NO explicit rule marker. The
    // set-rule override must NOT fire (it only acts on marked world rules), so the
    // model's config route is honoured as-is and nothing is rewritten to
    // /metaState/rules.
    const client = clientReturning({
      kind: "config",
      goal: "现金跑道减少一个季度",
      plan: { kind: "world", world: { id: "w", name: "x" } } as never,
    });
    const route = await routeIntentPrimary("现金跑道减少一个季度", CONTEXT, client);
    expect(route.mode).toBe("config");
  });

  /**
   * REGRESSION GUARD for the deterministic-routing-dependency bug (note.md 2026-05-31
   * boardroom real-model finding): the override used to fire ONLY when the
   * deterministic router itself staged a `/metaState/rules` patch. But these
   * phrasings make the deterministic router land elsewhere — a stray `减少` steals
   * "设定规则：…减少…" into a generic `/privateState/roles/world/conditions` patch,
   * and a role-named rule ("规则：…陈牧…") defers to config — so the override never
   * fired and the model's wrong write won. The fix synthesizes the rule write from
   * `declaresWorldRule` + `extractWorldRuleBody`, independent of deterministic routing.
   */
  describe("synthesizes set-rule even when deterministic does NOT stage a rule patch", () => {
    test("'减少' phrasing (deterministic → /privateState/...): model add-role still corrected", async () => {
      const rule = "设定规则：每推进一个季度，现金跑道减少一个季度";
      const body = "每推进一个季度，现金跑道减少一个季度";
      // Model mis-classified as add-role (rule stuffed into a role name → config plan).
      const client = clientReturning({
        kind: "config",
        goal: rule,
        plan: { kind: "role", role: { id: "r", displayName: rule } } as never,
      });
      const route = await routeIntentPrimary(rule, CONTEXT, client);
      expectWorldRulePatch(route, body);
    });

    test("role-named rule (deterministic → config): model create-world still corrected", async () => {
      // "规则：…顾辰风…" names a role, so the deterministic `!role`-gated world-rule
      // branch defers to config — yet it IS an explicit world rule and must win.
      const rule = "规则：IPO 前不得稀释顾辰风的股份";
      const body = "IPO 前不得稀释顾辰风的股份";
      const client = clientReturning({
        kind: "config",
        goal: rule,
        plan: { kind: "world", world: { id: "w", name: rule } } as never,
      });
      const route = await routeIntentPrimary(rule, CONTEXT, client);
      expectWorldRulePatch(route, body);
    });

    test("polite multi-clause rule the model returned as a god write → set-rule (head marker)", async () => {
      // Polite head-anchored marker: "设定规则：" is the first token so the body strips
      // to the rule content; the multi-clause body is preserved verbatim.
      const rule = "设定规则：闭门会议内容不得外泄，违者出局";
      const body = "闭门会议内容不得外泄，违者出局";
      const client = clientReturning({
        kind: "god",
        action: "mute",
        targetRoleId: "gu-chenfeng",
        reason: rule,
      });
      const route = await routeIntentPrimary(rule, CONTEXT, client);
      expectWorldRulePatch(route, body);
    });

    test("polite LEAD-IN before the marker still routes to set-rule (body via classifier extractor)", async () => {
      // A polite lead-in ("麻烦…") sits BEFORE the marker, so the classifier's
      // head-anchored `stripRuleMarkerPrefix` does not decapitate it — the body is the
      // full sentence. The point of this case is the DESTINATION: it still routes to
      // /metaState/rules (declaresWorldRule fires on the embedded marker), never a god
      // write. We assert against the classifier's actual extraction (no web-layer regex).
      const rule = "麻烦给世界加一条规则：闭门会议内容不得外泄";
      const client = clientReturning({
        kind: "god",
        action: "mute",
        targetRoleId: "gu-chenfeng",
        reason: rule,
      });
      const route = await routeIntentPrimary(rule, CONTEXT, client);
      expect(route.mode).toBe("stage");
      if (route.mode !== "stage" || route.proposal.kind !== "state-patch") {
        throw new Error("expected a staged world-rule state-patch");
      }
      expect(route.proposal.operations[0]?.path).toBe("/metaState/rules");
    });

    test("English 'world rule:' the model mis-classified as config → set-rule", async () => {
      const rule = "world rule: cash runway shrinks by one quarter each advance";
      const body = "cash runway shrinks by one quarter each advance";
      const client = clientReturning({
        kind: "config",
        goal: rule,
        plan: { kind: "world", world: { id: "w", name: rule } } as never,
      });
      const route = await routeIntentPrimary(rule, CONTEXT, client);
      expectWorldRulePatch(route, body);
    });

    test("no active world → does NOT synthesize a target-less rule patch", async () => {
      const rule = "设定规则：每天掉一点灵气";
      const client = clientReturning({
        kind: "config",
        goal: rule,
        plan: { kind: "world", world: { id: "w", name: rule } } as never,
      });
      // With no worldId the override declines (no target); the model's config route
      // is shaped through so the operator gets the calm "先选择一个世界" path, never a
      // patch with no destination.
      const route = await routeIntentPrimary(rule, { ...CONTEXT, worldId: undefined }, client);
      expect(route.mode).toBe("config");
    });
  });
});
