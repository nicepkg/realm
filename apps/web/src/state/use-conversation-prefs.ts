import { useCallback, useEffect, useState } from "react";
import {
  type ConversationPrefs,
  type ConversationSectionKey,
  conversationPrefsStorageKey,
  emptyConversationPrefs,
  parseConversationPrefs,
  toggleCollapsedSection,
  togglePinnedRoom,
} from "@/view-models/conversation-prefs.ts";
import {
  markRoomRead,
  parseReadCursors,
  type ReadCursors,
  unreadStorageKey,
} from "@/view-models/conversation-unread.ts";

function readStorage(key: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(key);
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, value);
}

/**
 * Per-world conversation UI state: pin order, section collapse, and per-viewer
 * read cursors. All persisted to localStorage (gitignored runtime preference).
 * Keyed by world so switching worlds loads that world's preferences.
 */
export function useConversationPrefs(worldId: string | undefined) {
  const [prefs, setPrefs] = useState<ConversationPrefs>(emptyConversationPrefs);
  const [readCursors, setReadCursors] = useState<ReadCursors>({});

  useEffect(() => {
    if (!worldId) {
      setPrefs(emptyConversationPrefs);
      setReadCursors({});
      return;
    }
    setPrefs(parseConversationPrefs(readStorage(conversationPrefsStorageKey(worldId))));
    setReadCursors(parseReadCursors(readStorage(unreadStorageKey(worldId))));
  }, [worldId]);

  const persistPrefs = useCallback(
    (next: ConversationPrefs) => {
      setPrefs(next);
      if (worldId) {
        writeStorage(conversationPrefsStorageKey(worldId), JSON.stringify(next));
      }
    },
    [worldId],
  );

  const togglePin = useCallback(
    (roomId: string) => persistPrefs(togglePinnedRoom(prefs, roomId)),
    [persistPrefs, prefs],
  );

  const toggleSection = useCallback(
    (key: ConversationSectionKey) => persistPrefs(toggleCollapsedSection(prefs, key)),
    [persistPrefs, prefs],
  );

  const markRead = useCallback(
    (viewerIdentity: string, roomId: string) => {
      const next = markRoomRead(readCursors, viewerIdentity, roomId, new Date().toISOString());
      setReadCursors(next);
      if (worldId) {
        writeStorage(unreadStorageKey(worldId), JSON.stringify(next));
      }
    },
    [readCursors, worldId],
  );

  return { markRead, prefs, readCursors, togglePin, toggleSection };
}
