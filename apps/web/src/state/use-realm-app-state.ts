import type { StatePatchResult } from "@realm/api-contract";
import { RealmHttpClient } from "@realm/client-sdk";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/index.tsx";
import { connectEventFeed } from "@/state/event-feed.ts";
import {
  type AppSection,
  type AppState,
  appendSentMessage,
  classifyTurnFailure,
  type GodRoleAction,
  idleTurnRun,
  initialState,
  type LoadRealmOptions,
  latestDenialReason,
  type PendingMessage,
  resolveIdentityAfterRealmLoad,
  type SendError,
  type TurnRunState,
} from "@/state/realm-app-state-model.ts";
import { buildConversationRows, isTraceEvent } from "@/view-models/realm-view-model.ts";

export type {
  AppSection,
  GodRoleAction,
  PendingMessage,
  SendError,
  TurnRunState,
} from "@/state/realm-app-state-model.ts";

export function useRealmAppState() {
  const { t } = useI18n();
  const client = useMemo(() => new RealmHttpClient(), []);
  const [state, setState] = useState<AppState>(initialState);
  const [activeSection, setActiveSection] = useState<AppSection>("chats");
  const [draft, setDraft] = useState("");
  const [identity, setIdentity] = useState("owner");
  const [runRoleId, setRunRoleId] = useState("");
  const [selectedWorldId, setSelectedWorldId] = useState<string | undefined>();
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>();
  const [turnRun, setTurnRun] = useState<TurnRunState>(idleTurnRun);
  const [godAction, setGodAction] = useState<GodRoleAction>("mute");
  const [godActionRoleId, setGodActionRoleId] = useState("");
  const [godActionReason, setGodActionReason] = useState("");
  const [godActionResult, setGodActionResult] = useState<StatePatchResult | undefined>();
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState<SendError | undefined>();
  const latestEventSeqRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedRoomIdRef = useRef<string | undefined>(undefined);
  selectedRoomIdRef.current = selectedRoomId;

  const loadRealm = useCallback(
    async (preferredWorldId?: string, preferredRoomId?: string, options: LoadRealmOptions = {}) => {
      try {
        const effective = await client.getEffectiveConfig();
        const world =
          effective.worlds.find((candidate) => candidate.id === preferredWorldId) ??
          effective.worlds.find((candidate) => candidate.id === effective.project.defaultWorldId) ??
          effective.worlds[0];
        const rooms = world ? (await client.listRooms(world.id)).rooms : [];
        const room =
          rooms.find((candidate) => candidate.id === preferredRoomId) ??
          rooms.find((candidate) => candidate.id === world?.defaultRoomId) ??
          rooms[0];
        const roomMessagePairs = await Promise.all(
          rooms.map(async (candidate) => ({
            messages: (await client.listMessages(candidate.id)).messages,
            roomId: candidate.id,
          })),
        );
        const messagesByRoom = new Map(
          roomMessagePairs.map((entry) => [entry.roomId, entry.messages] as const),
        );
        const messages = room ? (messagesByRoom.get(room.id) ?? []) : [];
        const conversationMessages = roomMessagePairs.flatMap((entry) => entry.messages);
        const worldState = world ? await client.getWorldState(world.id) : undefined;
        const eventPage = await client.listEvents();
        latestEventSeqRef.current = eventPage.lastSeq;
        const nextIdentities = ["owner", ...effective.roles.map((role) => role.id)];

        setState({
          conversationMessages,
          error: undefined,
          events: eventPage.events,
          messages,
          projectName: effective.project.name,
          roles: effective.roles,
          rooms,
          status: "ready",
          worlds: effective.worlds,
          worldState: worldState
            ? {
                state: worldState.state,
                version: worldState.version,
              }
            : undefined,
        });
        setSelectedWorldId(world?.id);
        setSelectedRoomId(room?.id);
        setIdentity((current) =>
          resolveIdentityAfterRealmLoad(current, nextIdentities, options.resetIdentity),
        );
        setRunRoleId((current) =>
          effective.roles.some((role) => role.id === current)
            ? current
            : (effective.roles[0]?.id ?? ""),
        );
        setGodActionRoleId((current) =>
          effective.roles.some((role) => role.id === current)
            ? current
            : (effective.roles[0]?.id ?? ""),
        );
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          status: "error",
        }));
      }
    },
    [client],
  );

  const scheduleReload = useCallback(
    (preferredWorldId?: string, preferredRoomId?: string) => {
      if (reloadTimerRef.current) {
        return;
      }
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = undefined;
        void loadRealm(preferredWorldId, preferredRoomId);
      }, 100);
    },
    [loadRealm],
  );

  const selectedWorld =
    state.worlds.find((world) => world.id === selectedWorldId) ?? state.worlds[0];
  const selectedRoom =
    state.rooms.find((room) => room.id === selectedRoomId) ??
    state.rooms.find((room) => room.id === selectedWorld?.defaultRoomId) ??
    state.rooms[0];
  const identities = ["owner", ...state.roles.map((role) => role.id)];
  const conversations = useMemo(
    () =>
      buildConversationRows(state.rooms, state.conversationMessages, state.roles, {
        god: t("common.god"),
        owner: t("common.boss"),
      }),
    [state.rooms, state.conversationMessages, state.roles, t],
  );
  const selectedRole = state.roles.find((role) => role.id === runRoleId) ?? state.roles[0];
  const traceEvents = state.events.filter(isTraceEvent).slice(-8);

  useEffect(() => {
    let disconnect = () => {};
    let disposed = false;
    void loadRealm(selectedWorldId, selectedRoomId).then(() => {
      if (disposed) {
        return;
      }
      disconnect = connectEventFeed((seq) => {
        if (seq !== undefined && seq <= latestEventSeqRef.current) {
          return;
        }
        scheduleReload(selectedWorldId, selectedRoomId);
      }, latestEventSeqRef.current);
    });
    return () => {
      disposed = true;
      disconnect();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = undefined;
      }
    };
  }, [loadRealm, scheduleReload, selectedWorldId, selectedRoomId]);

  useEffect(() => {
    if (!turnRun.turnId) {
      return;
    }
    const completed = state.events.find(
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
        const reason = latestDenialReason(state.events);
        const classified = classifyTurnFailure(reason, t);
        return {
          ...current,
          error: classified.error,
          trustRelated: classified.trustRelated,
          status: "error",
          turnId: undefined,
        };
      }
      return {
        ...current,
        status: "idle",
        turnId: undefined,
      };
    });
  }, [state.events, turnRun.turnId, t]);

  function clearPendingSendState() {
    setPendingMessages([]);
    setSendError(undefined);
  }

  async function selectWorld(worldId: string) {
    setSelectedWorldId(worldId);
    setSelectedRoomId(undefined);
    setDraft("");
    setTurnRun(idleTurnRun);
    setActiveSection("chats");
    clearPendingSendState();
    await loadRealm(worldId, undefined, { resetIdentity: true });
  }

  async function selectRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setActiveSection("chats");
    clearPendingSendState();
    await loadRealm(selectedWorld?.id, roomId);
  }

  /**
   * Core send path shared by first-attempt and retry. Inserts an optimistic
   * pending bubble immediately; on success appends the returned message to the
   * active room only (no full reload); on failure marks the bubble failed and
   * raises an inline error that preserves the draft for retry.
   */
  const dispatchSend = useCallback(
    async (input: {
      worldId: string;
      roomId: string;
      displayedAuthorId: string;
      content: string;
    }) => {
      const pendingId = `pending-${crypto.randomUUID()}`;
      const optimistic: PendingMessage = {
        content: input.content,
        createdAt: new Date().toISOString(),
        displayedAuthorId: input.displayedAuthorId,
        pendingId,
        roomId: input.roomId,
        status: "pending",
        worldId: input.worldId,
      };
      setSendError(undefined);
      setPendingMessages((current) => [...current, optimistic]);
      try {
        const isOwner = input.displayedAuthorId === "owner";
        const response = await client.sendMessage(input.roomId, {
          content: input.content,
          displayedAuthorId: input.displayedAuthorId,
          idempotencyKey: `web-message-${isOwner ? "" : "identity-confirmed:"}${Date.now()}`,
          worldId: input.worldId,
        });
        setPendingMessages((current) => current.filter((entry) => entry.pendingId !== pendingId));
        setState((current) =>
          appendSentMessage(current, response.message, {
            isActiveRoom: selectedRoomIdRef.current === input.roomId,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPendingMessages((current) =>
          current.map((entry) =>
            entry.pendingId === pendingId ? { ...entry, status: "failed" } : entry,
          ),
        );
        setSendError({
          displayedAuthorId: input.displayedAuthorId,
          draft: input.content,
          message,
          pendingId,
          roomId: input.roomId,
          worldId: input.worldId,
        });
      }
    },
    [client],
  );

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !selectedWorld || !selectedRoom) {
      return;
    }
    setDraft("");
    await dispatchSend({
      content,
      displayedAuthorId: identity,
      roomId: selectedRoom.id,
      worldId: selectedWorld.id,
    });
  }

  async function retrySend() {
    if (!sendError) {
      return;
    }
    const retried = sendError;
    setPendingMessages((current) =>
      current.filter((entry) => entry.pendingId !== retried.pendingId),
    );
    setSendError(undefined);
    await dispatchSend({
      content: retried.draft,
      displayedAuthorId: retried.displayedAuthorId,
      roomId: retried.roomId,
      worldId: retried.worldId,
    });
  }

  function dismissSendError() {
    if (!sendError) {
      return;
    }
    const dismissed = sendError;
    setPendingMessages((current) =>
      current.filter((entry) => entry.pendingId !== dismissed.pendingId),
    );
    setSendError(undefined);
    if (!draft.trim()) {
      setDraft(dismissed.draft);
    }
  }

  function sendErrorDetails(): string {
    if (!sendError) {
      return "";
    }
    return JSON.stringify(
      {
        displayedAuthorId: sendError.displayedAuthorId,
        error: sendError.message,
        roomId: sendError.roomId,
        worldId: sendError.worldId,
      },
      null,
      2,
    );
  }

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
        current.turnId === turnId ? { ...current, status: "idle", turnId: undefined } : current,
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

  async function applyGodAction() {
    if (!selectedWorld || !godActionRoleId || !godActionReason.trim()) {
      return;
    }
    const response = await client.applyGodRoleAction(selectedWorld.id, {
      action: godAction,
      expectedVersion: state.worldState?.version,
      idempotencyKey: `web-god-action-${Date.now()}`,
      reason: godActionReason.trim(),
      targetRoleId: godActionRoleId,
    });
    setGodActionResult(response.result);
    await loadRealm(selectedWorld.id, selectedRoom?.id);
  }

  return {
    activeSection,
    applyGodAction,
    cancelActiveTurn,
    clearTurnError,
    client,
    conversations,
    draft,
    godAction,
    godActionReason,
    godActionResult,
    godActionRoleId,
    identities,
    identity,
    dismissSendError,
    pendingMessages: selectedRoom
      ? pendingMessages.filter((entry) => entry.roomId === selectedRoom.id)
      : [],
    reload: () => loadRealm(selectedWorld?.id, selectedRoom?.id),
    retrySend,
    runRoleId,
    runSelectedRoleTurn,
    selectedRole,
    selectedRoom,
    selectedWorld,
    sendError,
    sendErrorDetails,
    sendMessage,
    selectRoom,
    selectWorld,
    setActiveSection,
    setDraft,
    setGodAction,
    setGodActionReason,
    setGodActionRoleId,
    setIdentity,
    setRunRoleId,
    state,
    traceEvents,
    turnRun,
    turnStatus: turnRun.status,
  };
}
