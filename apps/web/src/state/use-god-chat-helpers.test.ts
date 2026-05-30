import { describe, expect, test } from "bun:test";
import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import type { StagedConfig } from "@/state/god-chat-model.ts";
import {
  buildWorldSwitchCarryOver,
  composeStructureFollowUp,
  messageOf,
  resolveCreatedWorldName,
  shouldRestoreDraftOnProposalError,
  worldCreatedHandoffCard,
  worldScopedRoles,
  worldSwitchCard,
} from "@/state/use-god-chat-helpers.ts";

/**
 * Pure-helper contract for the God-chat brain. These functions carry the
 * load-bearing decisions (world-scoped roles, the world-switch confirmation card,
 * the draft-restore + structure-follow-up copy) and must stay deterministic. The
 * routing/answer model is covered in `use-god-chat.test.ts`.
 */

const POOL: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
  { displayName: "雷军", id: "leijun", model: "default", source: "config" },
];

function world(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    defaultRoomId: "main",
    id: "cultivation",
    mode: { time: { kind: "manual" }, type: "simulation" },
    name: "云岭修仙界",
    roleIds: ["guchenfeng", "yunyao"],
    ...overrides,
  };
}

describe("worldSwitchCard — lightweight inline confirmation (NO-NL-WORLD-SWITCH)", () => {
  test("is a settled result card that names the switched-into world", () => {
    const card = worldSwitchCard("云岭修仙界");
    expect(card.variant).toBe("result");
    if (card.variant !== "result") {
      throw new Error("expected result card");
    }
    expect(card.title).toBe("切换世界");
    expect(card.detail).toContain("云岭修仙界");
    // It is feedback, not a preview/confirm gate.
    expect(card.kind).not.toBe("trust");
  });
});

describe("buildWorldSwitchCarryOver — carries the LIVE typed text across the scope swap (F2)", () => {
  function idMaker(): () => string {
    let n = 0;
    return () => {
      n += 1;
      return `carry-${n}`;
    };
  }

  test("the operator bubble reads the verbatim typed text, never a previous switch label", () => {
    // The bug: after switching, the operator bubble showed the destination world's
    // OLD switch turn ("切换到云岭修仙界"). The carry-over must reflect what was just
    // typed ("切换到赛博修真世界").
    const carry = buildWorldSwitchCarryOver(
      { liveText: "切换到赛博修真世界", worldName: "赛博修真世界" },
      idMaker(),
    );
    const operator = carry.find((entry) => entry.role === "operator");
    expect(operator?.text).toBe("切换到赛博修真世界");
    expect(operator?.text).not.toContain("云岭");
  });

  test("it appends the switch RESULT card after the operator bubble, naming the destination", () => {
    const carry = buildWorldSwitchCarryOver(
      { liveText: "切换到赛博修真世界", worldName: "赛博修真世界" },
      idMaker(),
    );
    expect(carry).toHaveLength(2);
    expect(carry[0]?.role).toBe("operator");
    const result = carry[1];
    expect(result?.role).toBe("system");
    if (result?.card?.variant !== "result") {
      throw new Error("expected a result card");
    }
    expect(result.card.title).toBe("切换世界");
    expect(result.card.detail).toContain("赛博修真世界");
  });

  test("ids come from the injected minter (the hook stays the sole id authority)", () => {
    const carry = buildWorldSwitchCarryOver(
      { liveText: "切换到赛博修真世界", worldName: "赛博修真世界" },
      idMaker(),
    );
    expect(carry.map((entry) => entry.id)).toEqual(["carry-1", "carry-2"]);
  });
});

describe("worldScopedRoles — chat roster mirrors the active world's members", () => {
  test("a selected world filters the pool down to its member roles", () => {
    const scoped = worldScopedRoles(POOL, world(), "cultivation");
    expect(scoped.map((role) => role.id)).toEqual(["guchenfeng", "yunyao"]);
  });

  test("an empty world reads as empty, not silently populated with pool roles", () => {
    expect(worldScopedRoles(POOL, world({ roleIds: [] }), "cultivation")).toEqual([]);
  });

  test("no world selected at all (no id) → the full pool (manager-level view)", () => {
    expect(worldScopedRoles(POOL, undefined, undefined)).toEqual(POOL);
  });

  test("selected-but-unresolved (id set, summary not yet loaded) → empty, NOT the pool", () => {
    // The ghost-roster bug: a just-created/mid-reload world has a selected id but no
    // resolved WorldSummary. It must read empty (loading), never leak the prior
    // world's cast beside the empty 世界状态 角色 panel.
    expect(worldScopedRoles(POOL, undefined, "world-x")).toEqual([]);
  });

  test("a resolved selected world still scopes to ONLY its members, ignoring the id arg", () => {
    // The id is a presence flag; membership keys off the resolved world.roleIds.
    const scoped = worldScopedRoles(POOL, world({ roleIds: ["leijun"] }), "cultivation");
    expect(scoped.map((role) => role.id)).toEqual(["leijun"]);
  });

  test("a world switch repopulates the roster from the NEW world's members", () => {
    // Proves the rail repopulates on switch: same pool, different active world →
    // different scoped roster.
    const yunling = worldScopedRoles(POOL, world({ roleIds: ["guchenfeng"] }), "cultivation");
    const cyber = worldScopedRoles(POOL, world({ id: "cyber", roleIds: ["leijun"] }), "cyber");
    expect(yunling.map((r) => r.id)).toEqual(["guchenfeng"]);
    expect(cyber.map((r) => r.id)).toEqual(["leijun"]);
  });

  test("switching from a populated world to an empty just-created world never ghosts the prior roster", () => {
    // 1) Populated world 云岭修仙界 resolved → its members.
    const populated = worldScopedRoles(
      POOL,
      world({ roleIds: ["guchenfeng", "yunyao"] }),
      "cultivation",
    );
    expect(populated.map((r) => r.id)).toEqual(["guchenfeng", "yunyao"]);
    // 2) Switch to a fresh world whose summary has NOT yet resolved (id set, world
    //    undefined): empty, NOT the 3-member ghost roster from step 1.
    const switching = worldScopedRoles(POOL, undefined, "cyber");
    expect(switching).toEqual([]);
    // 3) Summary lands as a genuinely empty world: still empty (its membership).
    const resolvedEmpty = worldScopedRoles(POOL, world({ id: "cyber", roleIds: [] }), "cyber");
    expect(resolvedEmpty).toEqual([]);
  });
});

describe("worldCreatedHandoffCard — continuity bubble after create-and-auto-switch", () => {
  test("is a settled result card distinct from the manual-switch card", () => {
    const card = worldCreatedHandoffCard("赛博修真世界");
    expect(card.variant).toBe("result");
    if (card.variant !== "result") {
      throw new Error("expected result card");
    }
    // Semantics: 新建后切入, NOT 手动切换 — the copy must say "新创建" so the operator
    // understands the create-bubble they typed lives in the OLD world's history.
    expect(card.detail).toContain("新创建");
    expect(card.detail).toContain("赛博修真世界");
    // The worldSwitchCard's manual-switch phrasing must NOT be reused here.
    const manual = worldSwitchCard("赛博修真世界");
    if (manual.variant !== "result") {
      throw new Error("expected result card");
    }
    expect(card.detail).not.toBe(manual.detail);
    expect(card.title).not.toBe(manual.title);
    // Settled feedback, never a confirm/trust gate.
    expect(card.kind).not.toBe("trust");
  });
});

describe("resolveCreatedWorldName — names the world the rail just switched into", () => {
  function stagedConfig(worldId: string, goal: string): StagedConfig {
    return {
      goal,
      kind: "config",
      proposal: {
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "patch-1",
        operations: [
          {
            action: "create",
            nextContent: "name: x",
            nextHash: "h",
            path: `.agents/worlds/${worldId}/world.yaml`,
            previousHash: null,
          },
        ],
        requiredCapabilities: [],
        riskLevel: "low",
        riskReasons: [],
        summary: "create world",
        title: "Create world",
        typedConfirmation: null,
      },
    };
  }

  test("prefers the freshly-loaded roster's persisted name for the created world", () => {
    const proposal = stagedConfig("cyber-cultivation", "创建一个赛博修真世界");
    const roster = [world({ id: "cyber-cultivation", name: "服务端命名世界", roleIds: [] })];
    expect(resolveCreatedWorldName(proposal, roster)).toBe("服务端命名世界");
  });

  test("falls back to the deterministic planner name when the roster has not landed yet", () => {
    // The selectWorld reload is async; app.state may be a render behind, so the
    // created world is not yet in the roster. The planner name matches the patch.
    const proposal = stagedConfig("cyber-cultivation", "创建一个赛博修真世界");
    expect(resolveCreatedWorldName(proposal, [])).toBe("赛博修真世界");
  });

  test("returns undefined when the config created no world (caller skips the card)", () => {
    const ruleEdit: StagedConfig = {
      goal: "把胜负规则改成三局两胜",
      kind: "config",
      proposal: {
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "patch-2",
        operations: [
          {
            action: "update",
            nextContent: "rule",
            nextHash: "h",
            path: ".agents/worlds/cultivation/rules.yaml",
            previousHash: "g",
          },
        ],
        requiredCapabilities: [],
        riskLevel: "low",
        riskReasons: [],
        summary: "edit rule",
        title: "Edit rule",
        typedConfirmation: null,
      },
    };
    expect(resolveCreatedWorldName(ruleEdit, [])).toBeUndefined();
  });
});

describe("composeStructureFollowUp — honest about what an empty world omits", () => {
  test("a goal naming inhabitants offers to build them out", () => {
    const followUp = composeStructureFollowUp("创建一个有宗门、对手和师父的修真世界");
    expect(followUp).toBeDefined();
    expect(followUp).toContain("凭空生成");
  });

  test("a goal naming no structure returns nothing to offer", () => {
    expect(composeStructureFollowUp("创建一个空白世界")).toBeUndefined();
  });
});

describe("shouldRestoreDraftOnProposalError + messageOf", () => {
  test("a trust-gate denial does NOT restore the draft (one-tap recovery)", () => {
    expect(shouldRestoreDraftOnProposalError(true)).toBe(false);
  });

  test("an unrecoverable failure restores the draft as a retry buffer", () => {
    expect(shouldRestoreDraftOnProposalError(false)).toBe(true);
  });

  test("messageOf normalizes Error and non-Error throwns", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf("plain")).toBe("plain");
  });
});
