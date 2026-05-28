import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room } from "@realm/api-contract";
import {
  avatarProfileForIdentity,
  groupRowsForMembers,
  groupVisualMembers,
  roomMembersForAvatar,
} from "./messenger-primitives.tsx";

describe("messenger avatar primitives", () => {
  test("derives deterministic fallback avatars from identity names", () => {
    const first = avatarProfileForIdentity("guchenfeng");
    const second = avatarProfileForIdentity("guchenfeng");
    const other = avatarProfileForIdentity("leijun");

    expect(first).toEqual(second);
    expect(typeof first.glyph).toBe("string");
    expect(other).not.toEqual(first);
  });

  test("builds WeChat-style group avatar rows from room members", () => {
    const roles: RoleSummary[] = Array.from({ length: 10 }, (_, index) => ({
      displayName: `Role ${index + 1}`,
      id: `role-${index + 1}`,
      model: "default",
      source: "config",
    }));
    const room: Room = {
      id: "main",
      memberIds: [],
      name: "All Hands",
      type: "world-main",
      worldId: "cultivation",
    };

    const members = roomMembersForAvatar(room, roles);
    const rows = groupRowsForMembers(members.slice(0, 9));

    expect(members[0]).toEqual({ id: "owner", label: "Boss" });
    expect(rows).toHaveLength(3);
    expect(rows.flat()).toHaveLength(9);
    expect(rows.every((row) => row.length <= 3)).toBe(true);
  });

  test("keeps sparse group avatars as real WeChat member collages", () => {
    const visualMembers = groupVisualMembers("All Hands", [
      { id: "owner", label: "Boss" },
      { id: "leijun", label: "Lei Jun" },
      { id: "qa", label: "QA" },
      { id: "mentor", label: "Mentor" },
    ]);
    const rows = groupRowsForMembers(visualMembers);

    expect(visualMembers).toHaveLength(4);
    expect(rows.map((row) => row.length)).toEqual([2, 2]);
    expect(visualMembers.slice(0, 4).map((member) => member.id)).toEqual([
      "owner",
      "leijun",
      "qa",
      "mentor",
    ]);
  });

  test("centers small groups and caps large groups to a nine-grid", () => {
    const members = Array.from({ length: 9 }, (_, index) => ({
      id: `member-${index + 1}`,
      label: `Member ${index + 1}`,
    }));

    expect(groupRowsForMembers(members.slice(0, 1)).map((row) => row.length)).toEqual([1]);
    expect(groupRowsForMembers(members.slice(0, 2)).map((row) => row.length)).toEqual([2]);
    expect(groupRowsForMembers(members.slice(0, 3)).map((row) => row.length)).toEqual([1, 2]);
    expect(groupRowsForMembers(members.slice(0, 4)).map((row) => row.length)).toEqual([2, 2]);
    expect(groupRowsForMembers(members.slice(0, 5)).map((row) => row.length)).toEqual([2, 3]);
    expect(groupRowsForMembers(members.slice(0, 8)).map((row) => row.length)).toEqual([2, 3, 3]);
    expect(groupRowsForMembers(members).map((row) => row.length)).toEqual([3, 3, 3]);
  });
});
