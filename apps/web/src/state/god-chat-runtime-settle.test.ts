import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import type { ChatTurn } from "@/state/god-chat-model.ts";
import {
  extractAddRoleName,
  findRoleByDisplayName,
  selectRoleMessagesToFold,
  settleRunTurn,
} from "@/state/god-chat-runtime.ts";

/** Roles used by the settle/de-dup suites (顾辰风 speaks; 云遥 tests name de-dup). */
const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

function deltaEvent(turnId: string, delta: string): RealmEvent {
  return {
    aggregateId: "w1",
    createdAt: new Date().toISOString(),
    delta: { delta, turnId },
    eventId: `e-delta-${turnId}-${delta}`,
    schemaVersion: 1,
    seq: 1,
    type: "turn.delta",
  } as unknown as RealmEvent;
}

function postedMsg(id: string, authorId: string, content: string): Message {
  return {
    authorId,
    content,
    createdAt: new Date().toISOString(),
    displayedAuthorId: authorId,
    id,
    roomId: "main",
    worldId: "cultivation",
  };
}

/**
 * `settleRunTurn` is the pure brain that kills the run-turn finalization bug: it
 * deterministically resolves a TERMINAL role turn into exactly ONE settled bubble
 * (or failure card), including the delta+completed SAME-batch race where the
 * streaming branch never got to allocate a bubble. Driving it directly proves the
 * fix without React.
 */
describe("settleRunTurn — deterministic terminal settle (P1)", () => {
  const base = {
    bubbleTurnId: undefined,
    denialReason: undefined,
    events: [] as RealmEvent[],
    existing: [],
    identity: "owner",
    messages: [] as Message[],
    ownerIds: ["owner"],
    roleName: "顾辰风",
    roles,
    roomId: "main",
    streamed: undefined as string | undefined,
    terminal: { kind: "completed" } as const,
    turnId: "t1",
  };

  test("RACE: delta+completed in one batch, no bubble yet → exactly ONE settled bubble from streamed text", () => {
    // Reproduces the dropped-reply bug: bubbleTurnId is still undefined but streamed
    // text exists and the turn already completed. Must materialize a settled bubble.
    const result = settleRunTurn({
      ...base,
      events: [deltaEvent("t1", "我已闭关三日。")],
      streamed: "我已闭关三日。",
    });
    if (result.kind !== "settleNew") {
      throw new Error(`expected settleNew, got ${result.kind}`);
    }
    if (result.turn.card?.variant !== "role-speech") {
      throw new Error("expected a role-speech bubble");
    }
    expect(result.turn.card.detail).toBe("我已闭关三日。");
    expect(result.turn.card.streaming).toBe(false);
    expect(result.turn.card.speakerName).toBe("顾辰风");
  });

  test("completed with an existing streaming bubble → grow it in place (no new bubble)", () => {
    const result = settleRunTurn({ ...base, bubbleTurnId: "bubble-1", streamed: "我..." });
    if (result.kind !== "growBubble") {
      throw new Error(`expected growBubble, got ${result.kind}`);
    }
    expect(result.bubbleTurnId).toBe("bubble-1");
    expect(result.detail).toBe("我...");
  });

  test("completed with NO stream but a posted room message → settle from that ONE message (never zero)", () => {
    const result = settleRunTurn({
      ...base,
      messages: [postedMsg("m1", "guchenfeng", "我从室外回来。")],
      streamed: undefined,
    });
    if (result.kind !== "settleNew") {
      throw new Error(`expected settleNew from posted message, got ${result.kind}`);
    }
    if (result.turn.card?.variant !== "role-speech") {
      throw new Error("expected role-speech");
    }
    expect(result.turn.card.detail).toBe("我从室外回来。");
    expect(result.turn.sourceMessageId).toBe("m1");
  });

  test("completed with nothing to show (no stream, no posted message) → none, just clears the spinner", () => {
    const result = settleRunTurn({ ...base, messages: [], streamed: undefined });
    expect(result.kind).toBe("none");
  });

  test("failed → an honest failure card carrying the trust flag, never a bubble", () => {
    const result = settleRunTurn({
      ...base,
      terminal: { kind: "failed", reason: "Project is trusted for read-only inspection only." },
    });
    if (result.kind !== "fail") {
      throw new Error(`expected fail, got ${result.kind}`);
    }
    expect(result.trustRelated).toBe(true);
    expect(result.text).toContain("顾辰风");
  });

  test("does not double-render: a streamed reply already shown as a bubble is not re-folded from its posted twin", () => {
    // The completed stream owns the bubble; the same content posted to the room must
    // NOT also be picked up here (dedup via the existing role-speech text).
    const result = settleRunTurn({
      ...base,
      bubbleTurnId: undefined,
      existing: [
        {
          card: {
            detail: "重复内容",
            kind: "run-turn",
            speakerName: "顾辰风",
            streaming: false,
            variant: "role-speech",
          },
          id: "x",
          role: "system",
          text: "",
        },
      ],
      messages: [postedMsg("m1", "guchenfeng", "重复内容")],
      streamed: undefined,
    });
    // Already represented → nothing new to materialize.
    expect(result.kind).toBe("none");
  });
});

/**
 * The double-bubble regression (F1 P1): a single role reply must render exactly
 * ONCE even though TWO effects can fold it — the active-run-turn effect settles a
 * streamed bubble (binding `streamingTurnId` + the posted twin's `sourceMessageId`)
 * while the posted-message effect folds the polled `message.created`. These drive
 * `settleRunTurn` + `selectRoleMessagesToFold` back to back the way the two effects
 * run on the SAME SSE batch, asserting the second never appends a duplicate.
 */
describe("no double role bubble — stream + posted dedup (P1)", () => {
  const settleBase = {
    bubbleTurnId: undefined,
    denialReason: undefined,
    events: [] as RealmEvent[],
    existing: [] as ChatTurn[],
    messages: [] as Message[],
    ownerIds: ["owner"],
    roleName: "顾辰风",
    roles,
    roomId: "main",
    streamed: undefined as string | undefined,
    terminal: { kind: "completed" } as const,
    turnId: "t1",
  };

  test("stream + posted in one batch → settled bubble binds the posted id so the fold skips it (1 bubble)", () => {
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日。");
    // 1) Active-run-turn effect settles the streamed reply; its posted twin is
    //    present in the same batch, so the settled bubble must bind m1.
    const settle = settleRunTurn({
      ...settleBase,
      messages: [message],
      streamed: "我已闭关三日。",
    });
    if (settle.kind !== "settleNew") {
      throw new Error(`expected settleNew, got ${settle.kind}`);
    }
    expect(settle.turn.sourceMessageId).toBe("m1");
    const rendered: ChatTurn[] = [{ ...settle.turn, id: "turn-1" }];
    // 2) Posted-message effect then runs against the same message + the rendered
    //    bubble — must fold nothing (id already represented).
    const folded = selectRoleMessagesToFold({
      existing: rendered,
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(0);
  });

  test("posted arrives first, completed later → completed settle dedups against the posted bubble (1 bubble)", () => {
    const message = postedMsg("m1", "guchenfeng", "我从室外回来。");
    // 1) Posted-message effect folds the polled message first (no stream yet).
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(1);
    const postedBubble: ChatTurn[] = folded.map((entry, i) => ({
      card: {
        detail: entry.message.content,
        kind: "run-turn" as const,
        speakerName: entry.speakerName,
        streaming: false,
        variant: "role-speech" as const,
      },
      id: `turn-${i}`,
      role: "system" as const,
      sourceMessageId: entry.message.id,
      text: "",
    }));
    // 2) The run turn then completes (no live bubble, no delta) — the posted reply
    //    is already shown, so the settle must yield `none`, not a second bubble.
    const settle = settleRunTurn({
      ...settleBase,
      existing: postedBubble,
      messages: [message],
      streamed: undefined,
    });
    expect(settle.kind).toBe("none");
  });

  test("streamed detail differs from posted content by a trailing token → still deduped (1 bubble)", () => {
    // The streamed reply lost its final token / whitespace vs. the persisted
    // content. Exact equality would miss it; fuzzy containment must still bind.
    const message = postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。");
    const settle = settleRunTurn({
      ...settleBase,
      messages: [message],
      // Streamed text is a prefix of the posted content (trailing token dropped).
      streamed: "我已闭关三日，",
    });
    if (settle.kind !== "settleNew") {
      throw new Error(`expected settleNew, got ${settle.kind}`);
    }
    expect(settle.turn.sourceMessageId).toBe("m1");
    const rendered: ChatTurn[] = [{ ...settle.turn, id: "turn-1" }];
    const folded = selectRoleMessagesToFold({
      existing: rendered,
      messages: [message],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(0);
  });

  test("trailing-token difference is also deduped at the fold layer when no id was bound", () => {
    // If the stream settled BEFORE the posted twin landed (no id bound), the bubble
    // carries only its streamed text. The later posted message differs by a trailing
    // token — the fuzzy-text backstop must still skip it.
    const streamedBubble: ChatTurn[] = [
      {
        card: {
          detail: "我已闭关三日，",
          kind: "run-turn",
          speakerName: "顾辰风",
          streaming: false,
          variant: "role-speech",
        },
        id: "turn-1",
        role: "system",
        streamingTurnId: "t1",
        text: "",
      },
    ];
    const folded = selectRoleMessagesToFold({
      existing: streamedBubble,
      messages: [postedMsg("m1", "guchenfeng", "我已闭关三日，今日方出。")],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(0);
  });

  test("two distinct role lines are NOT collapsed by the fuzzy dedup", () => {
    // Guard against over-aggressive containment: two genuinely different replies
    // from the same role must both fold.
    const folded = selectRoleMessagesToFold({
      existing: [],
      messages: [
        postedMsg("m1", "guchenfeng", "我已闭关三日。"),
        postedMsg("m2", "guchenfeng", "今日天气晴朗，宜远行。"),
      ],
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    expect(folded).toHaveLength(2);
  });
});

describe("add-role de-dup helpers (P2)", () => {
  test("extractAddRoleName pulls the name from English and zh-CN add-role titles", () => {
    expect(extractAddRoleName("Add role 云遥")).toBe("云遥");
    expect(extractAddRoleName("add a role: 云遥")).toBe("云遥");
    expect(extractAddRoleName("新增角色「云遥」")).toBe("云遥");
  });

  test("extractAddRoleName returns undefined for non-add-role proposals", () => {
    expect(extractAddRoleName("Create world Assistant World")).toBeUndefined();
    expect(extractAddRoleName("Set rule 灵气衰减")).toBeUndefined();
  });

  test("findRoleByDisplayName matches an existing role case/space-folded", () => {
    expect(findRoleByDisplayName(roles, "云遥")?.id).toBe("yunyao");
    expect(findRoleByDisplayName(roles, " 云遥 ")?.id).toBe("yunyao");
    expect(findRoleByDisplayName(roles, "不存在的角色")).toBeUndefined();
  });

  // The dedupe scope is the ACTIVE world's members (stageConfig now reads
  // `context.roles`), not the whole project pool. These two cases pin that scope.
  test("云遥 into a world that ALREADY has 云遥 short-circuits (dedupe hits)", () => {
    // stageConfig dedupes against the proposal TITLE returned by the planner.
    const requested = extractAddRoleName("新增角色「云遥」");
    expect(requested).toBe("云遥");
    // `roles` stands in for the active world's member list — 云遥 is a member.
    expect(requested ? findRoleByDisplayName(roles, requested)?.id : undefined).toBe("yunyao");
  });

  test("云遥 into an EMPTY world stages a real proposal (no false dedupe)", () => {
    const requested = extractAddRoleName("新增角色「云遥」");
    expect(requested).toBe("云遥");
    // The active world has no members; a 云遥 elsewhere must NOT block this add.
    const emptyWorldMembers: RoleSummary[] = [];
    expect(
      requested ? findRoleByDisplayName(emptyWorldMembers, requested) : undefined,
    ).toBeUndefined();
  });
});
