import type {
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  StatePatchResult,
  WorldSummary,
} from "@realm/api-contract";
import { RealmHttpClient } from "@realm/client-sdk";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/index.tsx";
import { connectEventFeed } from "@/state/event-feed.ts";
import { buildConversationRows, isTraceEvent } from "@/view-models/realm-view-model.ts";

export type AppSection = "chats" | "roles" | "worlds" | "settings";
export type GodRoleAction = "kill" | "mute" | "revive";
export type TurnRunState = {
  status: "idle" | "running" | "error";
  worldId?: string;
  roomId?: string;
  roleId?: string;
  turnId?: string;
  startedAt?: string;
  error?: string;
};

type AppState = {
  status: "loading" | "ready" | "error";
  projectName: string;
  worlds: WorldSummary[];
  rooms: Room[];
  roles: RoleSummary[];
  messages: Message[];
  conversationMessages: Message[];
  events: RealmEvent[];
  worldState?: {
    version: number;
    state: Record<string, unknown>;
  };
  error?: string;
};

type LoadRealmOptions = {
  resetIdentity?: boolean;
};

const initialState: AppState = {
  conversationMessages: [],
  events: [],
  messages: [],
  projectName: "Realm",
  roles: [],
  rooms: [],
  status: "loading",
  worlds: [],
};

const idleTurnRun: TurnRunState = { status: "idle" };

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
  const latestEventSeqRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        return {
          ...current,
          error: "Role turn failed. Check the trace for provider or policy details.",
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
  }, [state.events, turnRun.turnId]);

  async function selectWorld(worldId: string) {
    setSelectedWorldId(worldId);
    setSelectedRoomId(undefined);
    setDraft("");
    setTurnRun(idleTurnRun);
    setActiveSection("chats");
    await loadRealm(worldId, undefined, { resetIdentity: true });
  }

  async function selectRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setActiveSection("chats");
    await loadRealm(selectedWorld?.id, roomId);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || !selectedWorld || !selectedRoom) {
      return;
    }
    await client.sendMessage(selectedRoom.id, {
      content: draft.trim(),
      displayedAuthorId: identity,
      idempotencyKey: `web-message-${identity === "owner" ? "" : "identity-confirmed:"}${Date.now()}`,
      worldId: selectedWorld.id,
    });
    setDraft("");
    await loadRealm(selectedWorld.id, selectedRoom.id);
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
      setTurnRun({ ...request, error: message, status: "error", turnId: undefined });
      setState((current) => ({
        ...current,
        error: message,
      }));
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
    reload: () => loadRealm(selectedWorld?.id, selectedRoom?.id),
    runRoleId,
    runSelectedRoleTurn,
    selectedRole,
    selectedRoom,
    selectedWorld,
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

export function resolveIdentityAfterRealmLoad(
  currentIdentity: string,
  availableIdentities: string[],
  resetIdentity = false,
): string {
  if (resetIdentity) {
    return "owner";
  }
  return availableIdentities.includes(currentIdentity) ? currentIdentity : "owner";
}
