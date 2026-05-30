import type { AssistantIntentResponse } from "@realm/api-contract";
import { declaresWorldRule, extractWorldRuleBody, type RealmIntent } from "@realm/assistant";
import type { RealmHttpClient } from "@realm/client-sdk";
import {
  type GodChatContext,
  type RouteResult,
  roleName,
  routeIntent,
  worldListText,
} from "@/state/god-chat-model.ts";

/**
 * PRIMARY natural-language routing for the God-chat window.
 *
 * The model-backed router (server `POST /api/assistant/intent`) is the primary
 * interpretation path whenever a real provider is configured; the server itself
 * falls back to the deterministic classifier on any model failure, so the SDK call
 * always resolves to a coherent {@link RealmIntent}. This module:
 *  1. calls the SDK, then maps the returned intent through the EXISTING
 *     {@link routeIntent} RouteResult shaping (so every downstream branch —
 *     noop / inspect / world-switch / config / stage — is unchanged), and
 *  2. on ANY network/parse/timeout failure falls back to the synchronous
 *     deterministic {@link routeIntent} so the operator is NEVER blocked.
 *
 * NO-QUESTION-WRITE invariant (defense-in-depth): the server already guards this,
 * but a misbehaving stub could return a write for an interrogative goal. The web
 * layer RE-APPLIES the guard by reusing the EXISTING deterministic `routeIntent`:
 * when the model returns a write but the deterministic router does NOT also stage a
 * write for the same text (i.e. it reads the text as a question / non-imperative,
 * routing it to inspect or a calm noop), the deterministic result wins. A question
 * can therefore never stage a write end to end — without duplicating the
 * interrogative heuristics, which live behind `routeIntent`.
 *
 * SET-RULE-OVER-MODEL invariant (write A vs write B): a real provider (verified on
 * gemini-2.5-flash driving boardroom-saga) mis-classifies a WORLD-RULE declaration
 * ("设定规则：每推进一个季度，现金跑道减少一个季度" / "给世界加一条规则…") as `add-role`
 * (rule text stuffed into a role name → a `config` plan), `create-world` (also a
 * `config` route), or a `god` action — confidently writing the WRONG thing. The
 * guardrails catch it (typed-confirm / preview), but the classification is wrong.
 *
 * The earlier fix only path-corrected when the DETERMINISTIC router itself had
 * already staged a `/metaState/rules` state-patch — but for these phrasings the
 * deterministic router can land elsewhere ("设定规则：…减少…" is stolen into a generic
 * `减少` state-patch under `/privateState/roles/world/conditions`; "规则：…陈牧…" names
 * a role so the `!role`-gated world-rule branch defers to `config`). When the
 * override depended on a deterministic `/metaState/rules` stage, it never fired and
 * the model's wrong write won.
 *
 * The fix no longer depends on deterministic routing first reaching a state-patch.
 * When {@link declaresWorldRule} (the classifier's pure, marker-only, non-question
 * predicate) reads `text` as an EXPLICIT world-rule, we SYNTHESIZE a `/metaState/rules`
 * append route — extracting the rule BODY via the classifier's own
 * {@link extractWorldRuleBody} so the recovered rule stores the identical body the
 * classifier's direct rule branch stores (one source of truth, never a regex in the
 * web layer). An already-`/metaState/rules` deterministic patch is honoured as-is
 * (idempotent). This is strictly narrower than NO-QUESTION-WRITE: `declaresWorldRule`
 * is false for questions ("现在世界设定了哪些规则？") and for any sentence without an
 * explicit rule marker (ordinary attribute patches / create-world never trip it), so
 * we never turn a write A into a spurious write B.
 */

/** Default per-request timeout for the intent endpoint (deterministic fallback after). */
const INTENT_TIMEOUT_MS = 8_000;

/** Model intent kinds that perform a WRITE (mutate state / advance / switch / elevate). */
const WRITE_INTENT_KINDS: ReadonlySet<AssistantIntentResponse["kind"]> = new Set([
  "god",
  "state-patch",
  "run-turn",
  "world-switch",
  "trust-elevation",
]);

/** RouteResult modes that COMMIT or stage a write (vs. a read/answer/noop). */
const WRITE_ROUTE_MODES: ReadonlySet<RouteResult["mode"]> = new Set(["stage", "world-switch"]);

/** The world-level meta container the set-rule branch appends rule text into. */
const WORLD_RULES_POINTER = "/metaState/rules";

/**
 * Recover a WORLD-RULE set-rule route when the model mis-classified an explicit
 * rule declaration. Returns the route to honour, or undefined when `text` is not an
 * explicitly-marked world rule (so a plain attribute change / question / config is
 * left untouched).
 *
 * Two cases:
 *  1. The deterministic router already staged a `/metaState/rules` patch — honour it
 *     as-is (idempotent: the classifier reached the rule branch on its own and has
 *     already stripped the marker, so the stored value is the BODY).
 *  2. Otherwise, if {@link declaresWorldRule} reads `text` as an EXPLICIT world rule,
 *     SYNTHESIZE a `/metaState/rules` append — independent of where deterministic
 *     routing landed (config / a stray `减少` per-role-condition patch / a role-named
 *     rule that the `!role`-gated branch deferred to config). The rule BODY comes from
 *     the classifier's {@link extractWorldRuleBody}, so the synthesized rule stores the
 *     identical body the classifier's direct rule branch stores — never a regex in the
 *     web layer, never a "设定规则：…"-prefixed copy on one path and the bare body on
 *     another.
 *
 * `declaresWorldRule` is marker-only and question-safe (false for interrogatives and
 * for any sentence without an explicit rule marker), so this never converts an
 * ordinary write A into a spurious world-rule write B.
 */
function worldRuleOverride(
  text: string,
  ctx: GodChatContext,
  deterministic: RouteResult,
): RouteResult | undefined {
  // Case 1 — deterministic already reached /metaState/rules: trust it verbatim.
  if (
    deterministic.mode === "stage" &&
    deterministic.proposal.kind === "state-patch" &&
    deterministic.proposal.operations.some((op) => op.path === WORLD_RULES_POINTER)
  ) {
    return deterministic;
  }
  // Case 2 — an explicit, non-question world-rule the model got wrong: synthesize
  // the /metaState/rules append regardless of where deterministic routing landed.
  if (!declaresWorldRule(text)) {
    return undefined;
  }
  const worldId = ctx.worldId;
  if (!worldId) {
    // No active world to write the rule into — fall back to the model/deterministic
    // shaping (which surfaces the calm "先选择一个世界" noop) rather than synthesizing
    // a patch with no target.
    return undefined;
  }
  const ruleBody = extractWorldRuleBody(text);
  return {
    mode: "stage",
    proposal: {
      kind: "state-patch",
      worldId,
      operations: [{ op: "append", path: WORLD_RULES_POINTER, value: ruleBody }],
      reason: ruleBody,
    },
  };
}

/**
 * Route `text` for the God-chat `submit`. Returns the SAME {@link RouteResult}
 * shape the synchronous deterministic router produces, so the hook's submit can
 * `await` this with no other change to its downstream branching.
 */
export async function routeIntentPrimary(
  text: string,
  ctx: GodChatContext,
  client: RealmHttpClient,
): Promise<RouteResult> {
  const goal = text.trim();
  try {
    const { intent } = await withTimeout(
      client.routeAssistantIntent(buildIntentRequest(goal, ctx)),
      INTENT_TIMEOUT_MS,
    );
    // Cross-checks against the deterministic router. We compute it ONCE and reuse
    // it for both guards below — it is the same pure call `routeIntent` either way.
    // (Skipped when the model already returned a `state-patch`: that path is shaped
    // directly below and the set-rule cross-check would be idempotent.)
    if (intent.kind !== "state-patch") {
      const deterministic = routeIntent(text, ctx);

      // SET-RULE-OVER-MODEL (write A vs write B): the model returned a non-state-
      // patch intent (config / add-role→config / create-world→config / god / …) but
      // `text` is an EXPLICIT world-rule declaration. Recover the world-rule write so
      // "设定规则：…" / "给世界加一条规则…" is never mis-written as a role/world/god
      // action — synthesizing the /metaState/rules append even when the deterministic
      // router itself did not stage a rule patch (it may have been stolen into config
      // or a generic per-role-condition state-patch).
      const setRule = worldRuleOverride(text, ctx, deterministic);
      if (setRule) {
        return setRule;
      }

      // Defense-in-depth NO-QUESTION-WRITE: a question must never become a write,
      // even when the (possibly misbehaving) server says so. When the model returns
      // a write, cross-check the deterministic router; if IT does not also stage a
      // write for the same text (a question routes to inspect / a calm noop), the
      // deterministic result wins. This reuses `routeIntent`'s interrogative
      // heuristics rather than re-implementing them.
      if (WRITE_INTENT_KINDS.has(intent.kind) && !WRITE_ROUTE_MODES.has(deterministic.mode)) {
        return deterministic;
      }
    }
    return shapeModelIntent(intent, ctx);
  } catch {
    // Network / parse / timeout — fall back to the synchronous deterministic
    // router so the operator is never blocked by an unavailable model.
    return routeIntent(text, ctx);
  }
}

/** Build the `/api/assistant/intent` request body from the chat context. */
export function buildIntentRequest(goal: string, ctx: GodChatContext) {
  return {
    goal,
    roles: ctx.roles.map((role) => ({ id: role.id, displayName: role.displayName })),
    rooms: ctx.rooms.map((room) => ({ id: room.id })),
    worlds: (ctx.worlds ?? []).map((world) => ({ id: world.id, name: world.name })),
    ...(ctx.worldId ? { worldId: ctx.worldId } : {}),
    ...(ctx.roomId ? { defaultRoomId: ctx.roomId } : {}),
  };
}

/**
 * Map a model-returned {@link RealmIntent} onto the same {@link RouteResult} the
 * deterministic {@link routeIntent} produces. Reuses the exported pure helpers
 * (`roleName`, `worldListText`) and applies the identical guards (no world / no
 * room → calm noop) so the model path and the deterministic path stage IDENTICAL
 * downstream shapes — the hook below never sees a difference.
 */
function shapeModelIntent(intent: AssistantIntentResponse, ctx: GodChatContext): RouteResult {
  switch (intent.kind) {
    case "inspect":
      // The contract's inspect shape is structurally the assistant's inspect
      // intent (target/roleId/query); narrow it for the RouteResult.
      return {
        intent: intent as Extract<RealmIntent, { kind: "inspect" }>,
        mode: "inspect",
      };
    case "config":
      return { goal: intent.goal, mode: "config" };
    case "trust-elevation":
      return { mode: "stage", proposal: { kind: "trust" } };
    case "god": {
      if (!ctx.worldId) {
        return { mode: "noop", text: NO_WORLD_TEXT };
      }
      return {
        mode: "stage",
        proposal: {
          action: intent.action,
          kind: "god",
          reason: intent.reason,
          targetRoleId: intent.targetRoleId,
          targetRoleName: roleName(ctx.roles, intent.targetRoleId),
          worldId: ctx.worldId,
        },
      };
    }
    case "state-patch": {
      const worldId = intent.worldId || ctx.worldId;
      if (!worldId) {
        return { mode: "noop", text: NO_WORLD_TEXT };
      }
      return {
        mode: "stage",
        proposal: {
          kind: "state-patch",
          operations: intent.operations,
          reason: intent.reason,
          worldId,
        },
      };
    }
    case "run-turn": {
      const roomId = intent.roomId || ctx.roomId;
      if (!ctx.worldId || !roomId) {
        return { mode: "noop", text: NO_ROOM_TEXT };
      }
      return {
        mode: "stage",
        proposal: {
          kind: "run-turn",
          roleId: intent.roleId,
          roleName: roleName(ctx.roles, intent.roleId),
          roomId,
          worldId: ctx.worldId,
        },
      };
    }
    case "world-switch": {
      const worlds = ctx.worlds ?? [];
      const target = worlds.find((world) => world.id === intent.worldId);
      if (!target) {
        return { mode: "noop", text: worldListText(worlds) };
      }
      if (ctx.worldId === target.id) {
        return { mode: "noop", text: `已经在「${target.name}」里了。` };
      }
      return { mode: "world-switch", worldId: target.id, worldName: target.name };
    }
  }
}

// Mirror the two calm-noop strings from `god-chat-model.ts` (not exported there to
// keep that module's surface tight). Kept identical so the model path and the
// deterministic path read the same to the operator.
const NO_WORLD_TEXT = "还没有进入任何世界，先创建或选择一个世界再下达指令吧。";
const NO_ROOM_TEXT = "当前世界还没有可发言的房间，先创建一个房间再让角色行动。";

/** Reject after `ms` so a hung request degrades to the deterministic fallback. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("intent route timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
