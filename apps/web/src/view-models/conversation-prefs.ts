/**
 * Client-side conversation preferences (pin + section collapse).
 *
 * The server has no `pinned`/`collapsed` concept on rooms, so this is purely a
 * UI preference. It persists per world in localStorage. Consistent with the
 * markdown-only rule, this is gitignored runtime preference, not domain truth.
 */

export type ConversationSectionKey = "pinned" | "groups" | "dms";

export type ConversationPrefs = {
  /** Ordered, most-recently-pinned first. */
  pinnedRoomIds: string[];
  collapsedSections: Record<ConversationSectionKey, boolean>;
};

export const emptyConversationPrefs: ConversationPrefs = {
  collapsedSections: { dms: false, groups: false, pinned: false },
  pinnedRoomIds: [],
};

export function conversationPrefsStorageKey(worldId: string): string {
  return `realm-convo-prefs:${worldId}`;
}

/** Pure toggle: pins an unpinned room (front of list) or unpins a pinned one. */
export function togglePinnedRoom(prefs: ConversationPrefs, roomId: string): ConversationPrefs {
  const isPinned = prefs.pinnedRoomIds.includes(roomId);
  return {
    ...prefs,
    pinnedRoomIds: isPinned
      ? prefs.pinnedRoomIds.filter((id) => id !== roomId)
      : [roomId, ...prefs.pinnedRoomIds],
  };
}

/** Pure toggle for a section's collapsed flag. */
export function toggleCollapsedSection(
  prefs: ConversationPrefs,
  key: ConversationSectionKey,
): ConversationPrefs {
  return {
    ...prefs,
    collapsedSections: {
      ...prefs.collapsedSections,
      [key]: !prefs.collapsedSections[key],
    },
  };
}

/** Parse a persisted value, tolerating partial/corrupt shapes. */
export function parseConversationPrefs(raw: string | null): ConversationPrefs {
  if (!raw) {
    return emptyConversationPrefs;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConversationPrefs>;
    return {
      collapsedSections: {
        dms: Boolean(parsed.collapsedSections?.dms),
        groups: Boolean(parsed.collapsedSections?.groups),
        pinned: Boolean(parsed.collapsedSections?.pinned),
      },
      pinnedRoomIds: Array.isArray(parsed.pinnedRoomIds)
        ? parsed.pinnedRoomIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return emptyConversationPrefs;
  }
}
