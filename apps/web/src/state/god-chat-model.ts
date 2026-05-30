import type { ConfigPatchProposal, RoleSummary } from "@realm/api-contract";
import {
  classifyIntent,
  type IntentRouterContext,
  type IntentStateOperation,
  type RealmIntent,
} from "@realm/assistant";

// Re-export the runtime helpers (F1 streaming + reconciliation, F3 backend-error
// mapping, F4 proposal localization) so existing import sites keep targeting
// `god-chat-model.ts`. The implementations live in `god-chat-runtime.ts` to keep
// both files under the 500-line budget.
export {
  answerWorldState,
  type BackendErrorInfo,
  classifyBackendError,
  extractAddRoleName,
  findRoleByDisplayName,
  findTurnTerminal,
  localizeProposalSummary,
  localizeProposalTitle,
  roleSpeechPostedTurn,
  roleSpeechSettledTurn,
  roleSpeechStreamingTurn,
  runTurnAcceptedFeedback,
  runTurnFailureFeedback,
  type SettleRunTurnResult,
  selectRoleMessagesToFold,
  settleRunTurn,
  type TurnTerminal,
} from "@/state/god-chat-runtime.ts";

/**
 * Pure logic for the God-chat controller (`useGodChat`). Kept React-free and
 * network-free so the routing, request-shaping, read-only inspect answering, and
 * zh-CN feedback composition are all deterministically unit-testable against the
 * fake runtime. The hook is a thin orchestrator over these functions.
 *
 * Design contract:
 *  - `inspect` is the ONLY read-only family: it resolves to a system answer
 *    immediately, no confirm step.
 *  - `config | god | state-patch | run-turn` are write-bearing: they are staged
 *    as a `pendingProposal` card and only committed by `confirmProposal`. No
 *    write ever happens without an explicit confirm (Don Norman: error
 *    prevention via preview-before-write).
 */

/**
 * Who a turn belongs to. `operator` = the human; `system` = God / the assistant.
 * In-world role speech (F1) is folded into a `system` turn carrying a
 * `role-speech` card (a named speaker bubble) — this keeps the existing
 * `OperatorMessage` variant contract intact while still surfacing role talk in the
 * NL conversation so the operator never has to open "高级" to see a role speak.
 */
export type ChatRole = "operator" | "system";

/**
 * What a staged card will do when confirmed. The four write families plus
 * `trust`, the inline trust-elevation confirm card (F2): a read-only project
 * cannot run roles / write, so we surface a one-tap "提升到运行角色" card right in
 * the conversation instead of sending the operator to the advanced panel.
 */
export type ChatCardKind = "config" | "god" | "state-patch" | "run-turn" | "trust";

/** A non-config write request, fully shaped against the SDK before confirm. */
export type StagedWrite =
  | {
      kind: "god";
      worldId: string;
      action: "kill" | "mute" | "revive";
      targetRoleId: string;
      targetRoleName: string;
      reason: string;
    }
  | {
      kind: "state-patch";
      worldId: string;
      operations: IntentStateOperation[];
      reason: string;
    }
  | {
      kind: "run-turn";
      worldId: string;
      roomId: string;
      roleId: string;
      roleName: string;
    }
  | {
      /**
       * Inline trust elevation (read-only → run-roles). Either staged directly
       * from a trust-elevation intent, or appended as a recovery CTA after a
       * write was denied by the trust gate. `retry` carries the original denied
       * proposal so confirming elevation can auto-resume that exact write (F2).
       */
      kind: "trust";
      retry?: PendingProposal;
    };

/**
 * A staged config proposal returned by `proposeAssistantConfig`, held for review.
 * The proposal carries its own risk level + typed-confirmation requirement which
 * the UI surfaces before the operator confirms the write.
 */
export type StagedConfig = {
  kind: "config";
  goal: string;
  proposal: ConfigPatchProposal;
};

/** A proposal awaiting the operator's confirm. Union of config + non-config writes. */
export type PendingProposal = StagedConfig | StagedWrite;

/**
 * Inline card attached to a turn.
 *  - `preview`: a staged action awaiting confirm.
 *  - `result`: a finished action (config / god / state-patch / run-turn / inspect).
 *  - `role-speech`: an in-world character's streamed/posted line, rendered as a
 *    named speaker bubble so a role talking shows up right in the NL conversation
 *    (F1). `streaming` flags a bubble still growing from `turn.delta` tokens.
 */
export type ChatCard =
  | { variant: "preview"; kind: ChatCardKind; title: string; detail: string }
  | {
      variant: "result";
      kind: ChatCardKind | "inspect";
      title: string;
      detail: string;
      /**
       * Optional pretty-printed raw state JSON for an `inspect` result. When set,
       * the card renders it behind a collapsed disclosure BELOW the humanized
       * zh-CN tree — so `detail` stays the authoritative human reading and the raw
       * field dump (alive/muted/derivedState…) never leaks inline into the prose.
       */
      rawJson?: string;
    }
  | {
      variant: "role-speech";
      // `kind` is fixed to "run-turn" (role speech is a run-turn output). It is
      // never read for role-speech rendering — the card UI branches on `variant`
      // first — but keeping the field present lets every ChatCard share a uniform
      // `{ variant; kind }` shape so consumers that index by kind stay type-safe.
      kind: "run-turn";
      speakerName: string;
      detail: string;
      streaming: boolean;
    };

export type ChatTurn = {
  id: string;
  role: ChatRole;
  text: string;
  card?: ChatCard;
  /**
   * For a streaming role-speech turn: the backend turn id its bubble is bound to.
   * The hook grows the bubble from `turn.delta` events with this id and finalizes
   * it on `turn.completed`. Undefined once settled, or for a posted (non-streamed)
   * role message reconciled from the room feed.
   */
  streamingTurnId?: string;
  /**
   * For a role-speech turn reconciled from a posted room message: the message id,
   * used to dedupe so a line that also arrived as a completed stream is not shown
   * twice (F1).
   */
  sourceMessageId?: string;
  /**
   * For the transient "回合进行中" status turn pushed when a role turn is accepted:
   * the backend turn id it is bound to. The activeRunTurn effect REPLACES this turn
   * in place with the settled role-speech bubble (or removes it) once the turn
   * reaches a terminal state — so the spinner never leaks as a permanent card.
   */
  statusTurnId?: string;
};

/** Minimal world/role/room context the router + inspect answerer consume. */
export type GodChatContext = {
  worldId: string | undefined;
  roomId: string | undefined;
  roles: RoleSummary[];
  rooms: { id: string }[];
  /**
   * Every world in the project (id + user-facing name). Used to resolve a
   * world-switch command's named target ("切换到云岭修仙界") to a concrete id, and
   * to list the choices when the named world is unknown. Optional so existing
   * fixtures/callers stay valid; treated as empty when absent (no switch can
   * resolve, the hook answers calmly).
   */
  worlds?: { id: string; name: string }[];
  worldState: { version: number; state: Record<string, unknown> } | undefined;
};

/** Build the deterministic intent-router context from app state. */
export function buildRouterContext(ctx: GodChatContext): IntentRouterContext {
  return {
    defaultRoomId: ctx.roomId,
    roles: ctx.roles.map((role) => ({ displayName: role.displayName, id: role.id })),
    rooms: ctx.rooms.map((room) => ({ id: room.id })),
    worldId: ctx.worldId,
    worlds: (ctx.worlds ?? []).map((world) => ({ id: world.id, name: world.name })),
  };
}

/** Resolve a role's display name, falling back to its id when unknown. */
export function roleName(roles: RoleSummary[], roleId: string): string {
  return roles.find((role) => role.id === roleId)?.displayName ?? roleId;
}

/**
 * Classify operator text and either resolve a read-only inspect answer or shape
 * a write into a staged proposal. Returns a discriminated result the hook acts
 * on: `inspect` answers immediately, `stage` awaits confirm, `noop` (e.g. an
 * inspect with no world loaded) reports a calm zh-CN explanation.
 */
export type RouteResult =
  | { mode: "inspect"; intent: Extract<RealmIntent, { kind: "inspect" }> }
  | { mode: "stage"; proposal: StagedWrite }
  | { mode: "config"; goal: string }
  /**
   * Switch the active world. `worldId` is already resolved (name→id) by the
   * classifier; `worldName` is carried for the inline confirmation card so the
   * hook does not re-look it up. The switch executes directly via
   * `app.selectWorld` — it is not a staged write — so the operator gets immediate
   * feedback and the rail repopulates.
   */
  | { mode: "world-switch"; worldId: string; worldName: string }
  | { mode: "noop"; text: string };

/**
 * Trust-elevation phrasings (F2). Matched at the TOP of `routeIntent` — BEFORE
 * the assistant classifier — so "提升信任 / 允许运行角色 / 解除只读" is never
 * mis-routed into a config-proposal. zh-CN first with English aliases. W2 owns the
 * classifier in @realm/assistant; we keep this guard local so the trust path works
 * regardless of whether the classifier grows a dedicated trust intent.
 */
const TRUST_ELEVATION_KEYWORDS = [
  "提升信任",
  "提高信任",
  "信任等级",
  "允许运行角色",
  "允许运行",
  "允许写入",
  "解除只读",
  "退出只读",
  "关闭只读",
  "解锁写入",
  "raise trust",
  "elevate trust",
  "allow write",
  "run roles",
  "exit read-only",
];

/** True when the operator is asking, in plain language, to leave read-only mode. */
export function isTrustElevationRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return TRUST_ELEVATION_KEYWORDS.some(
    (needle) => text.includes(needle) || normalized.includes(needle.toLowerCase()),
  );
}

export function routeIntent(text: string, ctx: GodChatContext): RouteResult {
  // Trust elevation is checked first so it is never swallowed by the config
  // classifier (which would otherwise treat "提升信任等级" as a world/rule edit).
  if (isTrustElevationRequest(text)) {
    return { mode: "stage", proposal: { kind: "trust" } };
  }
  const intent = classifyIntent(text, buildRouterContext(ctx));
  // Unknown-world guard: the operator clearly tried to SWITCH worlds ("切换到X")
  // but the classifier could not resolve a name, so it fell through to inspect (no
  // keyword) or config (a stray "世界" keyword with no creation verb). Answer
  // calmly with the available worlds instead of silently inspecting or minting a
  // new world — a clear switch command must never silently inspect
  // (NO-NL-WORLD-SWITCH). We exclude genuine creation ("创建/新建/加…") so
  // "新建一个修真世界" still routes to config.
  const unresolvedSwitch =
    isWorldSwitchAttempt(text) &&
    !hasCreationVerb(text) &&
    (intent.kind === "inspect" || intent.kind === "config");
  if (unresolvedSwitch) {
    return { mode: "noop", text: worldListText(ctx.worlds ?? []) };
  }
  switch (intent.kind) {
    case "inspect":
      return { intent, mode: "inspect" };
    case "config":
      return { goal: intent.goal, mode: "config" };
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
        // The classifier resolved an id that is no longer in the roster (a race
        // with a deletion); list what is available rather than switch to a ghost.
        return { mode: "noop", text: worldListText(worlds) };
      }
      // Already on this world → no-op feedback, never a redundant reload.
      if (ctx.worldId === target.id) {
        return { mode: "noop", text: `已经在「${target.name}」里了。` };
      }
      return { mode: "world-switch", worldId: target.id, worldName: target.name };
    }
    case "trust-elevation":
      // The classifier can also surface trust elevation directly. The local
      // `isTrustElevationRequest` guard above catches the common phrasings first,
      // but routing the intent here too keeps the switch exhaustive and stages the
      // same one-tap trust card (read-only → run-roles).
      return { mode: "stage", proposal: { kind: "trust" } };
  }
}

/**
 * Phrasings that mark a world-switch *attempt* ("切换到X / 打开X / 进入X"). When one
 * is present but the classifier resolved NO world (the named world is unknown),
 * we answer calmly listing the available worlds instead of silently inspecting —
 * inspect is the last resort, never the catch-all for a clear switch command.
 * Kept local + minimal (a subset of the classifier's markers): only the
 * unambiguous "切换/打开/进入/前往" forms, so a passing "去" in a normal sentence
 * never triggers the world list.
 */
const WORLD_SWITCH_ATTEMPT_MARKERS = [
  "切换到",
  "切换至",
  "切到",
  "切换世界",
  "打开",
  "进入",
  "前往",
  "回到",
  "switch to",
  "switch world",
  "open world",
  "enter world",
];

/** True when the text reads as a world-switch attempt (marker present). */
export function isWorldSwitchAttempt(text: string): boolean {
  const normalized = text.toLowerCase();
  return WORLD_SWITCH_ATTEMPT_MARKERS.some(
    (marker) => text.includes(marker) || normalized.includes(marker.toLowerCase()),
  );
}

/**
 * Creation verbs that mean "make a NEW world/role", not switch into an existing
 * one. Used to keep "新建一个修真世界" routing to config even though it carries the
 * "世界" config keyword and could otherwise be caught by the unresolved-switch
 * fallback. Kept minimal — only unambiguous creation markers.
 */
const CREATION_VERBS = ["创建", "新建", "建一个", "建个", "新增", "加一个", "create", "new "];

/** True when the text asks to CREATE something (so it is not a world switch). */
function hasCreationVerb(text: string): boolean {
  const normalized = text.toLowerCase();
  return CREATION_VERBS.some(
    (verb) => text.includes(verb) || normalized.includes(verb.toLowerCase()),
  );
}

/** Calm zh-CN line listing the worlds the operator can switch into. */
export function worldListText(worlds: { id: string; name: string }[]): string {
  if (worlds.length === 0) {
    return "现在还没有任何世界，先创建一个吧。";
  }
  const names = worlds.map((world) => `「${world.name}」`).join("、");
  return `没找到你说的那个世界。现在有这些世界可以进入：${names}。`;
}

const NO_WORLD_TEXT = "还没有进入任何世界，先创建或选择一个世界再下达指令吧。";
const NO_ROOM_TEXT = "当前世界还没有可发言的房间，先创建一个房间再让角色行动。";

// --- Read-only inspect answering --------------------------------------------

/**
 * Compose the zh-CN answer for a role-memory inspect from the SDK read result.
 * Read-only. `content` is the raw memory text the backend returned (may be
 * empty when the role has formed no memories yet).
 */
export function answerRoleMemory(
  roles: RoleSummary[],
  roleId: string,
  content: string,
): { text: string; card: ChatCard } {
  const name = roleName(roles, roleId);
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    const text = `${name}目前还没有形成任何记忆。`;
    return { card: inspectCard(`${name}的记忆`, text), text };
  }
  const text = `${name}记得这些事情：`;
  return { card: inspectCard(`${name}的记忆`, trimmed), text };
}

function inspectCard(title: string, detail: string): ChatCard {
  return { detail, kind: "inspect", title, variant: "result" };
}

// --- Preview + result feedback ----------------------------------------------

// Preview-card / intro / result-feedback composition + the state-patch JSON-pointer
// humanizer live in `god-chat-feedback.ts` to keep this file under the 500-line
// budget. Re-exported here so existing import sites that reach for these through
// the model layer keep working.
export {
  configResultFeedback,
  describeOperations,
  godResultFeedback,
  humanizePatchPath,
  isWriteCommitted,
  previewCard,
  previewIntroText,
  statePatchResultFeedback,
} from "@/state/god-chat-feedback.ts";
