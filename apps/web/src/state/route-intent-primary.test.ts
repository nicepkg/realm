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
