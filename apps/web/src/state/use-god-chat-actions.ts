import { type MutableRefObject, useCallback } from "react";
import type { RealmAppController } from "@/app/types.ts";
import {
  answerRoleMemory,
  answerWorldState,
  type ChatTurn,
  classifyBackendError,
  extractAddRoleName,
  findRoleByDisplayName,
  type GodChatContext,
  type PendingProposal,
  previewCard,
  previewIntroText,
  type routeIntent,
  type StagedConfig,
  type StagedWrite,
} from "@/state/god-chat-model.ts";
import { performWrite } from "@/state/god-chat-write.ts";
import {
  composeStructureFollowUp,
  messageOf,
  resolveCreatedWorldId,
  resolveCreatedWorldName,
  shouldRestoreDraftOnProposalError,
  worldCreatedHandoffCard,
} from "@/state/use-god-chat-helpers.ts";
import type { ActiveRunTurn } from "@/state/use-god-chat-transcript-sync.ts";

/**
 * Dependencies the action callbacks need from the host hook. They are the raw
 * state primitives (setters + refs) plus the live world context; the actions
 * own all routing/staging/confirm logic so `use-god-chat.ts` stays a thin
 * orchestrator under the 500-line guard.
 */
export type GodChatActionDeps = {
  app: RealmAppController;
  context: GodChatContext;
  pushTurn: (turn: Omit<ChatTurn, "id">) => void;
  setBusy: (value: boolean) => void;
  setDraft: (value: string) => void;
  setError: (value: string | undefined) => void;
  setActiveRunTurn: (value: ActiveRunTurn | undefined) => void;
  setPendingProposal: (value: PendingProposal | undefined) => void;
  pendingProposal: PendingProposal | undefined;
  // Guard against double-submit / double-confirm while a network write is in flight.
  inFlightRef: MutableRefObject<boolean>;
  // Stashes a denied config GOAL so the trust card's confirm can re-run the proposal.
  pendingConfigGoalRef: MutableRefObject<string | undefined>;
  // F2 — drop the in-flight world-switch carry-over when a switch FAILS (no scope
  // swap happened, so the stashed operator/result turns must not leak forward).
  clearSwitchCarryOver: () => void;
};

export type GodChatActions = {
  runInspect: (
    intent: Extract<ReturnType<typeof routeIntent>, { mode: "inspect" }>["intent"],
  ) => Promise<void>;
  switchWorld: (worldId: string, worldName: string) => Promise<void>;
  stageConfig: (goal: string, originalDraft: string) => Promise<void>;
  stageWrite: (proposal: StagedWrite) => void;
  confirmProposal: (typedConfirmation?: string) => Promise<void>;
  cancelProposal: () => void;
};

/**
 * All God-chat action callbacks (inspect / world-switch / stage / confirm /
 * cancel). Extracted from `use-god-chat.ts` so each file stays under the
 * 500-line guard; behavior is unchanged — the host hook owns state, these own
 * the writes against the EXISTING SDK / controller methods.
 */
export function useGodChatActions(deps: GodChatActionDeps): GodChatActions {
  const {
    app,
    context,
    pushTurn,
    setBusy,
    setDraft,
    setError,
    setActiveRunTurn,
    setPendingProposal,
    pendingProposal,
    inFlightRef,
    pendingConfigGoalRef,
    clearSwitchCarryOver,
  } = deps;

  /** Resolve a read-only inspect from state / role memory; never writes. */
  const runInspect = useCallback(
    async (intent: Extract<ReturnType<typeof routeIntent>, { mode: "inspect" }>["intent"]) => {
      if (intent.target === "role-memory" && intent.roleId && app.selectedWorld?.id) {
        setBusy(true);
        try {
          const memory = await app.client.readRoleMemory(app.selectedWorld.id, intent.roleId);
          const answer = answerRoleMemory(app.state.roles, intent.roleId, memory.content);
          pushTurn({ card: answer.card, role: "system", text: answer.text });
        } catch (readError) {
          pushTurn({
            role: "system",
            text: `读取记忆失败：${classifyBackendError(messageOf(readError)).text}`,
          });
        } finally {
          setBusy(false);
        }
        return;
      }
      const answer = answerWorldState(context);
      pushTurn({ card: answer.card, role: "system", text: answer.text });
    },
    [app.client, app.selectedWorld?.id, app.state.roles, context, pushTurn, setBusy],
  );

  /**
   * Switch the active world directly (NL "切换到云岭修仙界"). Not a staged write:
   * it calls the EXISTING `app.selectWorld`, which flips `worldId` and makes the
   * persistence scope-switch effect restore the destination world's transcript.
   *
   * F2 (continuity): on SUCCESS it does NOT push the operator/result turns itself —
   * `submit` stashed a carry-over (operator's live "切换到…" line + result card) that
   * the scope-switch effect appends onto the destination's restored history, so the
   * switch reads as one continuous turn instead of being wiped by the scope swap.
   * Pushing here would either be discarded by the scope replace OR double the
   * carry-over. On FAILURE the carry-over is cleared (no scope swap happened, so it
   * must never leak into a later unrelated switch) and a calm zh-CN error is shown.
   */
  const switchWorld = useCallback(
    async (worldId: string, _worldName: string) => {
      setBusy(true);
      inFlightRef.current = true;
      try {
        await app.selectWorld(worldId);
        // Success: the carry-over (set by `submit`) is consumed by the persistence
        // scope-switch effect when `worldId` flips — it owns the operator + result
        // turns so they land on top of the destination world's restored transcript.
      } catch (switchError) {
        // The switch failed → no scope swap, so the stashed carry-over would
        // otherwise pollute the next switch. Drop it and report honestly.
        clearSwitchCarryOver();
        pushTurn({
          role: "system",
          text: `切换世界失败：${classifyBackendError(messageOf(switchError)).text}`,
        });
      } finally {
        setBusy(false);
        inFlightRef.current = false;
      }
    },
    [app, pushTurn, setBusy, inFlightRef, clearSwitchCarryOver],
  );

  /** Fetch a config proposal and stage it; restore draft on failure (retryable). */
  const stageConfig = useCallback(
    async (goal: string, originalDraft: string) => {
      setBusy(true);
      inFlightRef.current = true;
      try {
        // Thread the ACTIVE world id so the backend attaches the new role to the
        // current world's world.yaml (its 成员 list), making the rail show it
        // immediately. Absent (no world selected) → standalone role creation.
        const response = await app.client.proposeAssistantConfig({
          goal,
          worldId: context.worldId,
        });
        // P2 de-dup — if this is an add-role proposal for a role that ALREADY exists
        // (same display name), do NOT mint a second one ("加一个叫云遥…" twice must
        // never yield two 云遥 / a role-1 twin). Confirm the existing role instead.
        // The check is WORLD-SCOPED (`context.roles` = the active world's members),
        // so adding 云遥 to a NEW EMPTY world is never falsely rejected just because
        // some OTHER world already has a 云遥.
        // `extractAddRoleName` matches both the planner's English title and the
        // localized zh-CN form, so either shape is detected.
        const requestedRoleName = extractAddRoleName(response.patch.title);
        if (requestedRoleName) {
          const existing = findRoleByDisplayName(context.roles, requestedRoleName);
          if (existing) {
            pendingConfigGoalRef.current = undefined;
            pushTurn({
              role: "system",
              text: `世界里已经有「${existing.displayName}」了，就不重复创建了。要改设定或让 TA 发言，直接告诉我。`,
            });
            return;
          }
        }
        const staged: StagedConfig = { goal, kind: "config", proposal: response.patch };
        pendingConfigGoalRef.current = undefined;
        setPendingProposal(staged);
        pushTurn({ card: previewCard(staged), role: "system", text: previewIntroText(staged) });
      } catch (proposeError) {
        const info = classifyBackendError(messageOf(proposeError));
        setError(info.text);
        // F3: only an unrecoverable error keeps the draft as a retry buffer; a
        // trust-gate denial stashes the goal + stages a one-tap recovery card, so
        // restoring the draft would falsely look like the send never landed.
        if (shouldRestoreDraftOnProposalError(info.trustRelated)) {
          setDraft(originalDraft);
        }
        if (info.trustRelated) {
          // Read-only blocked the PROPOSAL request itself — no ConfigPatchProposal
          // came back, so there is nothing to put on the trust card's `retry`
          // (which expects a fully-staged write). Stash the goal and stage a plain
          // trust card whose confirm RE-RUNS the config proposal after lifting
          // trust (F2), so the operator recovers in one tap instead of hitting a
          // dead-end error.
          //
          // F3: do NOT restore the draft here. The goal is already stashed in
          // `pendingConfigGoalRef` and the trust card's confirm re-runs the
          // proposal, so the operator never needs to re-type anything. Restoring
          // the original draft makes the composer look like the send never landed
          // (the input "wasn't cleared"), which is the bug. Only an UNRECOVERABLE
          // failure (the else branch) restores the draft as a retry buffer.
          pendingConfigGoalRef.current = goal;
          const trustRetry: PendingProposal = { kind: "trust" };
          setPendingProposal(trustRetry);
          pushTurn({
            card: previewCard(trustRetry),
            role: "system",
            text: previewIntroText(trustRetry),
          });
        } else {
          // Truly unrecoverable: the draft was already restored above as a retry
          // buffer; just report the failure honestly.
          pendingConfigGoalRef.current = undefined;
          pushTurn({ role: "system", text: `生成配置方案失败：${info.text}` });
        }
      } finally {
        setBusy(false);
        inFlightRef.current = false;
      }
    },
    [
      app.client,
      context,
      pushTurn,
      setBusy,
      setDraft,
      setError,
      setPendingProposal,
      inFlightRef,
      pendingConfigGoalRef,
    ],
  );

  /** Stage a locally-shaped non-config write for confirm (no network yet). */
  const stageWrite = useCallback(
    (proposal: StagedWrite) => {
      pendingConfigGoalRef.current = undefined;
      setPendingProposal(proposal);
      // Pass roles so a state-patch preview renders role ids (guchenfeng) in the
      // JSON pointer as display names (顾辰风) instead of leaking a bare id.
      pushTurn({
        card: previewCard(proposal, app.state.roles),
        role: "system",
        text: previewIntroText(proposal),
      });
    },
    [app.state.roles, pushTurn, setPendingProposal, pendingConfigGoalRef],
  );

  /**
   * Elevate trust (read-only → run-roles) through the EXISTING SDK method, then
   * (when a denied write was carried along) auto-retry that exact write so the
   * operator continues in one tap (F2). Reloads the realm so the new tier + any
   * write result are reflected. Throws on elevation failure so the caller reports it.
   *
   * Returns `true` when it staged a FRESH pending proposal (the config re-proposal
   * branch) so the caller must NOT clear `pendingProposal`; `false` when the trust
   * card has done its job and the caller should clear it.
   */
  const elevateTrustAndRetry = useCallback(
    async (
      retry: PendingProposal | undefined,
      typedConfirmation: string | undefined,
    ): Promise<boolean> => {
      await app.client.setTrust("run-roles");
      pushTurn({ role: "system", text: "信任等级已提升到「运行角色」。" });
      // F2 — config re-proposal branch: a config PROPOSAL was blocked by the gate,
      // so we have a goal but no staged write. After lifting trust, re-run the
      // proposal (now permitted) instead of performing a write; it stages a fresh
      // config card for the operator to confirm. Reload still runs to reflect the
      // new tier. Signal `true` so the confirm handler keeps that fresh card.
      const configGoal = pendingConfigGoalRef.current;
      if (configGoal !== undefined) {
        pendingConfigGoalRef.current = undefined;
        await app.reload();
        await stageConfig(configGoal, configGoal);
        return true;
      }
      if (retry) {
        const active = await performWrite(app, retry, typedConfirmation, pushTurn);
        if (active) {
          setActiveRunTurn({
            proposal: active.proposal,
            roleName: active.roleName,
            turnId: active.turnId,
          });
        }
      }
      await app.reload();
      return false;
    },
    [app, pushTurn, stageConfig, setActiveRunTurn, pendingConfigGoalRef],
  );

  /**
   * F2 — after a create-world write succeeds, if the goal named inhabitants
   * (宗门/对手/师父 …) that the world was intentionally created WITHOUT (the
   * runtime never fabricates roles), append an honest follow-up offering to build
   * them out. This keeps the empty world from masquerading as the full request.
   * No-op when the goal named no structure.
   */
  const offerStructureFollowUp = useCallback(
    (goal: string) => {
      const text = composeStructureFollowUp(goal);
      if (text === undefined) {
        return;
      }
      pushTurn({ role: "system", text });
    },
    [pushTurn],
  );

  const confirmProposal = useCallback(
    async (typedConfirmation?: string) => {
      const proposal = pendingProposal;
      if (!proposal || inFlightRef.current) {
        return;
      }
      setError(undefined);
      setBusy(true);
      inFlightRef.current = true;
      try {
        if (proposal.kind === "trust") {
          // Keep any fresh proposal the re-proposal branch staged; otherwise the
          // trust card is spent and gets cleared (F2).
          const stagedFresh = await elevateTrustAndRetry(proposal.retry, typedConfirmation);
          if (!stagedFresh) {
            setPendingProposal(undefined);
          }
          return;
        }
        const active = await performWrite(app, proposal, typedConfirmation, pushTurn);
        // A run-turn returns its accepted turnId so the effect can stream the
        // role's reply back into the conversation (F1) — no fake success.
        if (active) {
          setActiveRunTurn({
            proposal: active.proposal,
            roleName: active.roleName,
            turnId: active.turnId,
          });
        }
        setPendingProposal(undefined);
        // F4/F5 — a config write that CREATED a new world must switch the rail to
        // it. `reload()` re-loads the currently-selected world, so a freshly-created
        // world lands in `state.worlds` but is never selected and the rail keeps
        // showing the old world (its stale roles also leak into the role list + the
        // add-role de-dup). We resolve the new world id two ways and prefer either:
        //   1. parse the applied patch's `create` ops for the world manifest path, and
        //   2. (F5 fallback) re-derive the typed world input from the goal — its id
        //      is deterministic, so a path-parse miss never falls back to the OLD
        //      world. Whichever resolves, `selectWorld` it (full reload + select +
        //      identity reset) so the rail + dedup read the NEW active world.
        // Any other config (e.g. a rule edit) creates no world → plain reload.
        const createdWorldId =
          proposal.kind === "config" ? resolveCreatedWorldId(proposal) : undefined;
        if (createdWorldId) {
          await app.selectWorld(createdWorldId);
          // The create-world conversation lives in the OLD (e.g. cultivation) world's
          // transcript; the freshly-switched-into world starts EMPTY, so the operator
          // briefly sees a blank chat and reads it as "我刚发的话丢了". Push a handoff
          // result card as the new world's first turn so the destination opens with a
          // continuity bubble instead of a void — distinct from the manual-switch card
          // ("新建后切入", not "已切换"). Only on the create-and-auto-switch branch; the
          // manual switch path owns `worldSwitchCard` and must not duplicate this.
          // Failure-soft: if the name can't be resolved we simply skip the card (calm
          // zh-CN, never throw).
          if (proposal.kind === "config") {
            const handoffWorldName = resolveCreatedWorldName(proposal, app.state.worlds);
            if (handoffWorldName) {
              pushTurn({
                card: worldCreatedHandoffCard(handoffWorldName),
                role: "system",
                text: `已切换到新世界「${handoffWorldName}」。`,
              });
            }
          }
          // F2 — the operator's goal named inhabitants (宗门/对手/师父 …) but the
          // world is created empty on purpose (no fabricated roles). Offer to build
          // them out instead of letting the empty world masquerade as the request.
          if (proposal.kind === "config") {
            offerStructureFollowUp(proposal.goal);
          }
        } else {
          await app.reload();
        }
      } catch (writeError) {
        const info = classifyBackendError(messageOf(writeError));
        setError(info.text);
        pushTurn({ role: "system", text: `执行失败：${info.text}` });
        if (info.trustRelated) {
          // The write was blocked by the read-only / trust gate — offer a one-tap
          // elevation that auto-retries this exact write (F2). Stage it as the new
          // pending proposal so the inline trust card is live.
          const trustRetry: PendingProposal = { kind: "trust", retry: proposal };
          setPendingProposal(trustRetry);
          pushTurn({
            card: previewCard(trustRetry),
            role: "system",
            text: previewIntroText(trustRetry),
          });
        }
        // A non-trust failure keeps the original proposal for a manual retry.
      } finally {
        setBusy(false);
        inFlightRef.current = false;
      }
    },
    [
      app,
      elevateTrustAndRetry,
      offerStructureFollowUp,
      pendingProposal,
      pushTurn,
      setBusy,
      setError,
      setActiveRunTurn,
      setPendingProposal,
      inFlightRef,
    ],
  );

  const cancelProposal = useCallback(() => {
    if (!pendingProposal) {
      return;
    }
    pendingConfigGoalRef.current = undefined;
    setPendingProposal(undefined);
    setError(undefined);
    pushTurn({ role: "system", text: "已取消，未做任何改动。" });
  }, [pendingProposal, pushTurn, setError, setPendingProposal, pendingConfigGoalRef]);

  return { runInspect, switchWorld, stageConfig, stageWrite, confirmProposal, cancelProposal };
}
