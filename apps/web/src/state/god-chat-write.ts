import type { ConfigPatchProposal } from "@realm/api-contract";
import type { RealmAppController } from "@/app/types.ts";
import {
  type ChatTurn,
  configResultFeedback,
  godResultFeedback,
  isWriteCommitted,
  type PendingProposal,
  runTurnAcceptedFeedback,
  type StagedWrite,
  statePatchResultFeedback,
} from "@/state/god-chat-model.ts";

/**
 * God-chat WRITE layer — the React-free, side-effecting commit path the hook
 * (`use-god-chat.ts`) delegates to. Kept module-level so the confirm logic stays
 * linear, so it is unit-testable against the fake runtime, and so the hook file
 * stays under the 500-line budget. Every write goes through the EXISTING SDK /
 * controller methods; no action logic is duplicated here.
 */

/**
 * Path of a world's manifest inside the config tree, e.g.
 * `.agents/worlds/<id>/world.yaml`. The directory segment IS the world id, so a
 * `create` op against this path tells us a brand-new world just came into being.
 */
const WORLD_MANIFEST_PATH = /\.agents\/worlds\/([^/]+)\/world\.ya?ml$/;

/**
 * Pure: extract the id of a world CREATED by a config patch. Scans the patch's
 * file operations for a `create` action against a world manifest path and returns
 * the world-id directory segment. Returns undefined when the patch creates no new
 * world (e.g. a rule/role edit, or an update to an existing world), so the caller
 * can fall back to a plain reload. Kept module-level + side-effect free for unit
 * testing (F4).
 */
export function extractCreatedWorldId(
  operations: readonly ConfigPatchProposal["operations"][number][],
): string | undefined {
  for (const operation of operations) {
    if (operation.action !== "create") {
      continue;
    }
    const match = operation.path.match(WORLD_MANIFEST_PATH);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

/** A run-turn write returns the accepted turn so the caller can stream it (F1). */
export type ActiveRunTurnHandle = {
  turnId: string;
  roleName: string;
  proposal: Extract<StagedWrite, { kind: "run-turn" }>;
};

/**
 * Perform the real write for a confirmed proposal through the EXISTING SDK
 * methods, then push a zh-CN feedback turn. Throws on failure so the caller can
 * keep the proposal for retry. Kept module-level + pure-ish (only touches the
 * controller it is handed) so the confirm logic stays linear and testable.
 *
 * A `run-turn` returns the accepted backend turn id + role name (instead of
 * faking success): the caller subscribes to that turn's lifecycle and streams the
 * role's reply back into the conversation (F1). All other families return undefined.
 * `trust` is handled by the hook before `performWrite`, so it is never reached here.
 */
export async function performWrite(
  app: RealmAppController,
  proposal: PendingProposal,
  typedConfirmation: string | undefined,
  pushTurn: (turn: Omit<ChatTurn, "id">) => void,
): Promise<ActiveRunTurnHandle | undefined> {
  switch (proposal.kind) {
    case "config": {
      const applied = await app.client.applyConfigPatch(
        proposal.proposal.id,
        typedConfirmation ? { confirmation: typedConfirmation } : {},
      );
      const feedback = configResultFeedback(proposal, applied.changedPaths);
      pushTurn({ card: feedback.card, role: "system", text: feedback.text });
      return undefined;
    }
    case "god": {
      const response = await app.client.applyGodRoleAction(proposal.worldId, {
        action: proposal.action,
        idempotencyKey: `god-chat-god-${Date.now()}`,
        reason: proposal.reason,
        targetRoleId: proposal.targetRoleId,
      });
      const feedback = godResultFeedback(proposal, isWriteCommitted(response.result.status));
      pushTurn({ card: feedback.card, role: "system", text: feedback.text });
      return undefined;
    }
    case "state-patch": {
      const response = await app.client.adminPatchState({
        actorId: "god",
        idempotencyKey: `god-chat-patch-${Date.now()}`,
        operations: proposal.operations,
        reason: proposal.reason,
        worldId: proposal.worldId,
      });
      const feedback = statePatchResultFeedback(
        proposal,
        isWriteCommitted(response.result.status),
        app.state?.roles ?? [],
      );
      pushTurn({ card: feedback.card, role: "system", text: feedback.text });
      return undefined;
    }
    case "run-turn": {
      // FB-401 parity: startRoleTurn returns 202 + a turnId. We push only an
      // HONEST "回合进行中" status; the role's actual speech is streamed back by
      // the hook's turn-event effect via this returned turn id (F1) — never faked.
      const response = await app.client.startRoleTurn(proposal.roomId, {
        roleId: proposal.roleId,
        timeoutMs: 30_000,
        worldId: proposal.worldId,
      });
      const feedback = runTurnAcceptedFeedback(proposal);
      // Tag the "回合进行中" status turn with the accepted turn id so the
      // activeRunTurn effect can REPLACE it in place with the settled reply (or
      // remove it) on terminal — never leaking a permanent spinner.
      pushTurn({
        card: feedback.card,
        role: "system",
        statusTurnId: response.turnId,
        text: feedback.text,
      });
      return { proposal, roleName: proposal.roleName, turnId: response.turnId };
    }
    case "trust":
      // Trust elevation is intercepted by the hook's confirm handler and never
      // routed through performWrite. Guard so the switch stays exhaustive.
      throw new Error("trust elevation must be handled by the hook, not performWrite");
  }
}
