import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import {
  flattenStateHighlights,
  GodChatContextRail,
  isSparseWorld,
  mutedRoleNames,
  pushRuleHighlights,
} from "./god-chat-context-rail.tsx";

const baseContext: GodChatContext = {
  roles: [
    { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
    { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
  ],
  roomId: "main",
  rooms: [{ id: "main" }],
  worldId: "yunling",
  worldState: { state: { qi: 80, sect: "天剑宗", rivals: ["a", "b"] }, version: 3 },
};

describe("flattenStateHighlights", () => {
  test("returns an empty list for missing state", () => {
    expect(flattenStateHighlights(undefined)).toEqual([]);
  });

  test("passes custom top-level fields through with counted zh-CN summaries", () => {
    const highlights = flattenStateHighlights({ qi: 80, rivals: ["a", "b"], meta: { x: 1 } });
    expect(highlights).toEqual([
      { label: "qi", path: "qi", value: "80" },
      { label: "rivals", path: "rivals", value: "2 项" },
      { label: "meta", path: "meta", value: "1 项" },
    ]);
  });

  test("labels well-known schema containers in zh-CN instead of dumping keys", () => {
    const highlights = flattenStateHighlights({
      hiddenState: { fate: {} },
      privateState: { roles: {} },
    });
    // Raw English schema keys must never surface as the operator-facing label.
    const labels = highlights.map((h) => h.label);
    expect(labels).toContain("角色私密");
    expect(labels).toContain("天机（隐藏）");
    expect(labels).not.toContain("privateState");
    expect(labels).not.toContain("hiddenState");
  });

  test("shallow-peeks metaState rules into individual readable highlights", () => {
    const highlights = flattenStateHighlights({
      metaState: { rules: ["每天掉一点灵气", "夜里禁止战斗"], tick: 0 },
    });
    // The actual rule text reads inline, not an opaque "运行元数据: 2 项".
    expect(highlights).toContainEqual({
      label: "规则",
      path: "metaState.rules.0",
      value: "每天掉一点灵气",
    });
    expect(highlights.map((h) => h.value)).toContain("夜里禁止战斗");
    // Remaining bookkeeping (tick) still collapses to one calm summary line.
    expect(highlights).toContainEqual({ label: "运行元数据", path: "metaState", value: "1 项" });
  });

  test("caps inline rules at three and notes the overflow tail", () => {
    const highlights = flattenStateHighlights({
      metaState: { rules: ["r1", "r2", "r3", "r4", "r5"] },
    });
    const ruleValues = highlights.filter((h) => h.label === "规则").map((h) => h.value);
    expect(ruleValues).toEqual(["r1", "r2", "r3", "还有 2 条"]);
  });

  test("surfaces muted roles by display name via the resolver", () => {
    const highlights = flattenStateHighlights(
      {
        metaState: {
          roles: {
            guchenfeng: { alive: true, muted: false },
            yunyao: { alive: true, muted: true },
          },
        },
      },
      { resolveRoleName: (id) => (id === "yunyao" ? "云遥" : id) },
    );
    expect(highlights).toContainEqual({
      label: "禁言",
      path: "metaState.roles.muted.云遥",
      value: "云遥",
    });
    // A non-muted role never produces a 禁言 row.
    expect(highlights.map((h) => h.value)).not.toContain("guchenfeng");
  });

  test("muted roles fall back to the raw id when no resolver is supplied (sheet path)", () => {
    const highlights = flattenStateHighlights({
      metaState: { roles: { yunyao: { muted: true } } },
    });
    expect(highlights.map((h) => h.value)).toContain("yunyao");
  });

  test("shallow-expands a custom world's own top-level rules list", () => {
    const highlights = flattenStateHighlights({ rules: ["设定规则：每天掉一点灵气"] });
    expect(highlights).toContainEqual({
      label: "规则",
      path: "rules.0",
      value: "设定规则：每天掉一点灵气",
    });
  });

  test("never expands private / hidden state contents", () => {
    const highlights = flattenStateHighlights({
      hiddenState: { fate: { traitor: "市集" } },
      privateState: { yunyao: { secret: "真名" } },
    });
    // Privacy line: these stay one summarized highlight, no inner values leak.
    expect(highlights.map((h) => h.value)).not.toContain("市集");
    expect(highlights.map((h) => h.value)).not.toContain("真名");
  });

  test("expands publicState one level into a human snapshot", () => {
    const highlights = flattenStateHighlights({
      publicState: { roles: { a: {}, b: {} }, sect: { reputation: "低微" }, world: { day: 1 } },
    });
    expect(highlights).toEqual([
      { label: "角色", path: "publicState.roles", value: "2 项" },
      { label: "宗门", path: "publicState.sect", value: "1 项" },
      { label: "世界", path: "publicState.world", value: "1 项" },
    ]);
  });

  test("boardroom-saga publicState children read as zh-CN labels, never raw English tokens", () => {
    // The exact regression that let an English-key leak ship across several prior
    // rounds: boardroom-saga's publicState groups its world under finance/equity/
    // governance containers (company / financials / capTable / threats / keyAccounts)
    // whose keys cultivation-sim never exercises — so the missing field labels only
    // surfaced on the SECOND world. With state-humanize.ts as the single source of
    // truth, every publicState child must resolve to its zh-CN reading and NONE of the
    // raw English tokens may survive as an operator-facing label.
    const highlights = flattenStateHighlights({
      publicState: {
        company: { stage: "IPO 前冲刺", fiscalQuarter: "2026Q1", sentiment: "high" },
        financials: {
          revenue: 4200,
          burnRate: 900,
          runwayQuarters: 5,
          cashOnHand: 4500,
        },
        capTable: { others: "12%", employeePool: "10%" },
        threats: ["对赌回购", "核心高管出走"],
        keyAccounts: { acme: { arr: 1200 }, globex: { arr: 800 } },
      },
    });
    const labels = highlights.map((h) => h.label);
    // Each well-known boardroom container resolves through STATE_FIELD_LABELS.
    expect(labels).toEqual(["公司概况", "财务状况", "股权结构", "威胁", "核心客户"]);
    // Hard guarantee: not a single raw English schema token leaks as a label.
    for (const token of ["company", "financials", "capTable", "threats", "keyAccounts"]) {
      expect(labels).not.toContain(token);
    }
    // Paths still carry the technical dotted key (stable React key / faint hint) —
    // the leak we guard against is the LABEL, never the path.
    expect(highlights.map((h) => h.path)).toEqual([
      "publicState.company",
      "publicState.financials",
      "publicState.capTable",
      "publicState.threats",
      "publicState.keyAccounts",
    ]);
    // The array container (威胁) summarizes by count; object containers by 项 count.
    const byPath = new Map(highlights.map((h) => [h.path, h.value]));
    expect(byPath.get("publicState.threats")).toBe("2 项");
    expect(byPath.get("publicState.financials")).toBe("4 项");
  });

  test("a custom top-level field (cultivation's qi) still passes through verbatim", () => {
    // Container-vs-field boundary must be preserved: `qi` here is a TOP-LEVEL,
    // author-chosen field — it must read its verbatim author key `qi`, NOT regress to
    // the field-leaf label 灵气 (which is only correct one level DOWN, inside a
    // container). containerLabel() (not fieldLabel()) governs top-level keys, so the
    // single-source-of-truth refactor must not bleed STATE_FIELD_LABELS up to the root.
    const highlights = flattenStateHighlights({
      qi: 80,
      publicState: { runwayQuarters: 5 },
    });
    const byPath = new Map(highlights.map((h) => [h.path, h]));
    // Top-level `qi` stays verbatim — boundary held.
    expect(byPath.get("qi")?.label).toBe("qi");
    expect(highlights.map((h) => h.label)).not.toContain("灵气");
    // …while the SAME refactor still humanizes a field one level deep inside a
    // container, proving the boundary is a boundary (field labels apply below root).
    expect(byPath.get("publicState.runwayQuarters")?.label).toBe("现金跑道(季)");
  });
});

describe("mutedRoleNames", () => {
  test("collects only roles flagged muted === true", () => {
    const names = mutedRoleNames({
      a: { muted: true },
      b: { muted: false },
      c: { alive: true },
    });
    expect(names).toEqual(["a"]);
  });

  test("resolves ids through the supplied resolver", () => {
    const names = mutedRoleNames({ yunyao: { muted: true } }, (id) =>
      id === "yunyao" ? "云遥" : id,
    );
    expect(names).toEqual(["云遥"]);
  });

  test("returns an empty list for a non-object roles value", () => {
    expect(mutedRoleNames(undefined)).toEqual([]);
    expect(mutedRoleNames(["x"])).toEqual([]);
  });
});

describe("pushRuleHighlights", () => {
  test("emits the first three rules plus an overflow note", () => {
    const out: { path: string; label: string; value: string }[] = [];
    pushRuleHighlights(out, ["a", "b", "c", "d"], "metaState.rules");
    expect(out.map((h) => h.value)).toEqual(["a", "b", "c", "还有 1 条"]);
  });

  test("no overflow note when within the inline cap", () => {
    const out: { path: string; label: string; value: string }[] = [];
    pushRuleHighlights(out, ["a", "b"], "metaState.rules");
    expect(out.map((h) => h.value)).toEqual(["a", "b"]);
  });
});

describe("isSparseWorld", () => {
  test("a fresh world (few fields, zero members) is sparse", () => {
    expect(isSparseWorld(0, 0)).toBe(true);
    expect(isSparseWorld(2, 0)).toBe(true);
    expect(isSparseWorld(5, 0)).toBe(true);
  });

  test("any member makes the world non-sparse regardless of field count", () => {
    expect(isSparseWorld(0, 1)).toBe(false);
    expect(isSparseWorld(2, 3)).toBe(false);
  });

  test("crossing the highlight floor makes the world non-sparse", () => {
    expect(isSparseWorld(6, 0)).toBe(false);
    expect(isSparseWorld(12, 0)).toBe(false);
  });
});

describe("GodChatContextRail", () => {
  test("renders state highlights and the role roster read-only", () => {
    const html = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    expect(html).toContain('data-testid="god-chat-context-rail"');
    expect(html).toContain("天剑宗");
    expect(html).toContain("顾辰风");
    expect(html).toContain("云遥");
    // No mutating controls live in the rail.
    expect(html).not.toContain("god-chat-card");
  });

  test("reads world rules + muted roles inline without opening inspect", () => {
    // Acceptance: after「设定规则：每天掉一点灵气」+「云遥作弊禁言」the rail's 世界状态
    // section must surface the rule text and "云遥 禁言" directly — not a "运行元数据: 2 项"
    // count that forces the operator into the chat inspect card.
    const ruled: GodChatContext = {
      ...baseContext,
      worldState: {
        state: {
          metaState: {
            roles: {
              guchenfeng: { alive: true, muted: false },
              yunyao: { alive: true, muted: true },
            },
            rules: ["每天掉一点灵气"],
            tick: 1,
          },
        },
        version: 4,
      },
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={ruled} />);
    expect(html).toContain("每天掉一点灵气");
    expect(html).toContain("规则");
    expect(html).toContain("禁言");
    // Muted role renders by display name, never the internal id.
    expect(html).toContain("云遥");
    expect(html).not.toContain("yunyao");
  });

  test("inside a world the roles section reads as本世界角色 with member count", () => {
    const html = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    // Title + meta make world ownership unambiguous: these ARE this world's members.
    expect(html).toContain("本世界角色");
    expect(html).toContain("2 个成员");
    expect(html).not.toContain("项目角色库");
  });

  test("empty world roles echo the state panel's blank-slate semantics", () => {
    const empty: GodChatContext = { ...baseContext, roles: [], worldState: undefined };
    const html = renderToStaticMarkup(<GodChatContextRail context={empty} />);
    // State panel + roles section must agree the current world is empty, so the
    // operator is never confused about whether stray roles belong here.
    expect(html).toContain("白纸");
    expect(html).toContain("还没有角色");
    expect(html).toContain("本世界角色");
  });

  test("with no world selected the roles section is the project roster", () => {
    const roster: GodChatContext = { ...baseContext, worldId: undefined, worldState: undefined };
    const html = renderToStaticMarkup(<GodChatContextRail context={roster} />);
    expect(html).toContain("项目角色库");
    expect(html).toContain("2 个角色");
    expect(html).not.toContain("本世界角色");
  });

  test("centered first-load vertically centers the read-only summary (lg+ only)", () => {
    // F3 balance: when the conversation is empty the rail centers its content to
    // share the centered hero's vertical rhythm. The toggle is lg+-scoped so it
    // never shifts the <lg mobile layout (where the rail is hidden).
    const centered = renderToStaticMarkup(<GodChatContextRail centered context={baseContext} />);
    expect(centered).toContain("lg:justify-center");
    expect(centered).toContain('data-centered="true"');

    // Default (a conversation exists) keeps the calm top-down alignment.
    const topAligned = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    expect(topAligned).not.toContain("lg:justify-center");
    expect(topAligned).not.toContain('data-centered="true"');
  });

  test("self-centers a sparse fresh world even when the transcript is non-empty", () => {
    // A just-created world: a couple of state fields, ZERO members. The rail must
    // self-detect this and render the centered/balanced treatment so its lower
    // ~70% is not a dead zone — independent of any external `centered` prop (the
    // transcript here is non-empty, so `centered` is NOT passed).
    const sparse: GodChatContext = {
      ...baseContext,
      roles: [],
      worldState: { state: { sect: "天剑宗", world: "云岭" }, version: 1 },
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={sparse} />);
    expect(html).toContain("lg:justify-center");
    expect(html).toContain('data-centered="true"');
  });

  test("reverts to top-alignment once the world has substance (members)", () => {
    // baseContext has 2 members → not sparse → top-aligned, no `centered` prop.
    const html = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    expect(html).not.toContain("lg:justify-center");
    expect(html).not.toContain('data-centered="true"');
  });

  test("reverts to top-alignment once the world has substance (many state fields)", () => {
    // Several state fields, no members → past the sparse floor → top-aligned.
    const developed: GodChatContext = {
      ...baseContext,
      roles: [],
      worldState: {
        state: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
        version: 2,
      },
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={developed} />);
    expect(html).not.toContain("lg:justify-center");
    expect(html).not.toContain('data-centered="true"');
  });

  test("a populated world anchors its bottom with a calm version stamp (no void)", () => {
    // F1: baseContext has members + a real worldState → top-aligned (NOT centered).
    // On a tall desktop the two short sections hug the top; the lower ~45% would read
    // as a blank slab. A bottom-pinned world stamp anchors that region instead.
    const html = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    // The column is explicitly marked closed via the bottom stamp (not a void).
    expect(html).toContain('data-closed="true"');
    expect(html).toContain('data-testid="god-chat-rail-stamp"');
    // The stamp is the world's quiet summary: version + field count + member count.
    expect(html).toContain("v3 · 3 字段 · 2 成员");
    // A real world is stamped, NOT terminated by the bare closing rule.
    expect(html).not.toContain('data-testid="god-chat-rail-closing-rule"');
    // And it is NOT forced into the centered/balanced treatment — content hugs the
    // top and grows top-down, the stamp just anchors the bottom.
    expect(html).not.toContain('data-centered="true"');
    expect(html).not.toContain("lg:justify-center");
  });

  test("a world with three members still anchors the bottom (no full-height void)", () => {
    // Verifier scenario: 3 roles. The rail must anchor its bottom so the lower
    // region is not a reserved white void; the world stamp is the structural marker.
    const threeMembers: GodChatContext = {
      ...baseContext,
      roles: [
        { displayName: "顾辰风", id: "r1", model: "default", source: "config" },
        { displayName: "云遥", id: "r2", model: "default", source: "config" },
        { displayName: "白薇", id: "r3", model: "default", source: "config" },
      ],
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={threeMembers} />);
    expect(html).toContain('data-closed="true"');
    expect(html).toContain('data-testid="god-chat-rail-stamp"');
    expect(html).toContain("v3 · 3 字段 · 3 成员");
    expect(html).toContain("白薇");
  });

  test("a worldless top-aligned roster keeps the bare closing rule (nothing to stamp)", () => {
    // No real worldState (the project roster with members but no selected world):
    // there is no world to stamp, so the column is terminated by the hairline
    // closing rule rather than a version footer.
    const roster: GodChatContext = {
      ...baseContext,
      worldId: undefined,
      worldState: undefined,
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={roster} />);
    expect(html).toContain('data-closed="true"');
    expect(html).toContain('data-testid="god-chat-rail-closing-rule"');
    expect(html).not.toContain('data-testid="god-chat-rail-stamp"');
  });

  test("a balanced (centered) rail has no anchor — content is mid-column, no top void", () => {
    // When centered (empty transcript) or sparse, the content is vertically
    // centered so there is no top-hugging void to terminate. Neither the closing
    // rule nor the world stamp must render under centered content.
    const centered = renderToStaticMarkup(<GodChatContextRail centered context={baseContext} />);
    expect(centered).toContain('data-centered="true"');
    expect(centered).not.toContain('data-closed="true"');
    expect(centered).not.toContain('data-testid="god-chat-rail-closing-rule"');
    expect(centered).not.toContain('data-testid="god-chat-rail-stamp"');

    const sparse: GodChatContext = {
      ...baseContext,
      roles: [],
      worldState: { state: { sect: "天剑宗" }, version: 1 },
    };
    const sparseHtml = renderToStaticMarkup(<GodChatContextRail context={sparse} />);
    expect(sparseHtml).toContain('data-centered="true"');
    expect(sparseHtml).not.toContain('data-closed="true"');
    expect(sparseHtml).not.toContain('data-testid="god-chat-rail-closing-rule"');
    expect(sparseHtml).not.toContain('data-testid="god-chat-rail-stamp"');
  });

  test("the rail surface fills its container edge with no reserved scrollbar gutter (no grey strip)", () => {
    // Desktop-balance regression: the rail must paint the canvas background right
    // to its own container edge and must NOT reserve an always-on scrollbar gutter
    // (`scrollbar-gutter: stable`), which would render as a content-less grey strip
    // beside the rail. Its only divider is the left hairline; the surface is flush.
    const html = renderToStaticMarkup(<GodChatContextRail context={baseContext} />);
    // Background is the shared canvas, painted edge-to-edge (so it seams cleanly
    // into the centered shell — no detached grey band on the rail's right).
    expect(html).toContain("bg-[var(--realm-bg)]");
    // A single left divider only; no reserved right-gutter chrome.
    expect(html).toContain("border-l");
    // Never a reserved scrollbar gutter (the would-be grey strip).
    expect(html).not.toContain("scrollbar-gutter");
    expect(html).not.toContain("[scrollbar-gutter:stable]");
  });

  test("empty project roster explains it is the pool, not a world", () => {
    const empty: GodChatContext = {
      ...baseContext,
      roles: [],
      worldId: undefined,
      worldState: undefined,
    };
    const html = renderToStaticMarkup(<GodChatContextRail context={empty} />);
    expect(html).toContain("项目里还没有角色");
  });
});
