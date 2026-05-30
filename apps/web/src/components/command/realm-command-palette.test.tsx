import { describe, expect, test } from "bun:test";
import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import type { RealmAppController } from "@/app/types.ts";
import { resolvePaletteRoleEntries } from "./realm-command-palette.tsx";

/**
 * F1/F2 — the palette's 角色 + 发送身份 groups must reflect the ACTIVE-world scope, not
 * the raw project pool. These tests pin two regressions:
 *   F1 cross-world leak — standing in 赛博 must not list 顾辰风/雷军 from 云岭.
 *   F2 same-name ambiguity — workspace scope collapses the two 云遥 to the one that
 *     belongs to the active world; manager view keeps both but disambiguates by
 *     owning-world subtitle.
 *
 * `renderToStaticMarkup` skips effects, so `useProjectTrust` resolves to its
 * non-read-only default — irrelevant to the role-list scoping under test.
 */

const noop = () => undefined;

/** A 云岭 (cultivation) world with 顾辰风, 雷军, and a 云遥 unique to this world. */
const yunlingRoles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "雷军", id: "leijun", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao-yunling", model: "default", source: "config" },
];

/** A 赛博 (cyber) world whose only member is a DIFFERENT 云遥 (same display name). */
const cyberRoles: RoleSummary[] = [
  { displayName: "云遥", id: "yunyao-cyber", model: "default", source: "config" },
];

const yunlingWorld: WorldSummary = {
  defaultRoomId: "yunling-main",
  id: "yunling",
  mode: { time: { kind: "tick" }, type: "simulation" },
  name: "云岭修仙界",
  roleIds: ["guchenfeng", "leijun", "yunyao-yunling"],
};

const cyberWorld: WorldSummary = {
  defaultRoomId: "cyber-main",
  id: "cyber",
  mode: { time: { kind: "tick" }, type: "simulation" },
  name: "赛博修真世界",
  roleIds: ["yunyao-cyber"],
};

const ALL_ROLES = [...yunlingRoles, ...cyberRoles];
const ALL_WORLDS = [yunlingWorld, cyberWorld];

function mockApp(selectedWorld: WorldSummary | undefined): RealmAppController {
  return {
    cancelActiveTurn: async () => undefined,
    clearTurnError: () => undefined,
    client: {
      getEffectivePolicy: async () => ({ trustTier: "run-roles" }),
      setTrust: async () => ({ trustTier: "run-roles" }),
    },
    draft: "",
    runRoleId: undefined,
    runSelectedRoleTurn: async () => undefined,
    selectWorld: async () => undefined,
    selectedRole: undefined,
    selectedRoom: undefined,
    selectedWorld,
    sendMessage: async () => undefined,
    setActiveSection: noop,
    setDraft: noop,
    setRunRoleId: noop,
    setViewerIdentity: noop,
    state: {
      events: [],
      messages: [],
      projectName: "Realm",
      roles: ALL_ROLES,
      rooms: [],
      status: "ready",
      worlds: ALL_WORLDS,
    },
    turnRun: { status: "idle" },
    viewerIdentity: "owner",
  } as unknown as RealmAppController;
}

describe("resolvePaletteRoleEntries — world-scoped role resolution (F1/F2)", () => {
  test("workspace mode lists ONLY the active world's members (no cross-world leak)", () => {
    const entries = resolvePaletteRoleEntries(mockApp(cyberWorld), "workspace");
    expect(entries.map((e) => e.role.id)).toEqual(["yunyao-cyber"]);
    // 顾辰风/雷军/the 云岭 云遥 must not leak in while standing in 赛博.
    expect(entries.some((e) => e.role.id === "guchenfeng")).toBe(false);
    expect(entries.some((e) => e.role.id === "leijun")).toBe(false);
    expect(entries.some((e) => e.role.id === "yunyao-yunling")).toBe(false);
  });

  test("workspace mode collapses the same-name 云遥 ambiguity to the active-world member", () => {
    const entries = resolvePaletteRoleEntries(mockApp(yunlingWorld), "workspace");
    const yunyao = entries.filter((e) => e.role.displayName === "云遥");
    // Exactly one 云遥 — the 云岭 one — and no world subtitle is needed in scope.
    expect(yunyao).toHaveLength(1);
    expect(yunyao[0]?.role.id).toBe("yunyao-yunling");
    expect(yunyao[0]?.worldName).toBeUndefined();
  });

  test("manager mode keeps the full roster but disambiguates same-name roles by world", () => {
    const entries = resolvePaletteRoleEntries(mockApp(undefined), "manager");
    expect(entries).toHaveLength(ALL_ROLES.length);
    const yunyao = entries.filter((e) => e.role.displayName === "云遥");
    expect(yunyao).toHaveLength(2);
    const worldNames = yunyao.map((e) => e.worldName).sort();
    expect(worldNames).toEqual(["云岭修仙界", "赛博修真世界"]);
    // Uniquely-named roles get no noise subtitle.
    const leijun = entries.find((e) => e.role.id === "leijun");
    expect(leijun?.worldName).toBeUndefined();
  });
});

/**
 * The palette keys both groups' `data-testid` AND `value` search string on
 * `role.id` (so existing target queries/tests still resolve), and appends the
 * disambiguation `worldName` into the `value` so manager-mode search can find a
 * 云遥 by its world. The `CommandDialog` renders into a Radix portal that
 * `renderToStaticMarkup` does not capture, so we assert the SAME entry shape the
 * JSX maps over rather than scraping unrendered portal DOM.
 */
describe("palette role rows are keyed + searchable by id and world", () => {
  test("workspace scope yields exactly the active-world member ids (drives both groups' testids)", () => {
    const ids = resolvePaletteRoleEntries(mockApp(cyberWorld), "workspace").map((e) => e.role.id);
    // These ids back `command-inspect-role-<id>` AND `command-send-as-<id>` —
    // the only rows either group can render in 赛博.
    expect(ids).toEqual(["yunyao-cyber"]);
    // No 云岭 member id can produce a leaked testid in either group.
    for (const leaked of ["guchenfeng", "leijun", "yunyao-yunling"]) {
      expect(ids).not.toContain(leaked);
    }
  });

  test("manager same-name rows expose worldName for the searchable `· 世界名` subtitle", () => {
    const entries = resolvePaletteRoleEntries(mockApp(undefined), "manager");
    const yunyao = entries.filter((e) => e.role.displayName === "云遥");
    // Both rows survive (full roster) and each carries a distinct owning-world
    // name — appended into the row's `value` so search can split the two 云遥.
    expect(yunyao.map((e) => e.worldName).sort()).toEqual(["云岭修仙界", "赛博修真世界"]);
    expect(yunyao.every((e) => Boolean(e.worldName))).toBe(true);
    // A uniquely-named role carries no world subtitle → no search/visual noise.
    expect(entries.find((e) => e.role.id === "leijun")?.worldName).toBeUndefined();
  });
});
