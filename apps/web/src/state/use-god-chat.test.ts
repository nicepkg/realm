import { describe, expect, test } from "bun:test";
import type { Message, RealmEvent, RoleSummary } from "@realm/api-contract";
import {
  answerRoleMemory,
  answerWorldState,
  type ChatTurn,
  classifyBackendError,
  extractAddRoleName,
  findRoleByDisplayName,
  findTurnTerminal,
  isTrustElevationRequest,
  localizeProposalSummary,
  localizeProposalTitle,
  type PendingProposal,
  previewCard,
  previewIntroText,
  roleSpeechPostedTurn,
  roleSpeechStreamingTurn,
  routeIntent,
  runTurnFailureFeedback,
  selectRoleMessagesToFold,
  settleRunTurn,
} from "@/state/god-chat-model.ts";
import { resolveSubmitSource } from "@/state/use-god-chat.ts";
import { context, msg, roles } from "@/state/use-god-chat-test-fixtures.ts";

/**
 * God-chat controller contract — routing + read-only answers. The hook itself is a
 * thin React orchestrator; the load-bearing guarantees live in the pure
 * routing/answer model (the backend-write path is covered in `god-chat-write.test.ts`,
 * the hook-branch decisions in `use-god-chat-hook.test.ts`). We verify:
 *  - routing maps NL to the correct intent family,
 *  - no write is ever produced without a staged proposal + explicit confirm,
 *  - inspect answers are derived read-only from state, issuing no write.
 */

describe("routeIntent — NL → intent family", () => {
  test("a punish verb on a named role routes to a staged god write", () => {
    const route = routeIntent("顾辰风作弊，把他禁言", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "god") {
      throw new Error("expected staged god proposal");
    }
    expect(route.proposal.action).toBe("mute");
    expect(route.proposal.targetRoleId).toBe("guchenfeng");
    expect(route.proposal.targetRoleName).toBe("顾辰风");
  });

  test("an attribute assignment routes to a staged state-patch write", () => {
    const route = routeIntent("给顾辰风加上断了一根肋骨", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "state-patch") {
      throw new Error("expected staged state-patch proposal");
    }
    expect(route.proposal.operations.length).toBeGreaterThan(0);
    expect(route.proposal.worldId).toBe("cultivation");
  });

  test("a speak instruction routes to a staged run-turn write", () => {
    const route = routeIntent("现在让顾辰风说话", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "run-turn") {
      throw new Error("expected staged run-turn proposal");
    }
    expect(route.proposal.roleId).toBe("guchenfeng");
    expect(route.proposal.roomId).toBe("main");
  });

  test("'让顾辰风发言一回合' routes to run-turn, NOT inspect (live-failed phrasing)", () => {
    // The role is present in context, so this MUST advance a turn rather than fall
    // to the catch-all 世界状态 inspect that was observed live.
    const route = routeIntent("让顾辰风发言一回合", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "run-turn") {
      throw new Error("expected staged run-turn proposal");
    }
    expect(route.proposal.roleId).toBe("guchenfeng");
  });

  test("'顾辰风作弊，把他禁言' stages a god mute, NOT inspect (live-failed phrasing)", () => {
    const route = routeIntent("顾辰风作弊，把他禁言", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "god") {
      throw new Error("expected staged god proposal");
    }
    expect(route.proposal.action).toBe("mute");
    expect(route.proposal.targetRoleId).toBe("guchenfeng");
  });

  test("a creation instruction routes to config (planned via assistant)", () => {
    const route = routeIntent("创建一个有宗门和对手的修真世界", context());
    expect(route.mode).toBe("config");
  });

  test("a question routes to a read-only inspect, never a write", () => {
    const route = routeIntent("现在世界什么状态？", context());
    expect(route.mode).toBe("inspect");
  });

  test("a role-memory question routes to a role-memory inspect", () => {
    const route = routeIntent("云遥知道哪些事？", context());
    expect(route.mode).toBe("inspect");
    if (route.mode !== "inspect") {
      throw new Error("expected inspect");
    }
    expect(route.intent.target).toBe("role-memory");
    expect(route.intent.roleId).toBe("yunyao");
  });

  test("a god write with no world loaded degrades to a calm no-op, not a write", () => {
    const route = routeIntent("把顾辰风禁言", context({ worldId: undefined }));
    expect(route.mode).toBe("noop");
  });

  test("a run-turn with no room degrades to a calm no-op, not a write", () => {
    const route = routeIntent("让顾辰风说话", context({ roomId: undefined, rooms: [] }));
    expect(route.mode).toBe("noop");
  });
});

describe("submitText direct-send — explicit text bypasses the draft (read chip one-tap)", () => {
  // A read-class suggestion chip ("现在世界什么状态？") must SEND on a single tap.
  // setDraft(text) + submit() can't do that: React batches the state update, so
  // submit's closure reads the stale (empty) draft. The hook therefore routes the
  // chip's EXPLICIT prompt via `submitText`, sourced through `resolveSubmitSource`
  // with `from: "text"` — never `draft`. We assert that production seam directly.
  test("the explicit-text source ignores the draft entirely (and trims)", () => {
    // Even with a totally different draft sitting in the composer, the direct-send
    // routes the SUPPLIED text, not the draft — proving no draft dependency.
    expect(resolveSubmitSource({ from: "text", text: "  现在世界什么状态？  " })).toBe(
      "现在世界什么状态？",
    );
  });

  test("the draft source routes the trimmed draft (the composer Enter / send path)", () => {
    expect(resolveSubmitSource({ draft: "  让顾辰风说话  ", from: "draft" })).toBe("让顾辰风说话");
  });

  test("the text routed by a read chip classifies as a read-only inspect (no write)", () => {
    // The exact prompt a read chip carries, run through the SAME deterministic
    // router the hook's pipeline falls back to: it must be inspect, never a stage.
    const text = resolveSubmitSource({ from: "text", text: "现在世界什么状态？" });
    expect(routeIntent(text, context()).mode).toBe("inspect");
  });

  test("a WRITE typed via the explicit-text path still STAGES (never auto-commits)", () => {
    // submitText reuses the full routing pipeline, so a write reaching it is still
    // staged as a preview — the read/write chip split is a UI affordance, not a
    // bypass of the review-before-send gate.
    const text = resolveSubmitSource({ from: "text", text: "把顾辰风禁言" });
    expect(routeIntent(text, context()).mode).toBe("stage");
  });
});

describe("routeIntent — no write without confirm", () => {
  test("routing NEVER yields a committed write; writes require a staged proposal", () => {
    // Every write family resolves only to a `stage`/`config` proposal that must
    // be confirmed separately. Routing alone can never commit anything.
    const writeInstructions = ["把顾辰风禁言", "给云遥加上中毒", "让顾辰风说话", "创建一个新角色"];
    for (const text of writeInstructions) {
      const route = routeIntent(text, context());
      expect(["stage", "config"]).toContain(route.mode);
    }
  });
});

describe("inspect answers from state (read-only)", () => {
  test("world-state inspect summarizes the loaded snapshot", () => {
    const answer = answerWorldState(context());
    expect(answer.text).toContain("v3");
    expect(answer.text).toContain("qi");
    expect(answer.card.variant).toBe("result");
    expect(answer.card.detail).toContain("spring");
  });

  test("world-state inspect with no world loaded is calm, not an error", () => {
    const answer = answerWorldState(context({ worldId: undefined }));
    expect(answer.text).toContain("世界");
  });

  test("empty world state reports a blank world honestly", () => {
    const answer = answerWorldState(context({ worldState: { state: {}, version: 0 } }));
    expect(answer.text).toContain("白纸");
  });

  test("role-memory inspect renders the role's remembered content", () => {
    const answer = answerRoleMemory(roles, "yunyao", "她欠了顾辰风一颗丹药。");
    expect(answer.text).toContain("云遥");
    expect(answer.card.detail).toContain("丹药");
  });

  test("role-memory inspect on an empty memory is honest, not fabricated", () => {
    const answer = answerRoleMemory(roles, "yunyao", "   ");
    expect(answer.text).toContain("还没有形成任何记忆");
  });
});

describe("trust elevation routing (F2)", () => {
  test("a plain-language trust request is detected", () => {
    expect(isTrustElevationRequest("帮我提升信任等级")).toBe(true);
    expect(isTrustElevationRequest("允许运行角色")).toBe(true);
    expect(isTrustElevationRequest("解除只读")).toBe(true);
    expect(isTrustElevationRequest("raise trust to run roles")).toBe(true);
  });

  test("an ordinary creation request is NOT a trust request", () => {
    expect(isTrustElevationRequest("创建一个修真世界")).toBe(false);
    expect(isTrustElevationRequest("让顾辰风说话")).toBe(false);
  });

  test("a trust request routes to a staged trust write, never a config proposal", () => {
    // The guard runs BEFORE the assistant classifier, so "提升信任" is never
    // mis-read as a world/rule config edit.
    const route = routeIntent("把信任等级提升一下", context());
    expect(route.mode).toBe("stage");
    if (route.mode !== "stage" || route.proposal.kind !== "trust") {
      throw new Error("expected staged trust proposal");
    }
    expect(route.proposal.retry).toBeUndefined();
  });
});

describe("backend error → zh-CN copy (F3)", () => {
  test("the trust gate maps to a Chinese read-only message + trust flag", () => {
    const info = classifyBackendError(
      "Project is trusted for read-only inspection only; raise trust to run roles.",
    );
    expect(info.text).toBe("当前为只读模式，无法写入。");
    expect(info.trustRelated).toBe(true);
  });

  test("version conflict + timeout get distinct Chinese copy, not trust-flagged", () => {
    expect(classifyBackendError("Version conflict: expected 3 got 4").text).toContain("版本冲突");
    expect(classifyBackendError("request timed out").text).toContain("超时");
    expect(classifyBackendError("Version conflict").trustRelated).toBe(false);
  });

  test("an unknown English code keeps the detail but never leaks a bare English sentence", () => {
    const info = classifyBackendError("Something exploded internally");
    expect(info.text.startsWith("操作失败：")).toBe(true);
    expect(info.text).toContain("Something exploded internally");
  });

  test("an empty/undefined reason still produces calm Chinese copy", () => {
    expect(classifyBackendError(undefined).text).toContain("原因未知");
    expect(classifyBackendError("   ").text).toContain("原因未知");
  });
});

describe("config-proposal display localization (F4)", () => {
  test("English world/role/rule titles are rendered as zh-CN, keeping the proper name", () => {
    expect(localizeProposalTitle("Create world Assistant World")).toBe(
      "创建世界「Assistant World」",
    );
    expect(localizeProposalTitle("Add role 云遥")).toBe("新增角色「云遥」");
    expect(localizeProposalTitle("Create a sandbox world")).toBe("创建一个沙盒世界");
  });

  test("a summary with no template still reads as Chinese (no bare English clause)", () => {
    expect(localizeProposalSummary("Wire up the sect ladder")).toBe(
      "将执行：Wire up the sect ladder",
    );
  });

  test("already-Chinese title/summary is passed through untouched", () => {
    expect(localizeProposalTitle("新增三个角色")).toBe("新增三个角色");
    expect(localizeProposalSummary("给世界加上灵气衰减规则")).toBe("给世界加上灵气衰减规则");
  });
});

describe("role-turn streaming + reconciliation (F1)", () => {
  function turnEvent(
    type: "turn.completed" | "turn.failed" | "turn.cancelled",
    turnId: string,
  ): RealmEvent {
    return {
      aggregateId: "w1",
      createdAt: new Date().toISOString(),
      eventId: `e-${type}-${turnId}`,
      schemaVersion: 1,
      seq: 1,
      turn: {
        actorId: "guchenfeng",
        id: turnId,
        roomId: "main",
        status:
          type === "turn.completed" ? "completed" : type === "turn.failed" ? "failed" : "cancelled",
        worldId: "cultivation",
      },
      type,
    } as RealmEvent;
  }

  test("findTurnTerminal returns undefined while the turn is still running", () => {
    expect(findTurnTerminal([], "t1")).toBeUndefined();
    expect(findTurnTerminal([turnEvent("turn.completed", "other")], "t1")).toBeUndefined();
  });

  test("findTurnTerminal detects the matching terminal event", () => {
    expect(findTurnTerminal([turnEvent("turn.completed", "t1")], "t1")?.kind).toBe("completed");
    expect(findTurnTerminal([turnEvent("turn.failed", "t1")], "t1")?.kind).toBe("failed");
  });

  test("a failed run-turn produces honest zh-CN copy and flags the trust gate", () => {
    const failure = runTurnFailureFeedback(
      "顾辰风",
      "Project is trusted for read-only inspection only.",
    );
    expect(failure.text).toContain("顾辰风");
    expect(failure.text).toContain("只读");
    expect(failure.trustRelated).toBe(true);
    expect(failure.card.variant).toBe("result");
  });

  test("a streamed role line is a named-speaker role-speech bubble (not operator/system text)", () => {
    const turn = roleSpeechStreamingTurn("t1", "顾辰风", "我...");
    expect(turn.role).toBe("system");
    expect(turn.streamingTurnId).toBe("t1");
    if (turn.card?.variant !== "role-speech") {
      throw new Error("expected role-speech card");
    }
    expect(turn.card.speakerName).toBe("顾辰风");
    expect(turn.card.streaming).toBe(true);
    expect(turn.card.detail).toBe("我...");
  });

  test("posted role messages fold into the transcript, deduped against streamed + prior", () => {
    const messages: Message[] = [
      msg("m1", "guchenfeng", "main", "我已闭关三日。"),
      msg("m2", "owner", "main", "顾辰风，出来。"),
      msg("m3", "guchenfeng", "other-room", "别处的话不该来。"),
      msg("m4", "guchenfeng", "main", "重复内容"),
    ];
    const existing: ChatTurn[] = [
      { ...roleSpeechStreamingTurn("t9", "顾辰风", "重复内容"), id: "x" },
    ];
    const folded = selectRoleMessagesToFold({
      existing,
      messages,
      ownerIds: ["owner"],
      roles,
      roomId: "main",
    });
    // m1 only: m2 is the owner, m3 is another room, m4 duplicates a streamed line.
    expect(folded.map((entry) => entry.message.id)).toEqual(["m1"]);
    expect(folded[0]?.speakerName).toBe("顾辰风");
  });

  test("a posted role bubble is a settled role-speech card carrying the message id", () => {
    const turn = roleSpeechPostedTurn(msg("m1", "guchenfeng", "main", "我已闭关三日。"), "顾辰风");
    expect(turn.sourceMessageId).toBe("m1");
    if (turn.card?.variant !== "role-speech") {
      throw new Error("expected role-speech card");
    }
    expect(turn.card.streaming).toBe(false);
    expect(turn.card.detail).toBe("我已闭关三日。");
  });
});

describe("read-only config proposal → trust recovery card, not a dead error (F2)", () => {
  test("a create-world prompt routes to config (the family stageConfig requests)", () => {
    const route = routeIntent("创建一个有宗门对手师父的赛博朋克武侠世界", context());
    expect(route.mode).toBe("config");
  });

  test("the gate that blocks a config PROPOSAL is classified as trust-related", () => {
    // stageConfig's catch branches on exactly this flag to decide between staging a
    // one-tap trust recovery card vs. keeping the old dead error copy.
    const info = classifyBackendError(
      "Project is trusted for read-only inspection only; raise trust to run roles.",
    );
    expect(info.trustRelated).toBe(true);
  });

  test("the recovery proposal stageConfig stages is a one-tap trust card (no typed-confirmation dead end)", () => {
    // When the proposal request itself is denied there is no ConfigPatchProposal to
    // carry, so the card is a bare trust elevation; confirming it re-runs the
    // proposal after lifting trust (F2). The card + intro must read as a recovery
    // affordance, never the old "生成配置方案失败" dead end.
    const trustRetry: PendingProposal = { kind: "trust" };
    const card = previewCard(trustRetry);
    expect(card.variant).toBe("preview");
    expect(card.kind).toBe("trust");
    expect(card.detail).toContain("只读");
    expect(previewIntroText(trustRetry)).toContain("信任等级");
  });

  test("an unrelated proposal failure is NOT trust-related → keeps the plain dead-error path", () => {
    expect(classifyBackendError("Something exploded internally").trustRelated).toBe(false);
  });
});

/**
 * The core 'run a turn → see what was said' loop (P1). The hook delegates the
 * terminal decision to the pure `settleRunTurn`, so we assert its contract here:
 * the delta+completed SAME-batch race must yield EXACTLY ONE settled role bubble
 * (never zero, never a duplicate) and the status spinner must not get stuck.
 */
describe("run-turn finalization race → exactly one settled bubble (P1)", () => {
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
  const settleBase = {
    bubbleTurnId: undefined,
    denialReason: undefined,
    existing: [] as ChatTurn[],
    identity: "owner",
    messages: [] as Message[],
    ownerIds: ["owner"],
    roleName: "顾辰风",
    roles,
    roomId: "main",
    terminal: { kind: "completed" } as const,
    turnId: "t1",
  };

  test("delta + completed arriving together still materializes the reply bubble", () => {
    // bubbleTurnId is undefined (the streaming branch never ran) — this is the exact
    // batch that used to drop the role's line. The settle must produce a bubble.
    const settle = settleRunTurn({
      ...settleBase,
      events: [deltaEvent("t1", "我已闭关三日。")],
      streamed: "我已闭关三日。",
    });
    expect(settle.kind).toBe("settleNew");
    if (settle.kind !== "settleNew" || settle.turn.card?.variant !== "role-speech") {
      throw new Error("expected a settled role-speech bubble");
    }
    expect(settle.turn.card.detail).toBe("我已闭关三日。");
    expect(settle.turn.card.streaming).toBe(false);
  });

  test("the same reply is never rendered twice: a posted twin of a shown line settles to none", () => {
    const settle = settleRunTurn({
      ...settleBase,
      events: [],
      existing: [{ ...roleSpeechStreamingTurn("t1", "顾辰风", "我已闭关三日。"), id: "b1" }],
      messages: [msg("m1", "guchenfeng", "main", "我已闭关三日。")],
      streamed: undefined,
    });
    expect(settle.kind).toBe("none");
  });
});

describe("add-role de-dup is WORLD-SCOPED: dedupe reads the active world's members (P2)", () => {
  // stageConfig dedupes against `context.roles` — the ACTIVE world's member list —
  // NOT the whole project pool. These cases pin that scope: the same display name
  // short-circuits only when it is a member of the CURRENT world.
  test("云遥 already a member of the active world → the second add short-circuits", () => {
    const requested = extractAddRoleName("Add role 云遥");
    expect(requested).toBe("云遥");
    // `roles` here stands in for the active world's scoped member list.
    const existing = requested ? findRoleByDisplayName(roles, requested) : undefined;
    // An existing member means NO second 云遥 is minted — the hook short-circuits.
    expect(existing?.id).toBe("yunyao");
  });

  test("云遥 into a NEW EMPTY world stages a real proposal (not falsely rejected)", () => {
    const requested = extractAddRoleName("Add role 云遥");
    expect(requested).toBe("云遥");
    // The active world has no members yet — even though some OTHER world has a 云遥,
    // the world-scoped list is empty, so the dedupe does NOT short-circuit.
    const emptyWorldMembers: RoleSummary[] = [];
    expect(
      requested ? findRoleByDisplayName(emptyWorldMembers, requested) : undefined,
    ).toBeUndefined();
  });

  test("a fresh name has no match → the add-role proposal stages normally", () => {
    const requested = extractAddRoleName("Add role 沈墨");
    expect(requested).toBe("沈墨");
    expect(requested ? findRoleByDisplayName(roles, requested) : undefined).toBeUndefined();
  });

  test("a world-creation proposal is not an add-role → never triggers de-dup", () => {
    expect(extractAddRoleName("Create world 云岭修仙界")).toBeUndefined();
  });
});
