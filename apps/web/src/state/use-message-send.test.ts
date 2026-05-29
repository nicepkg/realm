import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room } from "@realm/api-contract";
import { identityIsRoomMember } from "./use-message-send.ts";

/**
 * MC-R4-1 defensive send gate. `identityIsRoomMember` is the pure predicate the
 * `useMessageSend` hook consults before issuing a send, so a non-member role can
 * never be POSTed even if the disabled composer button is bypassed. It must agree
 * exactly with the messenger membership rule (`roomMembersForAvatar`).
 */
const roles: RoleSummary[] = [
  { displayName: "Lei Jun", id: "leijun", model: "default", source: "config" },
  { displayName: "Yun Yao", id: "yunyao", model: "default", source: "config" },
];

function dm(memberIds: string[]): Room {
  return { id: "infirmary", memberIds, name: "Infirmary", type: "dm", worldId: "cultivation" };
}

describe("identityIsRoomMember", () => {
  test("owner is always allowed (audited real operator, never gated)", () => {
    expect(identityIsRoomMember("owner", dm(["yunyao"]), roles)).toBe(true);
  });

  test("a role NOT in a dm room is blocked", () => {
    expect(identityIsRoomMember("leijun", dm(["owner", "yunyao"]), roles)).toBe(false);
  });

  test("a role IN the dm room is allowed", () => {
    expect(identityIsRoomMember("leijun", dm(["owner", "leijun"]), roles)).toBe(true);
  });

  test("world-main/group rooms admit every role (all-roles + owner)", () => {
    const main: Room = {
      id: "main",
      memberIds: [],
      name: "All Hands",
      type: "world-main",
      worldId: "cultivation",
    };
    expect(identityIsRoomMember("leijun", main, roles)).toBe(true);
    expect(identityIsRoomMember("yunyao", main, roles)).toBe(true);
  });
});
