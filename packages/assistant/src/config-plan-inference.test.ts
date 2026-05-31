import { describe, expect, test } from "bun:test";

import {
  deriveStableRoleId,
  inferRoleFromGoal,
  inferWorldFromGoal,
} from "./config-plan-inference.ts";

/**
 * Role-id derivation contract (F2). The CJK cases drive `deriveStableRoleId`
 * through the public `inferRoleFromGoal` surface (exactly how the runtime mints
 * ids from a NL goal); the ASCII-slug cases call `deriveStableRoleId` directly
 * because the zh-only name extractor never lifts an English name out of a goal.
 * The id MUST be deterministic (no process counter, no module-level mutable
 * state): same name -> same id across calls, reloads, and processes; distinct
 * names -> distinct ids. ASCII names keep a readable kebab slug; non-ASCII (CJK)
 * names fall back to a stable `role-<hash>` token that always satisfies idSchema
 * (`^[a-zA-Z0-9][a-zA-Z0-9._:-]*$`).
 */
const ID_SCHEMA = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

describe("deriveStableRoleId (via inferRoleFromGoal)", () => {
  test("CJK name yields a deterministic role-<hash> token (no role-<n> counter)", () => {
    const first = inferRoleFromGoal("加一个叫云遥的角色");
    expect(first.displayName).toBe("云遥");
    // CJK names have no safe kebab slug, so they fall to a hash token, never a
    // generic catalog name (roles/role-1) or a process-counter token.
    expect(first.id).toMatch(/^role-[0-9a-f]{8}$/);
    expect(first.id).toMatch(ID_SCHEMA);
  });

  test("same CJK name is stable across calls (deterministic, not counter-based)", () => {
    // A second, independent call (simulating a reload / second process) must
    // re-mint the SAME id — the bug being fixed was a monotonic roleIdCounter
    // that produced role-1, role-2, … on repeat.
    const a = inferRoleFromGoal("加一个叫云遥的角色");
    const b = inferRoleFromGoal("加一个叫云遥的角色");
    expect(a.id).toBe(b.id);
  });

  test("distinct CJK names do not collide", () => {
    const yunyao = inferRoleFromGoal("加一个叫云遥的角色");
    const guchenfeng = inferRoleFromGoal("加一个叫顾辰风的角色");
    const leijun = inferRoleFromGoal("加一个叫雷峻的角色");
    const ids = [yunyao.id, guchenfeng.id, leijun.id];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(ID_SCHEMA);
    }
  });

  test("pure-English name keeps a readable kebab slug, not a hash token", () => {
    const id = deriveStableRoleId("Stock Analyst");
    expect(id).toBe("stock-analyst");
    expect(id).not.toMatch(/^role-/);
    expect(id).toMatch(ID_SCHEMA);
  });

  test("English kebab slug is deterministic across calls", () => {
    expect(deriveStableRoleId("Risk Reviewer")).toBe("risk-reviewer");
    expect(deriveStableRoleId("Risk Reviewer")).toBe(deriveStableRoleId("Risk Reviewer"));
  });

  test("no module-level mutable state: re-deriving the same name never drifts", () => {
    // Interleave distinct names between repeats of the same name to prove a
    // shared counter isn't advancing the id under the hood (the old roleIdCounter
    // bug). A CJK name and an unsluggable name both re-derive identically.
    const baselineCjk = deriveStableRoleId("云遥");
    const baselineEmpty = deriveStableRoleId("新角色");
    deriveStableRoleId("顾辰风");
    deriveStableRoleId("雷峻");
    expect(deriveStableRoleId("云遥")).toBe(baselineCjk);
    expect(deriveStableRoleId("新角色")).toBe(baselineEmpty);
  });
});

/**
 * "叫X的Y" name/profession split. The displayName must stay the bare name (X)
 * while a recognized profession noun (Y) is peeled into the summary — never
 * absorbed into the displayName. Covers modern profession nouns AND names that
 * carry digits/letters (零号 / K先生 / 007), while keeping the legacy 修真/武侠
 * archetypes (叫沈墨的剑修) from regressing.
 */
describe("inferRoleFromGoal name/profession split", () => {
  test("叫零号的黑客 -> name=零号, profession in summary (regression target)", () => {
    const role = inferRoleFromGoal("加一个叫零号的黑客，谨慎、爱钱");
    expect(role.displayName).toBe("零号");
    expect(role.displayName).not.toContain("黑客");
    // Profession seeds the summary; traits still survive.
    expect(role.summary).toContain("黑客");
    expect(role.summary).toContain("谨慎");
    expect(role.summary).toContain("爱钱");
  });

  test("modern profession nouns are peeled off the displayName", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["加一个叫阿强的程序员", "阿强", "程序员"],
      ["加一个叫林夏的侦探", "林夏", "侦探"],
      ["加一个叫陈默的律师", "陈默", "律师"],
      ["加一个叫苏婉的医生", "苏婉", "医生"],
      ["加一个叫江临的记者", "江临", "记者"],
      ["加一个叫影的特工", "影", "特工"],
      ["加一个叫老猫的雇佣兵", "老猫", "雇佣兵"],
      ["加一个叫赤瞳的赏金猎人", "赤瞳", "赏金猎人"],
    ];
    for (const [goal, name, profession] of cases) {
      const role = inferRoleFromGoal(goal);
      expect(role.displayName).toBe(name);
      expect(role.displayName).not.toContain(profession);
      expect(role.summary).toContain(profession);
    }
  });

  test("names with digits/letters keep the profession split (零号 / K先生 / 007)", () => {
    expect(inferRoleFromGoal("加一个叫007的特工").displayName).toBe("007");
    expect(inferRoleFromGoal("加一个叫K先生的杀手").displayName).toBe("K先生");
    const x9 = inferRoleFromGoal("加一个叫X9的黑客");
    expect(x9.displayName).toBe("X9");
    expect(x9.summary).toContain("黑客");
  });

  test("legacy 修真/武侠 archetypes do not regress", () => {
    const jianxiu = inferRoleFromGoal("加一个叫沈墨的剑修，孤傲、护短");
    expect(jianxiu.displayName).toBe("沈墨");
    expect(jianxiu.summary).toContain("剑修");
    expect(jianxiu.summary).toContain("孤傲");
    expect(jianxiu.summary).toContain("护短");

    const baiyi = inferRoleFromGoal("加一个叫白衣的剑客");
    expect(baiyi.displayName).toBe("白衣");
    expect(baiyi.summary).toContain("剑客");
  });

  test("叫周明的独立董事 -> name=周明, compound title in summary (F2 fix)", () => {
    // Root cause was a dictionary gate: 独立董事 is not in PROFESSION_NOUNS, so
    // the whole "周明的独立董事" was swallowed into the displayName. With the
    // 的-delimited path treating the tail as grammar (not a lookup), the title
    // splits cleanly and the displayName never contains the job title.
    const role = inferRoleFromGoal("加一个叫周明的独立董事，谨慎");
    expect(role.displayName).toBe("周明");
    expect(role.displayName).not.toContain("独立董事");
    expect(role.summary).toContain("独立董事");
    expect(role.summary).toContain("谨慎");
  });

  test("compound/novel modern titles split via the 的 delimiter (no dictionary)", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["加一个叫陈睿的首席执行官", "陈睿", "首席执行官"],
      ["加一个叫赵柯的风险投资人", "赵柯", "风险投资人"],
      ["加一个叫许岚的人力资源总监", "许岚", "人力资源总监"],
      ["加一个叫沈青的首席财务官", "沈青", "首席财务官"],
    ];
    for (const [goal, name, profession] of cases) {
      const role = inferRoleFromGoal(goal);
      expect(role.displayName).toBe(name);
      expect(role.displayName).not.toContain(profession);
      expect(role.summary).toContain(profession);
    }
  });

  test("一名{多字职衔}叫X captures the compound title before the name", () => {
    const dongshi = inferRoleFromGoal("一名独立董事叫周明");
    expect(dongshi.displayName).toBe("周明");
    expect(dongshi.summary).toContain("独立董事");

    const cfo = inferRoleFromGoal("一个首席财务官叫沈青");
    expect(cfo.displayName).toBe("沈青");
    expect(cfo.summary).toContain("首席财务官");
  });

  test("structural common nouns are still dropped, not recorded as a title", () => {
    // 角色/世界/门派 are scaffolding even after the 的-path stopped requiring a
    // whitelist hit — they must not leak into the displayName or the summary.
    const role = inferRoleFromGoal("加一个叫云遥的角色");
    expect(role.displayName).toBe("云遥");
    // 角色 not recorded as a job title; the generic fallback sentence is fine.
    expect(role.summary).not.toContain("，角色");

    const onebefore = inferRoleFromGoal("加一个角色叫顾辰风");
    expect(onebefore.displayName).toBe("顾辰风");
    // 角色 must not be recorded as a job title ("顾辰风，角色。"); the generic
    // fallback sentence ("…自定义角色。") is fine and expected here.
    expect(onebefore.summary).not.toContain("，角色");
  });

  test("bare suffixes (no 的) stay dictionary-gated — plain names not mis-cut", () => {
    // Without an explicit 的 boundary, "叫X" is ambiguous, so we must NOT split a
    // bare three-char name like 沈墨然 (only a dictionary profession suffix peels).
    expect(inferRoleFromGoal("加一个叫沈墨然的角色").displayName).toBe("沈墨然");
    expect(inferRoleFromGoal("加一个叫沈墨然").displayName).toBe("沈墨然");
    // A bare dictionary suffix still peels: 沈墨剑修 -> 沈墨 + 剑修.
    const jianxiu = inferRoleFromGoal("加一个叫沈墨剑修");
    expect(jianxiu.displayName).toBe("沈墨");
    expect(jianxiu.summary).toContain("剑修");
  });
});

/**
 * Default world-main room display NAME. patch-store hardcodes the room *id* to
 * "main" and persists the NAME (= roomName) verbatim into world.yaml with no
 * write-time localization, so roomName must already be the zh-CN label — never
 * the raw English stable id "main" leaking into the human-facing display name.
 */
describe("inferWorldFromGoal default roomName", () => {
  test("roomName is the seeded zh-CN world-main label, not the raw id 'main'", () => {
    const world = inferWorldFromGoal("帮我创建一个修真世界");
    expect(world.roomName).toBe("全员议事");
    expect(world.roomName).not.toBe("main");
  });

  test("roomName stays the zh label regardless of the goal's theme/name", () => {
    for (const goal of ["创建一个赛博朋克世界", "做个叫云岭的世界", "新建一个世界"]) {
      expect(inferWorldFromGoal(goal).roomName).toBe("全员议事");
    }
  });
});
