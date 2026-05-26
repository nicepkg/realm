import type {
  ConfigPatchProposal,
  Message,
  RealmEvent,
  RoleSummary,
  Room,
  StatePatchResult,
  WorldSummary,
} from "@realm/api-contract";
import { RealmHttpClient } from "@realm/client-sdk";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { WorldBuilderMode } from "./realm-builders.tsx";
import type { CreateRoomKind, GodRoleAction } from "./realm-context.tsx";
import type { AppSection } from "./realm-panels.tsx";
import { connectEventFeed, parseMemberIds, parsePatchValue, slugify } from "./realm-ui-helpers.ts";
import { buildConversationRows, isTraceEvent } from "./realm-view-model.ts";
import { useProjectPatchWorkflow } from "./use-project-patch-workflow.ts";
import { useWorldEvents } from "./use-world-events.ts";
import { useWorldSimulation } from "./use-world-simulation.ts";

type AppState = {
  status: "loading" | "ready" | "error";
  projectName: string;
  worlds: WorldSummary[];
  rooms: Room[];
  roles: RoleSummary[];
  messages: Message[];
  events: RealmEvent[];
  worldState?: {
    version: number;
    state: Record<string, unknown>;
  };
  error?: string;
};

const initialState: AppState = {
  status: "loading",
  projectName: "Realm",
  worlds: [],
  rooms: [],
  roles: [],
  messages: [],
  events: [],
};

export function useRealmAppState() {
  const client = useMemo(() => new RealmHttpClient(), []);
  const [state, setState] = useState<AppState>(initialState);
  const [activeSection, setActiveSection] = useState<AppSection>("chats");
  const [draft, setDraft] = useState("");
  const [identity, setIdentity] = useState("owner");
  const [roleName, setRoleName] = useState("Warren Buffett");
  const [runRoleId, setRunRoleId] = useState("");
  const [selectedWorldId, setSelectedWorldId] = useState<string | undefined>();
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>();
  const [turnStatus, setTurnStatus] = useState<"idle" | "running" | "error">("idle");
  const [activeTurnId, setActiveTurnId] = useState<string | undefined>();
  const [assistantGoal, setAssistantGoal] = useState(
    "Create a QA role for the software company world.",
  );
  const [proposal, setProposal] = useState<ConfigPatchProposal | undefined>();
  const [worldName, setWorldName] = useState("Investment Council");
  const [worldMode, setWorldMode] = useState<WorldBuilderMode>("debate");
  const [worldRoles, setWorldRoles] = useState("leijun,guchenfeng");
  const [roomType, setRoomType] = useState<CreateRoomKind>("group");
  const [roomName, setRoomName] = useState("New Group");
  const [roomMembers, setRoomMembers] = useState("owner,leijun");
  const [statePatchPath, setStatePatchPath] = useState("/publicState/notice");
  const [statePatchValue, setStatePatchValue] = useState('"ready"');
  const [statePatchReason, setStatePatchReason] = useState("Admin update from Web UI.");
  const [statePatchResult, setStatePatchResult] = useState<StatePatchResult | undefined>();
  const [godAction, setGodAction] = useState<GodRoleAction>("mute");
  const [godActionRoleId, setGodActionRoleId] = useState("");
  const [godActionReason, setGodActionReason] = useState("God adjudicates a role action.");
  const [godActionResult, setGodActionResult] = useState<StatePatchResult | undefined>();

  const selectedWorld =
    state.worlds.find((world) => world.id === selectedWorldId) ?? state.worlds[0];
  const selectedRoom =
    state.rooms.find((room) => room.id === selectedRoomId) ??
    state.rooms.find((room) => room.id === selectedWorld?.defaultRoomId) ??
    state.rooms[0];
  const identities = ["owner", "god", ...state.roles.map((role) => role.id)];
  const conversations = useMemo(
    () => buildConversationRows(state.rooms, state.messages, state.roles),
    [state.rooms, state.messages, state.roles],
  );
  const traceEvents = state.events.filter(isTraceEvent).slice(-8);
  const selectedRole = state.roles.find((role) => role.id === runRoleId) ?? state.roles[0];
  const projectPatchWorkflow = useProjectPatchWorkflow({
    client,
    events: state.events,
    roles: state.roles,
    selectedRoom,
    selectedWorld,
    reload: loadRealm,
  });
  const reloadSelected = () => loadRealm(selectedWorld?.id, selectedRoom?.id);
  const worldEvents = useWorldEvents({
    client,
    selectedRoom,
    selectedWorld,
    reload: reloadSelected,
  });
  const worldSimulation = useWorldSimulation({
    client,
    selectedRoom,
    selectedWorld,
    reload: reloadSelected,
  });

  useEffect(() => {
    void loadRealm(selectedWorldId, selectedRoomId);
    return connectEventFeed(() => {
      void loadRealm(selectedWorldId, selectedRoomId);
    });
  }, [selectedWorldId, selectedRoomId]);

  useEffect(() => {
    if (!activeTurnId) {
      return;
    }
    const completed = state.events.find(
      (event) =>
        (event.type === "turn.completed" ||
          event.type === "turn.failed" ||
          event.type === "turn.cancelled") &&
        event.turn.id === activeTurnId,
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
    setTurnStatus(completed.type === "turn.failed" ? "error" : "idle");
    setActiveTurnId(undefined);
  }, [activeTurnId, state.events]);

  async function loadRealm(preferredWorldId?: string, preferredRoomId?: string) {
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
      const messages = room ? (await client.listMessages(room.id)).messages : [];
      const worldState = world ? await client.getWorldState(world.id) : undefined;
      const events = (await client.listEvents()).events;
      const nextIdentities = ["owner", "god", ...effective.roles.map((role) => role.id)];
      setState({
        status: "ready",
        projectName: effective.project.name,
        worlds: effective.worlds,
        roles: effective.roles,
        rooms,
        messages,
        events,
        worldState: worldState
          ? {
              version: worldState.version,
              state: worldState.state,
            }
          : undefined,
      });
      setSelectedWorldId(world?.id);
      setSelectedRoomId(room?.id);
      setIdentity((current) => (nextIdentities.includes(current) ? current : "owner"));
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
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function selectWorld(worldId: string) {
    setSelectedWorldId(worldId);
    setSelectedRoomId(undefined);
    await loadRealm(worldId, undefined);
  }

  async function selectRoom(roomId: string) {
    setSelectedRoomId(roomId);
    await loadRealm(selectedWorld?.id, roomId);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !selectedWorld || !selectedRoom) {
      return;
    }
    await client.sendMessage(selectedRoom.id, {
      worldId: selectedWorld.id,
      displayedAuthorId: identity,
      content: draft.trim(),
      idempotencyKey: `web-message-${Date.now()}`,
    });
    setDraft("");
    await loadRealm(selectedWorld.id, selectedRoom.id);
  }

  async function proposeRole() {
    const roleId = slugify(roleName) || "custom-role";
    const response = await client.proposeRole({
      id: roleId,
      displayName: roleName,
      model: "default",
      summary: `${roleName} role created from the visual builder.`,
    });
    setProposal(response.patch);
  }

  async function proposeAssistantPatch() {
    const response = await fetch("/api/assistant/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: assistantGoal }),
    });
    const payload = (await response.json()) as { patch: ConfigPatchProposal };
    setProposal(payload.patch);
  }

  async function proposeWorld() {
    const response = await client.proposeWorld({
      id: slugify(worldName) || "custom-world",
      name: worldName.trim() || "Custom World",
      mode: worldMode,
      roomName: "All Hands",
      roleIds: parseMemberIds(worldRoles),
    });
    setProposal(response.patch);
  }

  async function applyProposal() {
    if (!proposal) {
      return;
    }
    await client.applyConfigPatch(proposal.id);
    setProposal(undefined);
    await loadRealm(selectedWorld?.id, selectedRoom?.id);
  }

  async function createRoom() {
    if (!selectedWorld || !roomName.trim()) {
      return;
    }
    const response = await client.createRoom(selectedWorld.id, {
      type: roomType,
      name: roomName.trim(),
      memberIds: parseMemberIds(roomMembers),
      idempotencyKey: `web-room-${Date.now()}`,
    });
    setSelectedRoomId(response.room.id);
    await loadRealm(selectedWorld.id, response.room.id);
  }

  async function runSelectedRoleTurn() {
    if (!selectedWorld || !selectedRoom || !runRoleId || turnStatus === "running") {
      return;
    }
    setTurnStatus("running");
    try {
      const response = await client.startRoleTurn(selectedRoom.id, {
        worldId: selectedWorld.id,
        roleId: runRoleId,
        timeoutMs: 30_000,
      });
      setActiveTurnId(response.turnId);
    } catch (error) {
      setTurnStatus("error");
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function cancelActiveTurn() {
    if (!activeTurnId) {
      return;
    }
    await client.cancelTurn(activeTurnId);
  }

  async function applyAdminStatePatch() {
    if (!selectedWorld || !statePatchPath.trim() || !statePatchReason.trim()) {
      return;
    }
    const response = await client.adminPatchState({
      worldId: selectedWorld.id,
      actorId: "god",
      expectedVersion: state.worldState?.version,
      operations: [
        {
          op: "set",
          path: statePatchPath.trim(),
          value: parsePatchValue(statePatchValue),
        },
      ],
      reason: statePatchReason.trim(),
      idempotencyKey: `web-admin-state-${Date.now()}`,
    });
    setStatePatchResult(response.result);
    await loadRealm(selectedWorld.id, selectedRoom?.id);
  }

  async function applyGodAction() {
    if (!selectedWorld || !godActionRoleId || !godActionReason.trim()) {
      return;
    }
    const response = await client.applyGodRoleAction(selectedWorld.id, {
      action: godAction,
      targetRoleId: godActionRoleId,
      expectedVersion: state.worldState?.version,
      reason: godActionReason.trim(),
      idempotencyKey: `web-god-action-${Date.now()}`,
    });
    setGodActionResult(response.result);
    await loadRealm(selectedWorld.id, selectedRoom?.id);
  }

  return {
    activeSection,
    applyAdminStatePatch,
    applyGodAction,
    applyProposal,
    assistantGoal,
    cancelActiveTurn,
    client,
    conversations,
    createRoom,
    draft,
    godAction,
    godActionReason,
    godActionResult,
    godActionRoleId,
    identities,
    identity,
    proposal,
    proposeAssistantPatch,
    proposeRole,
    proposeWorld,
    ...projectPatchWorkflow,
    ...worldEvents,
    ...worldSimulation,
    reload: () => loadRealm(selectedWorld?.id, selectedRoom?.id),
    roleName,
    roomMembers,
    roomName,
    roomType,
    runRoleId,
    runSelectedRoleTurn,
    selectedRole,
    selectedRoom,
    selectedWorld,
    sendMessage,
    setActiveSection,
    setAssistantGoal,
    setDraft,
    setGodAction,
    setGodActionReason,
    setGodActionRoleId,
    setIdentity,
    setRoleName,
    setRoomMembers,
    setRoomName,
    setRoomType,
    setRunRoleId,
    setStatePatchPath,
    setStatePatchReason,
    setStatePatchValue,
    setWorldMode,
    setWorldName,
    setWorldRoles,
    state,
    statePatchPath,
    statePatchReason,
    statePatchResult,
    statePatchValue,
    traceEvents,
    turnStatus,
    worldMode,
    worldName,
    worldRoles,
    selectRoom,
    selectWorld,
  };
}
