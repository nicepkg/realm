import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GodChatContext } from "@/state/god-chat-model.ts";
import { WorldPulseGutter } from "./world-pulse-gutter.tsx";

/**
 * WorldPulseGutter unit suite. The gutter is the F7 ultra-wide ambient rail: it
 * must (a) be `hidden` below 2xl and only `flex` at 2xl, (b) reflect the LIVE
 * active-world version / role-count / facts from the shared GodChatContext (never
 * hardcoded), and (c) render nothing when no world is active. We render to static
 * markup (no effects) since the component is pure presentation over its props.
 */

function render(context: GodChatContext, worldName?: string): string {
  return renderToStaticMarkup(<WorldPulseGutter context={context} worldName={worldName} />);
}

const liveContext: GodChatContext = {
  roles: [
    { displayName: "顾辰风", id: "gu-chenfeng" } as GodChatContext["roles"][number],
    { displayName: "云遥", id: "yun-yao" } as GodChatContext["roles"][number],
  ],
  roomId: undefined,
  rooms: [],
  worldId: "cultivation",
  worldState: {
    state: {
      derivedState: { dangerLevel: "中" },
      metaState: { tick: 3 },
      publicState: { sect: {}, world: { day: 1, location: "云岭外门", season: "初春" } },
    },
    version: 2,
  },
};

describe("WorldPulseGutter visibility", () => {
  test("is hidden below 2xl and only flex at 2xl", () => {
    const html = render(liveContext, "云岭修仙界");
    const start = html.indexOf('data-testid="world-pulse-gutter"');
    expect(start).toBeGreaterThanOrEqual(0);
    const open = html.slice(0, html.indexOf(">", start));
    expect(open).toContain("hidden");
    expect(open).toContain("2xl:flex");
    // It must NOT be unconditionally visible (would leak into the <1536px layout).
    expect(open).not.toContain("flex-col 2xl:hidden");
  });
});

describe("WorldPulseGutter reflects LIVE world context", () => {
  test("shows the live state version, role count + names, and field count", () => {
    const html = render(liveContext, "云岭修仙界");
    expect(html).toContain("云岭修仙界");
    // Live version from worldState (NOT hardcoded) — bumping it below proves it.
    expect(html).toContain("状态 v2");
    expect(html).toContain("2 位角色");
    expect(html).toContain("顾辰风");
    expect(html).toContain("云遥");
    // 3 top-level state containers in the fixture (publicState/metaState/derivedState).
    expect(html).toContain("3 个状态字段");
  });

  test("version follows the live worldState (v2 → v5 after a bump)", () => {
    const bumped: GodChatContext = {
      ...liveContext,
      worldState: { state: liveContext.worldState?.state ?? {}, version: 5 },
    };
    const html = render(bumped, "云岭修仙界");
    expect(html).toContain("状态 v5");
    expect(html).not.toContain("状态 v2");
  });

  test("surfaces only the ambient facts the world actually carries (时令/天数/地点)", () => {
    const html = render(liveContext, "云岭修仙界");
    expect(html).toContain("时令");
    expect(html).toContain("初春");
    expect(html).toContain("第 1 天");
    expect(html).toContain("云岭外门");
  });

  test("omits the facts block when no ambient facts are present", () => {
    const noFacts: GodChatContext = {
      ...liveContext,
      worldState: { state: { metaState: { tick: 0 } }, version: 1 },
    };
    const html = render(noFacts, "白纸世界");
    expect(html).not.toContain('data-testid="world-pulse-facts"');
    // The core stats still render off the live version.
    expect(html).toContain("状态 v1");
  });

  test("falls back to a zh-CN unnamed-world label when no name is given", () => {
    const html = render(liveContext);
    expect(html).toContain("未命名世界");
  });
});

describe("WorldPulseGutter with no active world", () => {
  test("renders nothing when no world is active (no worldId)", () => {
    const worldless: GodChatContext = {
      roles: [],
      roomId: undefined,
      rooms: [],
      worldId: undefined,
      worldState: undefined,
    };
    expect(render(worldless)).toBe("");
  });

  test("renders nothing when a world is selected but its state has not loaded", () => {
    const loading: GodChatContext = {
      roles: [],
      roomId: undefined,
      rooms: [],
      worldId: "pending",
      worldState: undefined,
    };
    expect(render(loading)).toBe("");
  });
});

describe("WorldPulseGutter accessibility", () => {
  test("pulse dot + stat rows carry zh-CN aria-labels for assistive tech", () => {
    const html = render(liveContext, "云岭修仙界");
    expect(html).toContain('aria-label="世界正在运转"');
    // The aside is a labelled complementary landmark a screen reader can jump to;
    // its rows read from their visible zh-CN text (no redundant aria-label).
    expect(html).toContain('aria-label="当前世界"');
    // No English WORDS leak into the visible text content. Strip attributes/
    // testids (which legitimately carry English class/data-testid tokens) and the
    // conventional version marker ("v2" — a universal version notation, not an
    // English word), then assert no remaining latin letters in the human text.
    const visibleText = html.replace(/<[^>]*>/g, "").replace(/v\d+/g, "");
    expect(visibleText).not.toMatch(/[A-Za-z]/);
  });
});
