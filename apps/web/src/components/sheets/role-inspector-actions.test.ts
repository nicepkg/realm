import { describe, expect, mock, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import type { RealmAppController } from "@/app/types.ts";
import { findExistingDmRoom, openChatWithRole } from "./role-inspector-actions.ts";

const ROLE: RoleSummary = { displayName: "Lin", id: "lin", model: "demo", source: "config" };

function dmRoom(id: string, memberIds: string[]): Room {
  return { id, memberIds, name: id, type: "dm", worldId: "w1" };
}

describe("findExistingDmRoom", () => {
  test("matches a dm whose members are exactly the viewer + role pair", () => {
    const rooms = [dmRoom("dm-1", ["owner", "lin"])];
    expect(findExistingDmRoom(rooms, "owner", "lin")?.id).toBe("dm-1");
  });

  test("ignores group rooms and dms with a different member set", () => {
    const rooms: Room[] = [
      { id: "g1", memberIds: ["owner", "lin"], name: "Group", type: "group", worldId: "w1" },
      dmRoom("dm-other", ["owner", "feng"]),
      dmRoom("dm-trio", ["owner", "lin", "feng"]),
    ];
    expect(findExistingDmRoom(rooms, "owner", "lin")).toBeUndefined();
  });
});

describe("openChatWithRole", () => {
  test("reuses an existing dm without creating a new room", async () => {
    const selectRoom = mock(async () => {});
    const createRoom = mock(async () => ({ room: dmRoom("x", []) }));
    const app = {
      client: { createRoom },
      reload: mock(async () => {}),
      selectedWorld: { id: "w1" } as WorldSummary,
      selectRoom,
      state: { rooms: [dmRoom("dm-1", ["owner", "lin"])] },
      viewerIdentity: "owner",
    } as unknown as RealmAppController;

    await openChatWithRole(app, ROLE);

    expect(createRoom).not.toHaveBeenCalled();
    expect(selectRoom).toHaveBeenCalledWith("dm-1");
  });

  test("creates a dm via the SDK then reloads and selects it", async () => {
    const selectRoom = mock(async () => {});
    const reload = mock(async () => {});
    const createRoom = mock(async () => ({ room: dmRoom("dm-new", ["owner", "lin"]) }));
    const app = {
      client: { createRoom },
      reload,
      selectedWorld: { id: "w1" } as WorldSummary,
      selectRoom,
      state: { rooms: [] as Room[] },
      viewerIdentity: "owner",
    } as unknown as RealmAppController;

    await openChatWithRole(app, ROLE);

    expect(createRoom).toHaveBeenCalledTimes(1);
    const [worldId, request] = createRoom.mock.calls[0] as unknown as [
      string,
      { type: string; memberIds: string[] },
    ];
    expect(worldId).toBe("w1");
    expect(request.type).toBe("dm");
    expect(request.memberIds).toEqual(["owner", "lin"]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(selectRoom).toHaveBeenCalledWith("dm-new");
  });
});
