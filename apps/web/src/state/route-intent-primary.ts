import type { AssistantIntentResponse } from "@realm/api-contract";
import type { RealmIntent } from "@realm/assistant";
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
    // Defense-in-depth NO-QUESTION-WRITE: a question must never become a write,
    // even when the (possibly misbehaving) server says so. When the model returns
    // a write, cross-check the deterministic router; if IT does not also stage a
    // write for the same text (a question routes to inspect / a calm noop), the
    // deterministic result wins. This reuses `routeIntent`'s interrogative
    // heuristics rather than re-implementing them.
    if (WRITE_INTENT_KINDS.has(intent.kind)) {
      const deterministic = routeIntent(text, ctx);
      if (!WRITE_ROUTE_MODES.has(deterministic.mode)) {
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
