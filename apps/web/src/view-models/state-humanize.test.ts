import { describe, expect, test } from "bun:test";
import {
  fieldKeyLabel,
  humanizeFlatRows,
  humanizeScalar,
  stateKeyLabel,
} from "@/view-models/state-humanize.ts";

/**
 * Co-located contract for the shared world-state HUMANIZATION primitives. These
 * back BOTH the desktop inspect chat card (`god-chat-inspect.ts`) and the mobile
 * 高级 inspector table (`world-inspector-sheet.tsx`), so the two surfaces render an
 * identical human reading from the same snapshot. The regression these guard: a
 * role id leaking raw (guchenfeng instead of 顾辰风), a boolean leaking as `true`,
 * and an empty object leaking as `[object Object]`.
 */

const ROLE_NAMES = new Map([
  ["guchenfeng", "顾辰风"],
  ["leijun", "雷军"],
]);

describe("stateKeyLabel / fieldKeyLabel", () => {
  test("maps well-known containers + fields to zh-CN, passes the rest verbatim", () => {
    expect(stateKeyLabel("privateState")).toBe("角色私密");
    expect(stateKeyLabel("qi")).toBe("qi");
    expect(fieldKeyLabel("season", false, ROLE_NAMES)).toBe("季节");
    expect(fieldKeyLabel("moon-grass", false, ROLE_NAMES)).toBe("moon-grass");
  });

  test("a role-id key resolves to the author display name", () => {
    expect(fieldKeyLabel("guchenfeng", true, ROLE_NAMES)).toBe("顾辰风");
    // An unknown role id falls back to the id itself (never throws).
    expect(fieldKeyLabel("ghost", true, ROLE_NAMES)).toBe("ghost");
  });
});

describe("humanizeScalar", () => {
  test("booleans read 是/否, never bare true/false", () => {
    expect(humanizeScalar(true)).toBe("是");
    expect(humanizeScalar(false)).toBe("否");
  });

  test("known enum strings localize; author strings stay verbatim", () => {
    expect(humanizeScalar("medium")).toBe("中");
    expect(humanizeScalar("潜伏于边境农庄")).toBe("潜伏于边境农庄");
  });

  test("a role-id VALUE resolves to the display name when roleNames is supplied", () => {
    expect(humanizeScalar("guchenfeng", ROLE_NAMES)).toBe("顾辰风");
    // Without the map, the id stays verbatim (the inspect-tree caller's behavior).
    expect(humanizeScalar("guchenfeng")).toBe("guchenfeng");
  });

  test("null / array degrade to honest placeholders, never [object Object]", () => {
    expect(humanizeScalar(null)).toBe("（空）");
    expect(humanizeScalar([1, 2, 3])).toBe("3 项");
  });
});

describe("humanizeFlatRows", () => {
  test("returns [] for an undefined snapshot", () => {
    expect(humanizeFlatRows(undefined, ROLE_NAMES)).toEqual([]);
  });

  test("resolves role-id key segments to display names and humanizes booleans", () => {
    const rows = humanizeFlatRows(
      { privateState: { roles: { guchenfeng: { alive: true, muted: false } } } },
      ROLE_NAMES,
    );
    const muted = rows.find((row) => row.key.endsWith("禁言"));
    const alive = rows.find((row) => row.key.endsWith("存活"));
    expect(muted?.value).toBe("否");
    expect(alive?.value).toBe("是");
    // Role id never leaks as a key segment.
    expect(rows.every((row) => !row.key.includes("guchenfeng"))).toBe(true);
    // The display name IS present in the breadcrumb path.
    expect(rows.some((row) => row.key.includes("顾辰风"))).toBe(true);
    // No raw boolean token leaked into any value cell.
    expect(rows.every((row) => row.value !== "true" && row.value !== "false")).toBe(true);
  });

  test("a muted role reads 禁言：是 (顾辰风 muted regression)", () => {
    const rows = humanizeFlatRows(
      { privateState: { roles: { guchenfeng: { muted: true } } } },
      ROLE_NAMES,
    );
    const row = rows.find((r) => r.key.endsWith("禁言"));
    expect(row?.key).toContain("顾辰风");
    expect(row?.value).toBe("是");
    // The top-level container segment reads as its zh-CN label (角色私密), matching
    // the desktop inspect card's section heading — so both surfaces read identically.
    expect(row?.key.startsWith("角色私密")).toBe(true);
    expect(row?.key).not.toContain("privateState");
  });

  test("an unknown key segment stays verbatim", () => {
    const rows = humanizeFlatRows(
      { publicState: { sect: { herbs: { "moon-grass": 8 } } } },
      ROLE_NAMES,
    );
    const row = rows.find((r) => r.value === "8");
    expect(row?.key).toContain("moon-grass");
    expect(row?.key).toContain("草药");
  });

  test("an empty nested object renders a placeholder row, never [object Object]", () => {
    const rows = humanizeFlatRows({ publicState: { roles: {} } }, ROLE_NAMES);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("（暂无字段）");
    expect(rows.every((row) => !row.value.includes("object Object"))).toBe(true);
  });

  test("a role-id VALUE (e.g. an owner ref) resolves to the display name", () => {
    const rows = humanizeFlatRows({ publicState: { owner: "leijun" } }, ROLE_NAMES);
    const row = rows.find((r) => r.key.endsWith("owner"));
    expect(row?.value).toBe("雷军");
  });
});
