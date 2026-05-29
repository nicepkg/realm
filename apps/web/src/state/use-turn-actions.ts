import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { useCallback, useEffect, useState } from "react";
import type { useI18n } from "@/i18n/index.tsx";
import {
  type AppState,
  accumulateStreamedText,
  classifyTurnFailure,
  type GodActionResult,
  type GodRoleAction,
  idleTurnRun,
  latestDenialReason,
  type TurnRunState,
} from "@/state/realm-app-state-model.ts";

type Translate = ReturnType<typeof useI18n>["t"];

type UseTurnActionsInput = {
  client: RealmHttpClient;
  selectedWorld: WorldSummary | undefined;
  selectedRoom: Room | undefined;
  runRoleId: string;
  events: AppState["events"];
  worldStateVersion: number | undefined;
  loadRealm: (preferredWorldId?: string, preferredRoomId?: string) => Promise<void>;
  t: Translate;
};

/**
 * Role-turn + God-adjudication subsystem: in-flight turn lifecycle (running →
 * completed/failed/cancelled), recoverable turn errors with trust-related
 * classification, and gated God role actions with result feedback. Split out of
 * the app-state controller to keep god/turn domain logic cohesive and the
 * controller file small.
 */
export function useTurnActions({
  client,
  selectedWorld,
  selectedRoom,
  runRoleId,
  events,
  worldStateVersion,
  loadRealm,
  t,
}: UseTurnActionsInput) {
  const [turnRun, setTurnRun] = useState<TurnRunState>(idleTurnRun);
  const [godAction, setGodAction] = useState<GodRoleAction>("mute");
  const [godActionRoleId, setGodActionRoleId] = useState("");
  const [godActionReason, setGodActionReason] = useState("");
  const [godActionResult, setGodActionResult] = useState<GodActionResult | undefined>();

  // FB-401: while a turn is in flight, fold its live `turn.delta` tokens into
  // `streamedText` so the chat bubble shows the answer forming in place. The text
  // is always recomputed from the authoritative event log (idempotent), so an SSE
  // reload that replays the same deltas never double-counts. Skipped once the turn
  // reaches a terminal state (turnId cleared) so finished tokens are not re-folded.
  useEffect(() => {
    if (!turnRun.turnId) {
      return;
    }
    const turnId = turnRun.turnId;
    const next = accumulateStreamedText(events, turnId);
    setTurnRun((current) =>
      current.turnId === turnId && current.streamedText !== next
        ? { ...current, streamedText: next }
        : current,
    );
  }, [events, turnRun.turnId]);

  // Reconcile in-flight turn lifecycle from the event stream: a matching
  // terminal event (completed/failed/cancelled) for the active turn folds the
  // run into idle, or into a classified recoverable error on failure.
  useEffect(() => {
    if (!turnRun.turnId) {
      return;
    }
    const completed = events.find(
      (event) =>
        (event.type === "turn.completed" ||
          event.type === "turn.failed" ||
          event.type === "turn.cancelled") &&
        event.turn.id === turnRun.turnId,
    );
    if (
      !completed ||
      !(
        completed.type === "turn.completed" ||
        completed.type === "turn.failed" ||
        completed.type === "turn.cancelled"
      )
    ) {
      return;
    }
    setTurnRun((current) => {
      if (current.turnId !== turnRun.turnId) {
        return current;
      }
      if (completed.type === "turn.failed") {
        const reason = latestDenialReason(events);
        const classified = classifyTurnFailure(reason, t);
        return {
          ...current,
          error: classified.error,
          trustRelated: classified.trustRelated,
          status: "error",
          streamedText: undefined,
          turnId: undefined,
        };
      }
      return {
        ...current,
        status: "idle",
        streamedText: undefined,
        turnId: undefined,
      };
    });
  }, [events, turnRun.turnId, t]);

  async function runSelectedRoleTurn() {
    if (!selectedWorld || !selectedRoom || !runRoleId || turnRun.status === "running") {
      return;
    }
    const request = {
      roleId: runRoleId,
      roomId: selectedRoom.id,
      startedAt: new Date().toISOString(),
      status: "running",
      worldId: selectedWorld.id,
    } satisfies TurnRunState;
    setTurnRun(request);
    try {
      const response = await client.startRoleTurn(selectedRoom.id, {
        roleId: runRoleId,
        timeoutMs: 30_000,
        worldId: selectedWorld.id,
      });
      setTurnRun((current) =>
        current.status === "running" &&
        current.worldId === request.worldId &&
        current.roomId === request.roomId &&
        current.roleId === request.roleId
          ? { ...current, turnId: response.turnId }
          : current,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const classified = classifyTurnFailure(message, t);
      setTurnRun({
        ...request,
        error: classified.error,
        trustRelated: classified.trustRelated,
        status: "error",
        turnId: undefined,
      });
    }
  }

  async function cancelActiveTurn() {
    if (!turnRun.turnId) {
      return;
    }
    const turnId = turnRun.turnId;
    try {
      await client.cancelTurn(turnId);
      setTurnRun((current) =>
        current.turnId === turnId
          ? { ...current, status: "idle", streamedText: undefined, turnId: undefined }
          : current,
      );
      await loadRealm(selectedWorld?.id, selectedRoom?.id);
    } catch (error) {
      setTurnRun((current) =>
        current.turnId === turnId
          ? {
              ...current,
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              turnId: undefined,
            }
          : current,
      );
    }
  }

  function clearTurnError() {
    setTurnRun((current) =>
      current.status === "error" ? { ...current, status: "idle" } : current,
    );
  }

  /**
   * Apply a gated God ruling, then refresh the view — as two SEPARATE phases so
   * the operator never sees a "ruling failed" banner for what is actually a
   * stale-view reload problem.
   *
   * Phase 1 (authoritative): `applyGodRoleAction` commits the ruling and its
   * result is set FIRST. If it throws, the caller surfaces the ruling-failure
   * banner — correct, the ruling did not take effect.
   *
   * Phase 2 (best-effort view refresh): `loadRealm` runs in its own scope. The
   * ruling already committed, so a reload failure is a stale-view problem. It
   * resolves to a boolean the caller uses to show a calm, non-blocking
   * "reload to confirm" notice instead of the ruling-failure banner. Returns
   * `true` when the view is fresh, `false` when only the refresh failed.
   */
  async function applyGodAction(): Promise<boolean> {
    if (!selectedWorld || !godActionRoleId || !godActionReason.trim()) {
      return true;
    }
    const response = await client.applyGodRoleAction(selectedWorld.id, {
      action: godAction,
      expectedVersion: worldStateVersion,
      idempotencyKey: `web-god-action-${Date.now()}`,
      reason: godActionReason.trim(),
      targetRoleId: godActionRoleId,
    });
    setGodActionResult({
      result: response.result,
      roomId: selectedRoom?.id,
      worldId: selectedWorld.id,
    });
    try {
      await loadRealm(selectedWorld.id, selectedRoom?.id);
      return true;
    } catch {
      return false;
    }
  }

  // Reset turn state and dismiss any prior god-action result; used by navigation.
  const resetTurnRun = useCallback(() => {
    setTurnRun(idleTurnRun);
    setGodActionResult(undefined);
  }, []);

  // Reconcile the god-action target role id when the role set changes so the
  // gated action never points at a stale/removed role.
  const reconcileGodActionRole = useCallback((roles: RoleSummary[]) => {
    setGodActionRoleId((current) =>
      roles.some((role) => role.id === current) ? current : (roles[0]?.id ?? ""),
    );
  }, []);

  return {
    applyGodAction,
    cancelActiveTurn,
    clearTurnError,
    godAction,
    godActionReason,
    godActionResult,
    godActionRoleId,
    reconcileGodActionRole,
    resetTurnRun,
    runSelectedRoleTurn,
    setGodAction,
    setGodActionReason,
    setGodActionRoleId,
    setGodActionResult,
    turnRun,
  };
}
