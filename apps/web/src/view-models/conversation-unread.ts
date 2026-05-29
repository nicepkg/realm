import type { Message } from "@realm/api-contract";

/**
 * Client-side, per-viewer-account unread tracking. The server has no read
 * cursors, so a room is "unread" for a viewer when its latest message was
 * created after the viewer last read that room AND the latest message was not
 * authored by the viewer themselves. Persisted per world in localStorage.
 */

/** `lastReadAt[viewerIdentity][roomId] = ISO timestamp`. */
export type ReadCursors = Record<string, Record<string, string>>;

export function unreadStorageKey(worldId: string): string {
  return `realm-read-cursors:${worldId}`;
}

export function parseReadCursors(raw: string | null): ReadCursors {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as ReadCursors;
  } catch {
    return {};
  }
}

export function markRoomRead(
  cursors: ReadCursors,
  viewerIdentity: string,
  roomId: string,
  at: string,
): ReadCursors {
  return {
    ...cursors,
    [viewerIdentity]: {
      ...cursors[viewerIdentity],
      [roomId]: at,
    },
  };
}

/**
 * Pure check: is `roomId` unread for `viewerIdentity` given the latest message
 * in that room and the viewer's read cursors?
 */
export function isRoomUnread(
  cursors: ReadCursors,
  viewerIdentity: string,
  roomId: string,
  latestMessage: Message | undefined,
): boolean {
  if (!latestMessage) {
    return false;
  }
  if (latestMessage.displayedAuthorId === viewerIdentity) {
    return false;
  }
  const lastReadAt = cursors[viewerIdentity]?.[roomId];
  if (!lastReadAt) {
    return true;
  }
  return latestMessage.createdAt > lastReadAt;
}
