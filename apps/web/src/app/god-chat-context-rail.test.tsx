import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import {
  flattenStateHighlights,
  GodChatContextRail,
  isSparseWorld,
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
