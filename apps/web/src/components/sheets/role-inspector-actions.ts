import type { RoleSummary, Room } from "@realm/api-contract";
import type { RealmAppController } from "@/app/types.ts";

/**
 * Resolves the existing direct-message room shared by exactly `viewerId` and
 * `roleId`, if one is already present in the loaded room set. A DM is identified
 * by `type === "dm"` and a member set equal to the {viewer, role} pair, so a
 * "private chat" is never duplicated. Returns undefined when none exists yet.
 */
export function findExistingDmRoom(
  rooms: Room[],
  viewerId: string,
  roleId: string,
): Room | undefined {
  return rooms.find((room) => {
    if (room.type !== "dm") {
      return false;
    }
    const members = new Set(room.memberIds);
    return members.size === 2 && members.has(viewerId) && members.has(roleId);
  });
}

/**
 * Opens a direct chat with `role`: reuse the existing DM if one is present,
 * otherwise create it through the SAME SDK path the conversation-list "+ new
 * private chat" flow uses (`client.createRoom` with `type: "dm"`), reload the
 * realm so the new room is in state, then select it. Mirrors the create-room
 * sheet's reload→select sequence so the messenger lands in the right room.
 *
 * Throws on a failed create/select so the caller can surface a recoverable
 * error and keep the inspector open.
 */
export async function openChatWithRole(app: RealmAppController, role: RoleSummary): Promise<void> {
  const world = app.selectedWorld;
  if (!world) {
    return;
  }
  const viewerId = app.viewerIdentity;
  const existing = findExistingDmRoom(app.state.rooms, viewerId, role.id);
  if (existing) {
    await app.selectRoom(existing.id);
    return;
  }
  const response = await app.client.createRoom(world.id, {
    idempotencyKey: `web-open-chat-${role.id}-${Date.now()}`,
    memberIds: [viewerId, role.id],
    name: role.displayName,
    type: "dm",
  });
  await app.reload();
  await app.selectRoom(response.room.id);
}
