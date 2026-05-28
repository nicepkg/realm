import { describe, expect, test } from "bun:test";
import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import { filterWorldsForManager } from "./world-manager-view-model.ts";

describe("world manager view model", () => {
  test("filters worlds by name, mode, room, and role labels", () => {
    const roles: RoleSummary[] = [
      { displayName: "Lei Jun", id: "leijun", model: "default", source: "config" },
      { displayName: "QA Reviewer", id: "qa", model: "default", source: "config" },
    ];
    const worlds: WorldSummary[] = [
      world("cultivation", "Cultivation Sim", "main", "simulation", ["leijun"]),
      world("software", "Software Team", "standup", "workflow", ["qa"]),
    ];
    const cultivationWorld = worlds[0] as WorldSummary;
    const softwareWorld = worlds[1] as WorldSummary;

    expect(filterWorldsForManager(worlds, roles, "")).toEqual(worlds);
    expect(filterWorldsForManager(worlds, roles, "cult")).toEqual([cultivationWorld]);
    expect(filterWorldsForManager(worlds, roles, "workflow")).toEqual([softwareWorld]);
    expect(filterWorldsForManager(worlds, roles, "standup")).toEqual([softwareWorld]);
    expect(filterWorldsForManager(worlds, roles, "qa reviewer")).toEqual([softwareWorld]);
  });
});

function world(
  id: string,
  name: string,
  defaultRoomId: string,
  type: WorldSummary["mode"]["type"],
  roleIds: string[],
): WorldSummary {
  return {
    defaultRoomId,
    id,
    mode: { time: { kind: "manual" }, type },
    name,
    roleIds,
  };
}
