import { describe, expect, test } from "bun:test";
import type { Message } from "@realm/api-contract";
import {
  emptyConversationPrefs,
  parseConversationPrefs,
  toggleCollapsedSection,
  togglePinnedRoom,
} from "./conversation-prefs.ts";
import { isRoomUnread, markRoomRead, parseReadCursors } from "./conversation-unread.ts";

describe("conversation prefs", () => {
  test("pins to the front and unpins", () => {
    const pinned = togglePinnedRoom(emptyConversationPrefs, "room-a");
    expect(pinned.pinnedRoomIds).toEqual(["room-a"]);
    const pinnedTwo = togglePinnedRoom(pinned, "room-b");
    expect(pinnedTwo.pinnedRoomIds).toEqual(["room-b", "room-a"]);
    const unpinned = togglePinnedRoom(pinnedTwo, "room-a");
    expect(unpinned.pinnedRoomIds).toEqual(["room-b"]);
  });

  test("toggles section collapse flags independently", () => {
    const collapsed = toggleCollapsedSection(emptyConversationPrefs, "groups");
    expect(collapsed.collapsedSections.groups).toBe(true);
    expect(collapsed.collapsedSections.dms).toBe(false);
  });

  test("parses persisted prefs and tolerates garbage", () => {
    expect(parseConversationPrefs(null)).toEqual(emptyConversationPrefs);
    expect(parseConversationPrefs("not json")).toEqual(emptyConversationPrefs);
    const parsed = parseConversationPrefs(
      JSON.stringify({ collapsedSections: { pinned: true }, pinnedRoomIds: ["x"] }),
    );
    expect(parsed.pinnedRoomIds).toEqual(["x"]);
    expect(parsed.collapsedSections.pinned).toBe(true);
    expect(parsed.collapsedSections.groups).toBe(false);
  });
});

describe("conversation unread", () => {
  const message = (roomId: string, author: string, createdAt: string): Message => ({
    authorId: author,
    content: "hi",
    createdAt,
    displayedAuthorId: author,
    id: `${roomId}-${createdAt}`,
    roomId,
    worldId: "w1",
  });

  test("a room with no read cursor and a message from someone else is unread", () => {
    expect(
      isRoomUnread({}, "owner", "main", message("main", "leijun", "2026-05-28T00:00:00Z")),
    ).toBe(true);
  });

  test("the viewer's own latest message never marks unread", () => {
    expect(
      isRoomUnread({}, "leijun", "main", message("main", "leijun", "2026-05-28T00:00:00Z")),
    ).toBe(false);
  });

  test("marking read clears unread until a newer message arrives", () => {
    let cursors = parseReadCursors(null);
    cursors = markRoomRead(cursors, "owner", "main", "2026-05-28T01:00:00Z");
    expect(
      isRoomUnread(cursors, "owner", "main", message("main", "leijun", "2026-05-28T00:30:00Z")),
    ).toBe(false);
    expect(
      isRoomUnread(cursors, "owner", "main", message("main", "leijun", "2026-05-28T02:00:00Z")),
    ).toBe(true);
  });
});
