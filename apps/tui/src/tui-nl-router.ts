import {
  type AssistantConfigPlan,
  classifyIntent,
  DeterministicIntentRouter,
  type IntentRouter,
  type IntentRouterContext,
  type IntentStateOperation,
  type RealmIntent,
} from "@realm/assistant";
import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiCommand, TuiState, TuiWorldMode } from "./types.ts";

/**
 * Natural-language commander router for the TUI. Free-form operator text (the
 * primary surface per the NL-first vision) is classified into a {@link
 * RealmIntent} by `@realm/assistant`, then mapped onto the app's EXISTING action
 * methods — exactly the converged web flow — with every safety gate preserved.
 *
 * The default router is the DETERMINISTIC classifier so the fake runtime stays
 * key-free and end-to-end testable. A `ModelBackedIntentRouter` (real
 * OpenAI/Gemini) can be injected later without touching the mapping below.
 *
 * Design: most intents become a {@link TuiCommand} the app dispatches through
 * its normal `routeTuiCommand` chain, so config → patch-preview proposal, god →
 * God typed-confirm gate, run-turn → role-turn typed-confirm gate, inspect →
 * read (no gate), world-switch → switch — all reuse the existing wiring untouched.
 * Only two families have no TuiCommand twin and are surfaced as dedicated routes:
 *   - state-patch    → arms a NEW typed-confirm gate ({@link TuiPendingStatePatch})
 *                      that re-types the world id before writing via adminPatchState.
 *   - trust-elevation→ runs the live trust elevation.
 * Anything the classifier cannot turn into an actionable intent falls back to
 * `send`, so plain chatter still posts as a message (never a silent write).
 */

/** A state-patch the operator must confirm (by re-typing the world id) before it writes. */
export type TuiPendingStatePatch = {
  worldId: string;
  worldName: string;
  operations: IntentStateOperation[];
  reason: string;
};

/**
 * Outcome of routing one line of operator text. The app interprets each variant:
 *  - `command`   → dispatch through the existing command router (reuses all gates).
 *  - `statePatch`→ arm the typed-confirm state-patch gate.
 *  - `trust`     → run trust elevation (read, then reload).
 *  - `send`      → no actionable intent; post as a chat message (the fallback).
 */
export type NlRoute =
  | { kind: "command"; command: TuiCommand }
  | { kind: "statePatch"; pending: TuiPendingStatePatch }
  | { kind: "trust"; tier: "run-roles" }
  | { kind: "send" };

/** Builds the intent-router context from live TUI state (roles/rooms/worlds/ids). */
export function buildIntentContext(state: TuiState): IntentRouterContext {
  return {
    roles: state.roles.map((role) => ({ id: role.id, displayName: role.displayName })),
    rooms: state.rooms.map((room) => ({ id: room.id })),
    worlds: state.worlds.map((world) => ({ id: world.id, name: world.name })),
    ...(state.world ? { worldId: state.world.id } : {}),
    ...(state.room ? { defaultRoomId: state.room.id } : {}),
  };
}

/**
 * Intent router backed by the model-backed server endpoint (`/api/assistant/intent`
 * via the SDK), which is the PRIMARY routing path whenever a real provider is
 * configured. The server itself falls back to the deterministic classifier on any
 * model failure; this wrapper ALSO falls back to the local deterministic
 * classifier on any network/parse error so the TUI is never blocked offline.
 */
export class SdkIntentRouter implements IntentRouter {
  constructor(private readonly client: RealmHttpClient) {}

  async classify(goal: string, context: IntentRouterContext): Promise<RealmIntent> {
    try {
      const { intent } = await this.client.routeAssistantIntent({
        goal,
        roles: context.roles.map((role) => ({ id: role.id, displayName: role.displayName })),
        rooms: context.rooms.map((room) => ({ id: room.id })),
        worlds: (context.worlds ?? []).map((world) => ({ id: world.id, name: world.name })),
        ...(context.worldId ? { worldId: context.worldId } : {}),
        ...(context.defaultRoomId ? { defaultRoomId: context.defaultRoomId } : {}),
      });
      return intent as RealmIntent;
    } catch {
      return classifyIntent(goal, context);
    }
  }
}

/**
 * Classifies `input` against the current `state` and maps the resulting intent
 * to a concrete {@link NlRoute}. Pure orchestration: it performs no writes
 * itself — the app applies the route so the typed-confirm gates stay in charge of
 * every risky write.
 */
export async function routeNaturalLanguage(
  input: string,
  state: TuiState,
  router: IntentRouter = new DeterministicIntentRouter(),
): Promise<NlRoute> {
  const goal = input.trim();
  if (!goal) {
    return { kind: "send" };
  }
  const intent = await router.classify(goal, buildIntentContext(state));
  return mapIntentToRoute(intent, state);
}

/** Maps one {@link RealmIntent} to the matching {@link NlRoute}. */
function mapIntentToRoute(intent: RealmIntent, state: TuiState): NlRoute {
  switch (intent.kind) {
    case "config":
      return { kind: "command", command: configPlanToCommand(intent.plan) };
    case "god":
      return {
        kind: "command",
        command: {
          kind: "god",
          action: intent.action,
          targetRoleId: intent.targetRoleId,
          reason: intent.reason,
        },
      };
    case "run-turn":
      return { kind: "command", command: { kind: "runRole", roleId: intent.roleId } };
    case "state-patch":
      return statePatchRoute(intent, state);
    case "world-switch":
      return { kind: "command", command: { kind: "world", worldId: intent.worldId } };
    case "inspect":
      return inspectRoute(intent);
    case "trust-elevation":
      return { kind: "trust", tier: intent.tier };
  }
}

/** Config intent → the proposal command (createWorld | createRole) the app already stages. */
function configPlanToCommand(plan: AssistantConfigPlan): TuiCommand {
  if (plan.kind === "world") {
    return {
      kind: "createWorld",
      worldId: plan.world.id,
      name: plan.world.name,
      mode: normalizeWorldMode(plan.world.mode),
    };
  }
  return {
    kind: "createRole",
    roleId: plan.role.id,
    displayName: plan.role.displayName,
    model: plan.role.model ?? "default",
  };
}

const WORLD_MODES: ReadonlySet<TuiWorldMode> = new Set<TuiWorldMode>([
  "debate",
  "workflow",
  "game",
  "simulation",
  "sandbox",
]);

/** Clamp a planner mode string onto the TUI's known modes, defaulting to sandbox. */
function normalizeWorldMode(mode: string | undefined): TuiWorldMode {
  return mode && WORLD_MODES.has(mode as TuiWorldMode) ? (mode as TuiWorldMode) : "sandbox";
}

/**
 * Read signals that distinguish a genuine inspect ("现在世界什么状态？", "云遥知道
 * 哪些事？") from the classifier's catch-all fallback (which also yields `inspect`
 * for any unmatched text). The deterministic classifier collapses both, so here a
 * world-state inspect with NO question/read cue is treated as ambiguous chatter
 * and routed to `send` — plain talk posts as a message, never a spurious read.
 */
const READ_SIGNALS = [
  "?",
  "？",
  "什么",
  "怎么",
  "如何",
  "哪些",
  "多少",
  "是不是",
  "了吗",
  "吗",
  "状态",
  "查看",
  "看看",
  "知道",
  "记得",
  "了解",
  "status",
  "inspect",
  "what",
  "which",
  "show",
  "list",
  "how",
];

/**
 * Inspect intent → a read command (no gate): role memory when targeted, else world
 * state. A role-memory target is always an explicit read; a bare world-state
 * inspect must carry a read signal, otherwise it is ambiguous chatter → `send`.
 */
function inspectRoute(intent: Extract<RealmIntent, { kind: "inspect" }>): NlRoute {
  if (intent.target === "role-memory" && intent.roleId) {
    return { kind: "command", command: { kind: "memory", roleId: intent.roleId } };
  }
  const query = intent.query.toLowerCase();
  if (!READ_SIGNALS.some((signal) => intent.query.includes(signal) || query.includes(signal))) {
    return { kind: "send" };
  }
  return { kind: "command", command: { kind: "state" } };
}

/**
 * State-patch intent → the typed-confirm gate. Falls back to `send` when there is
 * no active world (a patch needs a world id to write against), so the operator's
 * text is never silently dropped.
 */
function statePatchRoute(
  intent: Extract<RealmIntent, { kind: "state-patch" }>,
  state: TuiState,
): NlRoute {
  const worldId = intent.worldId || state.world?.id;
  if (!worldId || !state.world) {
    return { kind: "send" };
  }
  return {
    kind: "statePatch",
    pending: {
      worldId,
      worldName: state.world.name,
      operations: intent.operations,
      reason: intent.reason,
    },
  };
}

// --- State-patch typed-confirm gate -----------------------------------------

export type StatePatchConfirmationDecision = "confirm" | "cancel" | "pending";

/** Decide a state-patch confirmation: re-typing the world id confirms; n/no/cancel cancels. */
export function decideStatePatchConfirmation(
  input: string,
  pending: TuiPendingStatePatch,
): StatePatchConfirmationDecision {
  const normalized = input.trim();
  if (normalized === pending.worldId) {
    return "confirm";
  }
  const lower = normalized.toLowerCase();
  if (lower === "n" || lower === "no" || lower === "cancel") {
    return "cancel";
  }
  return "pending";
}

/** Render the state-patch confirmation prompt (write summary + reason + type-to-confirm). */
export function formatStatePatchConfirmation(
  pending: TuiPendingStatePatch,
  dict: TuiDictionary,
): string {
  return [
    dict.statePatchPrompt(pending.worldName, summarizeOperations(pending.operations)),
    dict.statePatchReasonLine(pending.reason),
    dict.confirmTypeWorldId(pending.worldId),
  ].join(" ");
}

/** One-line, human-readable summary of the operations a patch will apply. */
export function summarizeOperations(operations: IntentStateOperation[]): string {
  return operations.map(describeOperation).join("; ");
}

function describeOperation(operation: IntentStateOperation): string {
  if (operation.op === "increment") {
    return `${operation.path} += ${operation.amount}`;
  }
  return `${operation.op} ${operation.path} = ${stringifyValue(operation.value)}`;
}

function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Writes the confirmed state patch through the same admin endpoint the web uses. */
export async function applyStatePatchFromTui(
  client: RealmHttpClient,
  pending: TuiPendingStatePatch,
): Promise<void> {
  await client.adminPatchState({
    worldId: pending.worldId,
    operations: pending.operations,
    reason: pending.reason,
    idempotencyKey: `tui-nl-state-${Date.now()}`,
  });
}

/**
 * Collaborators the NL layer needs from {@link RealmTuiApp}. Kept as one small
 * interface (rather than importing the class) so this router stays decoupled from
 * the app's private internals. The app owns the typed-confirm gates and dispatch;
 * this module only classifies text, arms the state-patch gate, and resolves it.
 * One host object serves both the free-form entry point and the gate resolver.
 */
export type NlHost = {
  readonly client: RealmHttpClient;
  readonly dictionary: TuiDictionary;
  load(): Promise<TuiState>;
  reload(): Promise<void>;
  resetPendings(): void;
  setPendingStatePatch(pending: TuiPendingStatePatch | undefined): void;
  elevateTrust(tier: "run-roles"): Promise<string>;
  dispatchCommand(command: TuiCommand): Promise<string>;
};

/**
 * Top-level NL entry point the app delegates to for a free-form line. Returns the
 * notice when an actionable intent was handled, or `undefined` so the caller can
 * fall back to posting the text as a chat message. Every risky write still flows
 * through its existing typed-confirm gate (the app arms / dispatches them).
 */
export async function handleNaturalLanguage(
  host: NlHost,
  input: string,
  router?: IntentRouter,
): Promise<string | undefined> {
  // Default to the SDK-backed router (model-backed server endpoint, PRIMARY path)
  // built from the host's client, which itself falls back to the deterministic
  // classifier on any failure. An explicit `router` (e.g. tests) overrides it.
  const resolvedRouter = router ?? new SdkIntentRouter(host.client);
  const route = await routeNaturalLanguage(input, await host.load(), resolvedRouter);
  if (route.kind === "send") {
    return undefined;
  }
  if (route.kind === "trust") {
    const notice = await host.elevateTrust(route.tier);
    await host.reload();
    return notice;
  }
  if (route.kind === "statePatch") {
    host.resetPendings();
    host.setPendingStatePatch(route.pending);
    return formatStatePatchConfirmation(route.pending, host.dictionary);
  }
  return host.dispatchCommand(route.command);
}

/**
 * Resolves an armed state-patch confirmation against `input`. Re-typing the world
 * id writes the patch (then reloads); n/no/cancel cancels; anything else re-prompts.
 * Mirrors the God-action gate so a write is never executed by an accidental Enter.
 */
export async function resolveStatePatchConfirmation(
  host: NlHost,
  pending: TuiPendingStatePatch,
  input: string,
): Promise<string> {
  const decision = decideStatePatchConfirmation(input, pending);
  if (decision === "confirm") {
    host.setPendingStatePatch(undefined);
    await applyStatePatchFromTui(host.client, pending);
    await host.reload();
    return host.dictionary.statePatchApplied(pending.worldName);
  }
  if (decision === "cancel") {
    host.setPendingStatePatch(undefined);
    return host.dictionary.statePatchCancelled;
  }
  return formatStatePatchConfirmation(pending, host.dictionary);
}
