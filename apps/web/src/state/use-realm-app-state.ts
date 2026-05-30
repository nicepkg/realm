import { RealmHttpClient } from "@realm/client-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roomMembersForAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { useI18n } from "@/i18n/index.tsx";
import { connectEventFeed, type EventFeedStatus } from "@/state/event-feed.ts";
import {
  type FailedDraftStore,
  rehydrateFailedDraft,
  stashFailedDraft,
} from "@/state/failed-draft-store.ts";
import {
  type AppSection,
  type AppState,
  initialState,
  type LoadRealmOptions,
  pendingResumeFromStoredIdentity,
  readViewerIdentity,
  resolveIdentityAfterRealmLoad,
  resolveRoomRunRoleId,
  viewerStorageKey,
} from "@/state/realm-app-state-model.ts";
import { useConversationPrefs } from "@/state/use-conversation-prefs.ts";
import { useMessageSend } from "@/state/use-message-send.ts";
import { resolveSelectedRole } from "@/state/use-realm-app-state-roles.ts";
import { useTurnActions } from "@/state/use-turn-actions.ts";
import {
  persistableWorldId,
  readLastWorldId,
  resolveLoadedWorld,
  resolveSelectedWorld,
  writeLastWorldId,
} from "@/state/world-selection.ts";
import { buildConversationRows, isTraceEvent } from "@/view-models/realm-view-model.ts";

export type {
  AppSection,
  GodRoleAction,
  PendingMessage,
  SendError,
  TurnRunState,
} from "@/state/realm-app-state-model.ts";

// Re-export so existing import sites (and tests) keep their path while the impl
// lives co-located with the rest of world-selection in `world-selection.ts`.
export { readLastWorldId, writeLastWorldId } from "@/state/world-selection.ts";

/**
 * `loadRealm` options extended with the world-selection authority flag. Kept local
 * (rather than widening the shared model type) because authority is a concern of
 * THIS hook's world-switch orchestration, not of the pure model. When true, the
 * requested `preferredWorldId` is treated as an authoritative selection that wins
 * even before it lands in the loaded roster (a just-created world racing a reload).
 */
type LoadRealmCallOptions = LoadRealmOptions & {
  authoritativeWorld?: boolean;
};

export function useRealmAppState() {
  const { t } = useI18n();
  const client = useMemo(() => new RealmHttpClient(), []);
  const [state, setState] = useState<AppState>(initialState);
  const [activeSection, setActiveSection] = useState<AppSection>("chats");
  const [draft, setDraft] = useState("");
  const [identity, setIdentity] = useState("owner");
  // The "logged-in" account whose perspective the whole messenger renders
  // (WeChat-style account switch). `owner` = Boss operator god-eye view; a role
  // id = that role account's view (Boss remains the audited real operator).
  const [viewerIdentity, setViewerIdentityState] = useState("owner");
  const [runRoleId, setRunRoleId] = useState("");
  // Restore the operator's last-selected world across reloads. `loadRealm` already
  // falls back cleanly (defaultWorldId → worlds[0]) and re-persists the resolved id
  // via `setSelectedWorldId`, so a stale stored id self-heals on the first load.
  const [selectedWorldId, setSelectedWorldId] = useState<string | undefined>(readLastWorldId);
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>();
  // Live mirror of the selected world so a background reload reconciles the CURRENT
  // selection, never the id captured at effect setup (the stale-closure revert bug).
  const selectedWorldIdRef = useRef<string | undefined>(selectedWorldId);
  selectedWorldIdRef.current = selectedWorldId;
  // A persisted non-owner viewer identity is never silently re-activated on world
  // entry (L4-01). It is stashed here as a suggestion the operator can confirm
  // through the gated takeover dialog via `resumeIdentity`.
  const [pendingResumeIdentity, setPendingResumeIdentity] = useState<string | undefined>();
  // Recovery store for unsent text after a failed send (EP-1). Navigation clears
  // the pending send state, which holds the only surviving copy of the draft; we
  // fold that draft here keyed by (world, room, identity) so returning to the
  // exact room/identity rehydrates the composer instead of losing the text.
  const [failedDrafts, setFailedDrafts] = useState<FailedDraftStore>(() => new Map());
  // Honest in-flight feedback for a room/world switch: true between the optimistic
  // id selection and the awaited realm load, so the header can show a calm pending
  // treatment instead of silently rendering stale content (FB2-01/FB2-05).
  const [switching, setSwitching] = useState(false);
  // Honest SSE liveness: `reconnecting` while the event stream is recovering from a
  // drop (idle timeout, proxy reset, sleep/wake) so the header can surface a calm
  // non-blocking affordance instead of looking frozen (FB2-03).
  const [connection, setConnection] = useState<EventFeedStatus>("open");
  const connectionRef = useRef<EventFeedStatus>("open");
  const latestEventSeqRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedRoomIdRef = useRef<string | undefined>(undefined);
  selectedRoomIdRef.current = selectedRoomId;
  // Reconcile the god-action target role after a realm load, indirected through a
  // ref so `loadRealm` stays decoupled from the turn/god subsystem (which itself
  // depends on `loadRealm`) and keeps a stable `[client]` dependency.
  const reconcileGodActionRoleRef = useRef<(roles: AppState["roles"]) => void>(() => {});

  const loadRealm = useCallback(
    async (
      preferredWorldId?: string,
      preferredRoomId?: string,
      options: LoadRealmCallOptions = {},
    ) => {
      try {
        const effective = await client.getEffectiveConfig();
        // Resolve the world WITHOUT the old silent snap to worlds[0]: an authoritative
        // selection wins even when absent (just-created world racing a reload); an
        // implicit restore self-heals a stale id. See `resolveLoadedWorld`.
        const resolution = resolveLoadedWorld(effective.worlds, {
          preferredWorldId,
          defaultWorldId: effective.project.defaultWorldId,
          authoritative: Boolean(options.authoritativeWorld),
        });
        const world = resolution.world;
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
        // Keep the requested id for an authoritative-but-absent world (never revert);
        // only touch the room when a real world resolved (an absent world has none).
        setSelectedWorldId(resolution.selectedWorldId);
        if (world) {
          setSelectedRoomId(room?.id);
        }
        setIdentity((current) =>
          resolveIdentityAfterRealmLoad(current, nextIdentities, options.resetIdentity),
        );
        // MC-R4-1: the run target must be a role that is actually a MEMBER of the
        // selected room, so the visible run control can only ever post into a room
        // the role belongs to. Clamp to the room's first role member, keeping the
        // current selection when it is still a member; fall back to the first role
        // only when the room has no role members.
        const roomRoleMemberIds = room
          ? roomMembersForAvatar(room, effective.roles)
              .map((member) => member.id)
              .filter((id) => effective.roles.some((role) => role.id === id))
          : [];
        setRunRoleId((current) =>
          resolveRoomRunRoleId(
            roomRoleMemberIds,
            effective.roles.map((role) => role.id),
            current,
          ),
        );
        reconcileGodActionRoleRef.current(effective.roles);
        return resolution;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          status: "error",
        }));
        return undefined;
      }
    },
    [client],
  );

  // Void-returning reload adapter for consumers that only need the side effect
  // (turn actions), keeping `loadRealm`'s resolution return for the world-switch path.
  const reloadRealm = useCallback(
    async (preferredWorldId?: string, preferredRoomId?: string): Promise<void> => {
      await loadRealm(preferredWorldId, preferredRoomId);
    },
    [loadRealm],
  );

  // A background reload (SSE event / reconnect) reconciles the CURRENT selection
  // read from refs at fire time, NOT an id captured at effect setup — killing the
  // stale-closure bug that reverted a just-selected world. Non-authoritative: it may
  // self-heal a genuinely stale id, but the live id is always the fresh selection.
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) {
      return;
    }
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = undefined;
      void loadRealm(selectedWorldIdRef.current, selectedRoomIdRef.current);
    }, 100);
  }, [loadRealm]);

  const selectedWorld = resolveSelectedWorld(state.worlds, selectedWorldId);
  const selectedRoom =
    state.rooms.find((room) => room.id === selectedRoomId) ??
    state.rooms.find((room) => room.id === selectedWorld?.defaultRoomId) ??
    state.rooms[0];
  const identities = ["owner", ...state.roles.map((role) => role.id)];
  const conversations = useMemo(
    () =>
      buildConversationRows(
        state.rooms,
        state.conversationMessages,
        state.roles,
        {
          god: t("common.god"),
          owner: t("common.boss"),
        },
        viewerIdentity,
      ),
    [state.rooms, state.conversationMessages, state.roles, t, viewerIdentity],
  );
  const conversationPrefs = useConversationPrefs(selectedWorld?.id);
  const selectedRole = resolveSelectedRole(state.roles, selectedWorld, runRoleId);
  const traceEvents = state.events.filter(isTraceEvent).slice(-8);
  const send = useMessageSend({
    client,
    draft,
    identity,
    roles: state.roles,
    selectedRoom,
    selectedRoomIdRef,
    selectedWorld,
    setDraft,
    setState,
  });
  const { clearPendingSendState } = send;
  const turn = useTurnActions({
    client,
    events: state.events,
    loadRealm: reloadRealm,
    runRoleId,
    selectedRoom,
    selectedWorld,
    t,
    worldStateVersion: state.worldState?.version,
  });
  reconcileGodActionRoleRef.current = turn.reconcileGodActionRole;

  // Stash any failed-send draft into the recovery store, then clear pending send
  // state. Used by every navigation path so wiping `sendError` never drops the
  // last copy of unsent user text (EP-1 recovery rule).
  const preserveAndClearPendingSend = useCallback(() => {
    setFailedDrafts((store) => stashFailedDraft(store, send.sendError));
    clearPendingSendState();
  }, [clearPendingSendState, send.sendError]);

  // Rehydrate a stashed failed-send draft when its exact room/identity becomes
  // active again (EP-1). Only fires when the composer is empty so an in-progress
  // edit is never clobbered, and consumes the entry so it is applied once.
  useEffect(() => {
    if (!selectedWorld?.id || !selectedRoom?.id) {
      return;
    }
    const result = rehydrateFailedDraft(failedDrafts, {
      currentDraft: draft,
      identity,
      roomId: selectedRoom.id,
      worldId: selectedWorld.id,
    });
    if (result.draft !== undefined) {
      setFailedDrafts(result.store);
      setDraft(result.draft);
    }
  }, [selectedWorld?.id, selectedRoom?.id, identity, draft, failedDrafts]);

  useEffect(() => {
    let disconnect = () => {};
    let disposed = false;
    // Boot load (implicit restore) + a mount-once SSE subscription that reconciles
    // the LIVE selection via `scheduleReload` (refs), so switching worlds never
    // rebuilds the stream and a background reload never reverts a just-made selection.
    void loadRealm(selectedWorldIdRef.current, selectedRoomIdRef.current).then(() => {
      if (disposed) {
        return;
      }
      disconnect = connectEventFeed(
        (seq) => {
          if (seq !== undefined && seq <= latestEventSeqRef.current) {
            return;
          }
          scheduleReload();
        },
        latestEventSeqRef.current,
        (status) => {
          const recovered = status === "open" && connectionRef.current === "reconnecting";
          connectionRef.current = status;
          setConnection(status);
          // Fold in any events missed while the stream was down: the recovered
          // connection only replays from `lastSeq`, but a full reload reconciles
          // room/world state that changed during the outage.
          if (recovered) {
            scheduleReload();
          }
        },
      );
    });
    return () => {
      disposed = true;
      disconnect();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = undefined;
      }
    };
  }, [loadRealm, scheduleReload]);

  /**
   * Switch the viewer account (WeChat-style account login). The whole messenger
   * re-renders from this account's perspective: conversation scope, unread,
   * message right-alignment, and the default send-as identity. Boss remains the
   * audited real operator when viewing a role account. Persisted per world.
   *
   * This is the highest-risk perspective swap, so it must carry the SAME honest
   * pending feedback as `selectWorld`/`selectRoom`: `switching` flips true before
   * the awaited realm reload and clears in a finally, letting the chat-header dim
   * and surface the loading affordance instead of silently swapping content
   * (FB2-01/FB2-05). The reload is explicit (not effect-driven) so the pending
   * window is bounded to the perspective swap and resolves deterministically.
   */
  async function setViewerIdentity(id: string) {
    setSwitching(true);
    setViewerIdentityState(id);
    setIdentity(id);
    setSelectedRoomId(undefined);
    setDraft("");
    setPendingResumeIdentity(undefined);
    preserveAndClearPendingSend();
    if (selectedWorld?.id && typeof localStorage !== "undefined") {
      localStorage.setItem(viewerStorageKey(selectedWorld.id), id);
    }
    try {
      await loadRealm(selectedWorld?.id);
    } finally {
      setSwitching(false);
    }
  }

  /**
   * Confirm a stashed resume suggestion. Routes through the same gated takeover
   * path (`setViewerIdentity`) so resuming a role account is never silent — the
   * caller is expected to gate this behind the takeover confirmation dialog. It
   * inherits the same `switching` pending window as a direct identity swap.
   */
  async function resumeIdentity() {
    if (pendingResumeIdentity) {
      await setViewerIdentity(pendingResumeIdentity);
    }
  }

  async function selectWorld(worldId: string) {
    // Optimistic id selection keeps the row highlight instant; `switching` is the
    // honest pending flag the header reads while the realm reload is in flight.
    setSwitching(true);
    setSelectedWorldId(worldId);
    // Imperatively advance the live ref too, so a concurrent SSE-triggered reload
    // reconciles THIS id, not the previous selection captured before this render
    // commits — the just-created world must win the moment it is selected.
    selectedWorldIdRef.current = worldId;
    setSelectedRoomId(undefined);
    selectedRoomIdRef.current = undefined;
    setDraft("");
    turn.resetTurnRun();
    setActiveSection("chats");
    preserveAndClearPendingSend();
    // L4-01: never silently re-activate a persisted role identity. Restore owner
    // (safe self-return) as the active send identity, and only *offer* a stored
    // role as a pending resume suggestion the operator can confirm via the gate.
    const restoredViewer = readViewerIdentity(worldId);
    setViewerIdentityState("owner");
    setIdentity("owner");
    setPendingResumeIdentity(pendingResumeFromStoredIdentity(restoredViewer));
    try {
      // Authoritative: this selection wins even if the world has not yet landed in the
      // roster (a just-created world racing a reload), so the load can NEVER snap back
      // to worlds[0]. Persist ONLY the id that resolved to a real world (no ghost id).
      const resolution = await loadRealm(worldId, undefined, {
        resetIdentity: true,
        authoritativeWorld: true,
      });
      const persistId = resolution ? persistableWorldId(resolution) : undefined;
      if (persistId) {
        writeLastWorldId(persistId);
      }
    } finally {
      setSwitching(false);
    }
  }

  async function selectRoom(roomId: string) {
    // Optimistic id selection keeps the row highlight instant; `switching` is the
    // honest pending flag the header reads while the realm reload is in flight.
    setSwitching(true);
    setSelectedRoomId(roomId);
    // Keep the live ref in lockstep so a concurrent background reload reconciles the
    // room just selected, not the previous one captured before this render commits.
    selectedRoomIdRef.current = roomId;
    setActiveSection("chats");
    // MC-R4-1 decision: switching to a room the impersonated viewer is NOT a member
    // of does NOT auto-exit takeover (that would be a surprising side effect) and
    // does NOT wire a new transient flag here. The composer already renders a calm,
    // named `composer-send-block` reason chip and keeps Send disabled for that exact
    // state, and the persistent impersonation banner already offers one-click
    // "Exit takeover" recovery regardless of room. So the non-member feedback +
    // recovery are both already one click away — adding a selectRoom flag would be
    // redundant state for no extra affordance. This is an explicit choice, not an
    // omission (Don Norman: recovery without surprising side effects).
    turn.setGodActionResult(undefined);
    preserveAndClearPendingSend();
    conversationPrefs.markRead(viewerIdentity, roomId);
    try {
      await loadRealm(selectedWorld?.id, roomId);
    } finally {
      setSwitching(false);
    }
  }

  return {
    activeSection,
    applyGodAction: turn.applyGodAction,
    cancelActiveTurn: turn.cancelActiveTurn,
    clearTurnError: turn.clearTurnError,
    client,
    connection,
    conversationPrefs,
    conversations,
    draft,
    godAction: turn.godAction,
    godActionReason: turn.godActionReason,
    godActionResult: turn.godActionResult,
    godActionRoleId: turn.godActionRoleId,
    identities,
    identity,
    dismissSendError: send.dismissSendError,
    pendingMessages: selectedRoom
      ? send.pendingMessages.filter((entry) => entry.roomId === selectedRoom.id)
      : [],
    pendingResumeIdentity,
    resumeIdentity,
    reload: () => loadRealm(selectedWorld?.id, selectedRoom?.id),
    retrySend: send.retrySend,
    runRoleId,
    runSelectedRoleTurn: turn.runSelectedRoleTurn,
    selectedRole,
    selectedRoom,
    selectedWorld,
    sendError: send.sendError,
    sendErrorDetails: send.sendErrorDetails,
    sendMessage: send.sendMessage,
    selectRoom,
    selectWorld,
    setActiveSection,
    setDraft,
    setGodAction: turn.setGodAction,
    setGodActionReason: turn.setGodActionReason,
    setGodActionRoleId: turn.setGodActionRoleId,
    setIdentity,
    setRunRoleId,
    setViewerIdentity,
    state,
    switching,
    traceEvents,
    turnRun: turn.turnRun,
    turnStatus: turn.turnRun.status,
    viewerIdentity,
  };
}
