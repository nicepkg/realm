import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import { detectWorldStructureClues, inferConfigPlanFromGoal } from "@realm/assistant";
import type { ChatCard, ChatTurn, StagedConfig } from "@/state/god-chat-model.ts";
import { extractCreatedWorldId } from "@/state/god-chat-write.ts";

/**
 * Pure, React-free helpers for the God-chat brain (`use-god-chat.ts`).
 *
 * Split out so the hook file stays under the 500-line file-size guard while every
 * load-bearing branch decision (world-scoped role filtering, transcript scope
 * keys, created-world resolution, draft-restore + structure-follow-up copy) stays
 * deterministically unit-testable without rendering the hook. `use-god-chat.ts`
 * re-exports the ones consumed by tests so existing import paths keep working.
 */

/**
 * F3 — restrict the NL context's role list to the active world's MEMBERS.
 *
 * `app.state.roles` is the project-wide role POOL; the right rail + the chat's
 * "现在世界里有谁" answer must instead reflect who is actually IN the selected
 * world (its `roleIds`), so an empty freshly-created world reads as empty in BOTH
 * the state panel and the chat — not silently populated with pool roles it never
 * contained. The pool order is preserved (filter, don't reorder) so the list is
 * stable. Pure so the semantics are unit-testable and the filter never drifts
 * from /api/worlds.
 *
 * `world` (= the RESOLVED `WorldSummary` from `resolveSelectedWorld`) is undefined
 * in TWO distinct situations that must NOT be conflated:
 *   (a) genuinely no world is selected (true manager view) — `selectedWorldId` is
 *       unset, and the full project pool IS the right answer.
 *   (b) a concrete world IS selected (`selectedWorldId` set) but its summary has
 *       not yet landed in the loaded roster (just-created / mid-reload —
 *       `resolveSelectedWorld` deliberately returns undefined here rather than
 *       impersonating `worlds[0]`). Here the roster is world-scoped, we simply do
 *       not have its members yet, so the honest answer is EMPTY (loading) — NOT
 *       the global pool, which would ghost the prior world's cast beside an empty
 *       世界状态 角色 panel (the bug this fixes).
 *
 * `selectedWorldId` disambiguates the two: a present id with an unresolved `world`
 * is case (b) → `[]`; only an absent id with an unresolved `world` is case (a) →
 * full pool. The id is used purely as a "a world is selected" presence flag; the
 * member filter still keys off the resolved `world.roleIds`.
 */
export function worldScopedRoles(
  pool: RoleSummary[],
  world: WorldSummary | undefined,
  selectedWorldId: string | undefined,
): RoleSummary[] {
  if (!world) {
    // Case (b): selected-but-unresolved → empty (loading), never the global pool.
    // Case (a): no selection at all → the project-wide manager roster.
    return selectedWorldId ? [] : pool;
  }
  const memberIds = new Set(world.roleIds);
  return pool.filter((role) => memberIds.has(role.id));
}

/**
 * Compose the transcript-persistence scope key from (world, identity). Ids never
 * contain a space (idSchema), so a space is an unambiguous separator.
 */
export function transcriptScopeKey(worldId: string | undefined, identity: string): string {
  return `${worldId ?? "__none__"} ${identity}`;
}

/** Split a scope key back into its (worldId, identity) parts. */
export function parseScopeKey(key: string): [string | undefined, string] {
  const [worldPart, identity] = key.split(" ");
  return [worldPart === "__none__" ? undefined : worldPart, identity ?? "owner"];
}

/**
 * Resolve the id of the world a confirmed config write created, preferring the
 * applied patch path and falling back to the typed world input re-derived from
 * the goal (F5). The planner is deterministic, so the typed input's id always
 * matches the path segment the patch wrote — this fallback only fires when the
 * path parse misses, and it guarantees we never selectWorld(stale old world).
 * Returns undefined when the config created no world (e.g. a role/rule edit), so
 * the caller falls back to a plain reload.
 */
export function resolveCreatedWorldId(proposal: StagedConfig): string | undefined {
  const fromPatch = extractCreatedWorldId(proposal.proposal.operations);
  if (fromPatch) {
    return fromPatch;
  }
  const plan = inferConfigPlanFromGoal(proposal.goal);
  return plan.kind === "world" ? plan.world.id : undefined;
}

/**
 * F3 — decide whether a failed config-proposal request should RESTORE the draft.
 * A trust-gate denial is recoverable in one tap (the goal is stashed and the
 * trust card re-runs the proposal), so restoring the draft would make the
 * composer look like the send never landed. Only an unrecoverable failure keeps
 * the draft as a manual retry buffer. Pure so the branch is unit-testable
 * without rendering the hook.
 */
export function shouldRestoreDraftOnProposalError(trustRelated: boolean): boolean {
  return !trustRelated;
}

/**
 * F2 — compose the honest follow-up offered after an EMPTY world is created from
 * a goal that named inhabitants the runtime did not fabricate. Returns undefined
 * when the goal named no structure (nothing to offer). Pure so the copy + the
 * "only when clues exist" decision are unit-testable without rendering the hook.
 */
export function composeStructureFollowUp(goal: string): string | undefined {
  const clues = detectWorldStructureClues(goal);
  if (clues.length === 0) {
    return undefined;
  }
  return `世界已创建，但里面还是空的——你提到的${clues.join(
    "、",
  )}我没有凭空生成。要我把它们也建出来吗？`;
}

/**
 * Build the lightweight inline confirmation card shown AFTER a world switch lands
 * (NL "切换到云岭修仙界"). A `result` card, not a preview — the switch already
 * executed via `app.selectWorld`, so this is feedback (Don Norman: visible system
 * status), not a confirm gate. Reuses the `run-turn` card kind purely as a stable
 * ChatCardKind tag; the card UI branches on `variant: "result"` + title, so the
 * kind is never read for rendering. Pure so the copy is unit-testable.
 */
export function worldSwitchCard(worldName: string): ChatCard {
  return {
    detail: `当前世界已切换到「${worldName}」，右侧的角色与状态已经跟着更新。`,
    kind: "run-turn",
    title: "切换世界",
    variant: "result",
  };
}

/**
 * Build the handoff confirmation card shown after a config write CREATED a new
 * world and auto-switched the rail into it. Distinct from `worldSwitchCard`: that
 * one narrates a MANUAL switch into an EXISTING world ("当前世界已切换到…"); this one
 * narrates "新建后立刻切入" so the operator understands the create-bubble they just
 * typed lives in the OLD world's history, not that it vanished. The destination
 * chat is empty (a fresh world has no transcript), so without this the operator
 * lands on a blank screen and reads it as "我刚发的话丢了". Same `run-turn`/`result`
 * card kind as `worldSwitchCard` (a settled feedback card, not a confirm gate);
 * the card UI branches on `variant: "result"` + title, never on `kind`. Pure so
 * the copy is unit-testable.
 */
export function worldCreatedHandoffCard(worldName: string): ChatCard {
  return {
    detail: `已为你切换到新创建的世界「${worldName}」，可以继续在这里加角色、设定规则。`,
    kind: "run-turn",
    title: "新世界已就绪",
    variant: "result",
  };
}

/**
 * Resolve the user-facing NAME of the world a confirmed config write created,
 * mirroring `resolveCreatedWorldId`'s id resolution so the handoff card always
 * names the SAME world the rail just switched into.
 *
 * Prefers the just-loaded roster (`worlds`) looked up by the resolved created id —
 * the authoritative name the backend persisted. Falls back to the planner's
 * deterministic world name re-derived from the goal when the roster has not landed
 * yet (the `selectWorld` reload is async; `app.state` may be a render behind inside
 * the confirm closure). The planner is deterministic, so this fallback matches the
 * name the patch wrote. Returns undefined only when neither resolves (no world was
 * created) — the caller then skips the handoff card entirely. Pure + injected so
 * the resolution order is unit-testable without rendering the hook.
 */
export function resolveCreatedWorldName(
  proposal: StagedConfig,
  worlds: WorldSummary[],
): string | undefined {
  const createdId = resolveCreatedWorldId(proposal);
  if (createdId) {
    const fromRoster = worlds.find((world) => world.id === createdId)?.name;
    if (fromRoster) {
      return fromRoster;
    }
  }
  const plan = inferConfigPlanFromGoal(proposal.goal);
  return plan.kind === "world" ? plan.world.name : undefined;
}

/**
 * F2 (world-switch continuity) — the live turns that must SURVIVE a chat-initiated
 * world switch. The God-chat transcript is persisted per (worldId, identity), so
 * flipping `worldId` makes the persistence scope-switch effect REPLACE `turns` with
 * the destination world's previously-saved history. Without intervention, the
 * operator's just-typed "切换到…" bubble and the switch result card (which were
 * pushed into the SOURCE scope) are dropped and a stale destination bubble shows.
 *
 * The vision is ONE continuous conversation with God across worlds — switching is
 * just another turn. So we CARRY these turns into the destination scope: the
 * scope-switch effect appends them on top of the destination's restored history.
 * The set is built from the LIVE typed text (never a cached/previous switch label)
 * so the green operator bubble always reads exactly what the operator typed.
 */
export type WorldSwitchCarryOver = {
  /** The operator's verbatim just-typed line (e.g. "切换到赛博修真世界"). */
  liveText: string;
  /** Destination world's user-facing name, for the result card copy. */
  worldName: string;
};

/**
 * Assemble the carry-over turns for a chat-initiated world switch: the operator's
 * LIVE-text bubble followed by the switch result card. Pure + id-injected so it is
 * unit-testable and the hook stays the sole authority on turn-id minting. The
 * operator bubble carries the verbatim typed text — proving the post-switch green
 * bubble is never a stale destination-scope label.
 */
export function buildWorldSwitchCarryOver(
  carry: WorldSwitchCarryOver,
  nextId: () => string,
): ChatTurn[] {
  return [
    { id: nextId(), role: "operator", text: carry.liveText },
    {
      card: worldSwitchCard(carry.worldName),
      id: nextId(),
      role: "system",
      text: `已切换到「${carry.worldName}」。`,
    },
  ];
}

/** Normalize an unknown thrown value to its message string. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
