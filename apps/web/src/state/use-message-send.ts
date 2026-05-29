import type { Message, RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { type FormEvent, type MutableRefObject, useCallback, useState } from "react";
import { roomMembersForAvatar } from "@/components/messenger/messenger-primitives.tsx";
import {
  type AppState,
  appendSentMessage,
  type PendingMessage,
  type SendError,
} from "@/state/realm-app-state-model.ts";

type UseMessageSendInput = {
  client: RealmHttpClient;
  draft: string;
  setDraft: (value: string) => void;
  identity: string;
  /** All roles in the loaded realm — used to resolve room membership defensively. */
  roles: RoleSummary[];
  selectedWorld: WorldSummary | undefined;
  selectedRoom: Room | undefined;
  /** Ref to the currently-selected room id, read at confirmation time. */
  selectedRoomIdRef: MutableRefObject<string | undefined>;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
};

/**
 * Message send subsystem: optimistic pending bubbles, success folding without a
 * full reload, and recoverable inline failures that preserve the draft. Split
 * out of the app-state controller to keep domain send logic cohesive and the
 * controller file small.
 */
export function useMessageSend({
  client,
  draft,
  identity,
  roles,
  selectedRoom,
  selectedRoomIdRef,
  selectedWorld,
  setDraft,
  setState,
}: UseMessageSendInput) {
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState<SendError | undefined>();

  const clearPendingSendState = useCallback(() => {
    setPendingMessages([]);
    setSendError(undefined);
  }, []);

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
        setState((current: AppState) =>
          appendSentMessage(current, response.message as Message, {
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
    [client, selectedRoomIdRef, setState],
  );

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !selectedWorld || !selectedRoom) {
      return;
    }
    // MC-R4-1 defensive gate: a send AS a role must obey the same room-membership
    // constraint the composer button enforces, so a programmatic / bypassed caller
    // can never POST a role into a room it does not belong to. Owner sends are
    // always allowed. On a blocked send we abort BEFORE any state mutation: no
    // network call, no optimistic pending bubble, and crucially the draft is left
    // intact (Don Norman: recovery — never silently lose unsent text).
    if (!identityIsRoomMember(identity, selectedRoom, roles)) {
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

  return {
    clearPendingSendState,
    dismissSendError,
    pendingMessages,
    retrySend,
    sendError,
    sendErrorDetails,
    sendMessage,
  };
}

/**
 * Whether `identity` may post into `room`. The owner is always allowed (it is the
 * audited real operator, never gated by role membership). Any other identity must
 * be a member of the target room per the SAME predicate the messenger UI uses
 * (`roomMembersForAvatar`), so the defensive send gate and the composer button
 * enforce one rule (MC-R4-1). `god` is not a chat identity and is blocked upstream.
 */
export function identityIsRoomMember(identity: string, room: Room, roles: RoleSummary[]): boolean {
  if (identity === "owner") {
    return true;
  }
  return roomMembersForAvatar(room, roles).some((member) => member.id === identity);
}
