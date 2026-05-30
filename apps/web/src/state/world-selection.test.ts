import { describe, expect, test } from "bun:test";
import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import { resolveSelectedRole } from "./use-realm-app-state-roles.ts";
import { persistableWorldId, resolveLoadedWorld, resolveSelectedWorld } from "./world-selection.ts";

describe("world selection never silently falls back to worlds[0] (STALE-SELECTED-WORLD-ROLES)", () => {
  function world(id: string, roleIds: string[]): WorldSummary {
    return {
      id,
      name: id,
      mode: { type: "simulation", time: { kind: "manual" } },
      defaultRoomId: `${id}-main`,
      roleIds,
    };
  }

  // The OLD populated world (the wrong fallback target) vs a freshly created 0-role
  // world. The bug snapped any unresolved id to worlds[0] = yunling and showed its
  // 3 roles for the empty new world.
  const yunling = world("yunling", ["guchenfeng", "leijun", "yunyao"]);
  const fresh = world("fresh", []);

  describe("resolveLoadedWorld — load-time resolution", () => {
    test("an authoritative just-created world wins and resolves to itself (0 roles)", () => {
      const roster = [yunling, fresh];
      const result = resolveLoadedWorld(roster, {
        preferredWorldId: "fresh",
        defaultWorldId: "yunling",
        authoritative: true,
      });
      expect(result.world?.id).toBe("fresh");
      expect(result.world?.roleIds).toEqual([]);
      expect(result.selectedWorldId).toBe("fresh");
      expect(result.requestedMissing).toBe(false);
    });

    test("an authoritative id absent from the roster is KEPT, never snapped to worlds[0]", () => {
      // The new world has not landed in this snapshot yet (race). The old fallback
      // would have returned yunling and persisted it — that is the exact bug.
      const result = resolveLoadedWorld([yunling], {
        preferredWorldId: "fresh",
        defaultWorldId: "yunling",
        authoritative: true,
      });
      expect(result.world).toBeUndefined();
      expect(result.selectedWorldId).toBe("fresh");
      expect(result.requestedMissing).toBe(true);
      // Not persistable: a not-yet-loaded selection must not write a ghost id.
      expect(persistableWorldId(result)).toBeUndefined();
    });

    test("a non-authoritative (boot/SSE) stale id self-heals to default → worlds[0]", () => {
      const result = resolveLoadedWorld([yunling, fresh], {
        preferredWorldId: "removed-world",
        defaultWorldId: "fresh",
        authoritative: false,
      });
      expect(result.world?.id).toBe("fresh");
      expect(result.selectedWorldId).toBe("fresh");
      expect(result.requestedMissing).toBe(true);
    });

    test("no preference resolves the project default, then worlds[0]", () => {
      expect(
        resolveLoadedWorld([yunling, fresh], {
          preferredWorldId: undefined,
          defaultWorldId: "fresh",
          authoritative: false,
        }).world?.id,
      ).toBe("fresh");
      expect(
        resolveLoadedWorld([yunling, fresh], {
          preferredWorldId: undefined,
          defaultWorldId: "missing-default",
          authoritative: false,
        }).world?.id,
      ).toBe("yunling");
    });

    test("only a really-resolved world id is persistable (real resolved one wins)", () => {
      const resolved = resolveLoadedWorld([yunling, fresh], {
        preferredWorldId: "fresh",
        defaultWorldId: "yunling",
        authoritative: true,
      });
      expect(persistableWorldId(resolved)).toBe("fresh");
    });
  });

  describe("resolveSelectedWorld — live selectedWorld getter", () => {
    test("a selected just-created world resolves to ITSELF with empty roleIds, not worlds[0]", () => {
      const selected = resolveSelectedWorld([yunling, fresh], "fresh");
      expect(selected?.id).toBe("fresh");
      // The bug surfaced yunling's 3 roles here; the empty world must read empty.
      expect(selected?.roleIds).toEqual([]);
    });

    test("a selected id absent from the roster returns undefined, NEVER snaps to worlds[0]", () => {
      // Mid-load, the new world id is selected but not yet in state.worlds. Returning
      // undefined keeps the UI honest ('no populated world') instead of impersonating
      // the old world's roster.
      expect(resolveSelectedWorld([yunling], "fresh")).toBeUndefined();
    });

    test("only an unset selection (boot before first load) falls back to the first world", () => {
      expect(resolveSelectedWorld([yunling, fresh], undefined)?.id).toBe("yunling");
      expect(resolveSelectedWorld([], undefined)).toBeUndefined();
    });
  });

  test("a stale background reload with the OLD id does not clobber the new selection", () => {
    // Simulates the SSE stale-closure path AFTER the fix: the reload reconciles the
    // CURRENT selection (fresh) read from the ref, so even resolving against a roster
    // that still contains the old world resolves to fresh — never reverting to it.
    const currentSelection = "fresh";
    const result = resolveLoadedWorld([yunling, fresh], {
      preferredWorldId: currentSelection,
      defaultWorldId: "yunling",
      authoritative: false,
    });
    expect(result.selectedWorldId).toBe("fresh");
    expect(result.world?.id).toBe("fresh");
    expect(persistableWorldId(result)).toBe("fresh");
  });
});

describe("resolveSelectedRole — run-turn subject scoped to the ACTIVE world", () => {
  function role(id: string): RoleSummary {
    return { id, displayName: id, model: "default", source: "config" };
  }
  function world(id: string, roleIds: string[]): WorldSummary {
    return {
      id,
      name: id,
      mode: { type: "simulation", time: { kind: "manual" } },
      defaultRoomId: `${id}-main`,
      roleIds,
    };
  }

  // The GLOBAL role pool: 顾辰风 is the project-wide first role (云岭's lead). The
  // active world 赛博修真世界 (cyber) contains ONLY 云遥, who is NOT the global first.
  const pool = [role("guchenfeng"), role("leijun"), role("yunyao")];
  const cyber = world("cyber", ["yunyao"]);

  test("falls back to the active world's first MEMBER, not the global first role", () => {
    // The bug: `pool[0]` returned 顾辰风 (a 云岭 role) for the cyber world. The fix
    // scopes the fallback to cyber's members → 云遥.
    const selected = resolveSelectedRole(pool, cyber, "");
    expect(selected?.id).toBe("yunyao");
  });

  test("resolves to undefined when the active world has zero members (run-turn gated)", () => {
    const empty = world("empty", []);
    // NOT the global first role — an empty world must disable run-turn, never bind
    // a foreign-world subject.
    expect(resolveSelectedRole(pool, empty, "")).toBeUndefined();
  });

  test("an explicit runRoleId match stays the primary path, unchanged", () => {
    // Even a different world member can be the explicit subject; the id match wins.
    expect(resolveSelectedRole(pool, cyber, "leijun")?.id).toBe("leijun");
  });

  test("preserves pool order among the active world's members for the fallback", () => {
    const multi = world("multi", ["leijun", "guchenfeng"]);
    // Member order follows the POOL order (guchenfeng before leijun), not roleIds order.
    expect(resolveSelectedRole(pool, multi, "")?.id).toBe("guchenfeng");
  });
});
