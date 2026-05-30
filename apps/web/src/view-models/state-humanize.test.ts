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

  /**
   * Residual from the boardroom-saga real-model run: boardroom groups people under a
   * TOP-LEVEL `roles` container, so the inspect card summary (`记录了 N 类状态：…`) and
   * the `【…】` section heading run that key through `stateKeyLabel`. Before the fix
   * `roles` lived only in `STATE_FIELD_LABELS`, so the container path leaked the bare
   * English token `roles`. `roles` is now an explicit `STATE_CONTAINER_LABELS` entry,
   * so the heading reads 角色. cultivation-sim has no top-level `roles`, which is why
   * the gap only surfaced on a SECOND world; this locks it against the same leak.
   */
  test("a top-level `roles` container localizes in the container path (角色)", () => {
    // boardroom-saga's top-level `roles` container — no longer raw English.
    expect(stateKeyLabel("roles")).toBe("角色");
    // Engine containers still localize as before.
    expect(stateKeyLabel("metaState")).toBe("运行元数据");
    // A field that is NOT also a registered top-level container is still passed
    // through verbatim by the container path — `qi` is cultivation-sim's own
    // top-level field and must read verbatim here (灵气 is its field-leaf reading,
    // not the container heading), so we deliberately do NOT alias every field label
    // into the container lookup.
    expect(stateKeyLabel("qi")).toBe("qi");
    expect(stateKeyLabel("financials")).toBe("financials");
    expect(stateKeyLabel("synergyScore")).toBe("synergyScore");
  });

  test("a role-id key resolves to the author display name", () => {
    expect(fieldKeyLabel("guchenfeng", true, ROLE_NAMES)).toBe("顾辰风");
    // An unknown role id falls back to the id itself (never throws).
    expect(fieldKeyLabel("ghost", true, ROLE_NAMES)).toBe("ghost");
  });

  /**
   * Runtime-produced metaState keys (NOT seed-yaml fields) were missing from the
   * label map and leaked raw English in the inspect tail. The set-rule flow appends
   * `/metaState/rules` and the run-loop writes `/metaState/simulation/{paused,reason}`;
   * each must now read as a zh-CN label, and `rules` must match the rail's 「规则」
   * so both surfaces agree. Author-custom keys still pass through verbatim.
   */
  test("runtime metaState keys (rules/simulation/paused/reason) localize to zh-CN", () => {
    expect(fieldKeyLabel("rules", false, ROLE_NAMES)).toBe("规则");
    expect(fieldKeyLabel("simulation", false, ROLE_NAMES)).toBe("推演调度");
    expect(fieldKeyLabel("paused", false, ROLE_NAMES)).toBe("已暂停");
    expect(fieldKeyLabel("reason", false, ROLE_NAMES)).toBe("原因");
    // An author-custom key adjacent to these still passes through verbatim — we
    // never invent a translation for a world's own field.
    expect(fieldKeyLabel("housekeeping", false, ROLE_NAMES)).toBe("housekeeping");
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

/**
 * boardroom-saga (the SECOND example world) leaks a large set of finance / equity /
 * governance keys raw English when only cultivation-sim keys are labeled — exactly
 * the "换世界露 façade" risk the NL-first vision warns about. These lock each known
 * boardroom field to its business-semantic zh-CN label, while proving cultivation
 * keys do NOT regress and a custom (unknown) key still passes through verbatim.
 */
describe("boardroom-saga field labels", () => {
  // Every newly-added boardroom key → its expected business-semantic zh-CN label.
  const BOARDROOM_LABELS: Record<string, string> = {
    arr: "年度经常性收入",
    burnRate: "季度消耗",
    capTable: "股权结构",
    cashOnHand: "现金储备",
    company: "公司概况",
    controlRisk: "控制权风险",
    dueDiligenceDirt: "尽调隐患",
    employeePool: "员工期权池",
    financials: "财务状况",
    fiscalQuarter: "财季",
    keyAccounts: "核心客户",
    ledgerNotes: "账目备注",
    leverageNotes: "筹码备注",
    nextShock: "下一场冲击",
    others: "其他股东",
    revenue: "营收",
    revenueGrowth: "营收增速",
    runwayQuarters: "现金跑道(季)",
    sentiment: "情绪面",
    stage: "阶段",
    standing: "处境",
    title: "职务",
  };

  test("every boardroom key renders its business-semantic zh-CN label", () => {
    for (const [key, label] of Object.entries(BOARDROOM_LABELS)) {
      expect(fieldKeyLabel(key, false, ROLE_NAMES)).toBe(label);
    }
  });

  test("cultivation-sim keys do NOT regress", () => {
    expect(fieldKeyLabel("season", false, ROLE_NAMES)).toBe("季节");
    expect(fieldKeyLabel("realm", false, ROLE_NAMES)).toBe("境界");
    expect(fieldKeyLabel("spiritStones", false, ROLE_NAMES)).toBe("灵石");
    expect(fieldKeyLabel("threats", false, ROLE_NAMES)).toBe("威胁");
  });

  test("a custom (unknown) boardroom-adjacent key still passes through verbatim", () => {
    expect(fieldKeyLabel("synergyScore", false, ROLE_NAMES)).toBe("synergyScore");
  });

  test("a full boardroom snapshot humanizes with no raw English key leaking", () => {
    const rows = humanizeFlatRows(
      {
        publicState: {
          company: { fiscalQuarter: "2026Q1", stage: "IPO 前冲刺", sentiment: "谨慎乐观" },
          financials: { revenue: "4.2亿", runwayQuarters: 3, burnRate: "每季 6000万" },
          capTable: { employeePool: "12%", others: "35%" },
        },
        derivedState: { controlRisk: "高" },
        hiddenState: { fate: { nextShock: "审计风暴" } },
      },
      ROLE_NAMES,
    );
    const leakySegments = [
      "company",
      "financials",
      "capTable",
      "fiscalQuarter",
      "runwayQuarters",
      "burnRate",
      "employeePool",
      "controlRisk",
      "nextShock",
    ];
    for (const seg of leakySegments) {
      expect(rows.every((row) => !row.key.includes(seg))).toBe(true);
    }
    // And the humanized labels ARE present in the breadcrumb paths.
    expect(rows.some((row) => row.key.includes("现金跑道(季)"))).toBe(true);
    expect(rows.some((row) => row.key.includes("控制权风险"))).toBe(true);
  });
});
