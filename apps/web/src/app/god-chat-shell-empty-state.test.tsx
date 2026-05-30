import { describe, expect, test } from "bun:test";
import { fakeApp, renderShell, substantialApp } from "./god-chat-shell-render-fixtures.tsx";

/**
 * F1 regression lock: the shell must feed the rail (and the advanced sheet) the
 * WORLD-SCOPED member list, not the raw project-wide role pool. After an NL
 * switch into a roleless world, `app.state.roles` still carries the prior world's
 * cast (the pool), but the rail's "本世界角色" section must read EMPTY — never ghost
 * those pool names. The shell reconstructs the hook's presence flag so a
 * selected-but-resolved empty world filters to zero members.
 *
 * We assert from the rendered rail markup (the rail renders into static markup;
 * the sheet body is portal-bearing and absent from renderToStaticMarkup, but both
 * are fed the identical scoped `railContext`, so proving the rail is scoped proves
 * the shell scoped the context that also reaches the sheet).
 */
describe("GodChatShell world-scopes the rail + sheet role list", () => {
  const pool = [
    { displayName: "顾辰风", id: "gu-chenfeng" },
    { displayName: "云遥", id: "yun-yao" },
  ];

  /**
   * Carve out JUST the rail's roles section from the rendered markup so a role
   * name appearing elsewhere (e.g. the empty-state suggestion "让顾辰风心生退意")
   * never pollutes the member-list assertion — we only care which roles the rail
   * actually lists.
   */
  function railRolesMarkup(html: string): string {
    const start = html.indexOf('data-testid="god-chat-rail-roles"');
    expect(start).toBeGreaterThanOrEqual(0);
    return html.slice(start);
  }

  test("empty (roleless) world → rail shows 0 members, not the project pool cast", () => {
    const rail = railRolesMarkup(
      renderShell(
        [],
        fakeApp({
          // The pool still carries the prior world's roles…
          roles: pool,
          // …but the freshly-switched world has NO members.
          selectedWorld: { id: "empty-world", roleIds: [] },
          worlds: [{ id: "empty-world", name: "空世界" }],
        }),
      ),
    );
    // The prior world's cast must be gone from the rail's member list.
    expect(rail).not.toContain("顾辰风");
    expect(rail).not.toContain("云遥");
    // World-scoped count + in-world empty copy.
    expect(rail).toContain("0 个成员");
    expect(rail).toContain("这个世界还没有角色。");
  });

  test("populated world → rail lists ONLY that world's members", () => {
    const rail = railRolesMarkup(
      renderShell(
        [],
        fakeApp({
          roles: pool,
          // Only 顾辰风 is a member of this world; 云遥 stays in the pool, off-stage.
          selectedWorld: { id: "sect-world", roleIds: ["gu-chenfeng"] },
          worlds: [{ id: "sect-world", name: "宗门世界" }],
        }),
      ),
    );
    expect(rail).toContain("顾辰风");
    expect(rail).not.toContain("云遥");
    expect(rail).toContain("1 个成员");
  });

  test("no world selected → rail keeps the full project roster (manager view)", () => {
    const rail = railRolesMarkup(
      renderShell(
        [],
        fakeApp({
          roles: pool,
          // No selectedWorld AND no worlds → true manager view, pool is correct.
          selectedWorld: undefined,
          worlds: [],
        }),
      ),
    );
    expect(rail).toContain("顾辰风");
    expect(rail).toContain("云遥");
    // Project-roster wording, not the in-world "成员".
    expect(rail).toContain("2 个角色");
    expect(rail).toContain("项目角色库");
  });
});

/**
 * F2 lock: the empty-state suggestion chips must be WORLD-SCOPED — never the
 * hard-coded role-specific "让顾辰风…" chip. In a freshly-created roleless world
 * 顾辰风 does not exist, so the chip is replaced with a generic create-role chip;
 * once the world has members the role-control chip templates a REAL member's
 * name. We assert both the pure builder and the rendered empty state.
 */
describe("buildSuggestions world-scopes the role chip (F2)", () => {
  test("zero scoped roles → generic chips only, no ghost role name", async () => {
    const { buildSuggestions, defaultGodChatShellStrings } = await import("./god-chat-shell.tsx");
    const chips = buildSuggestions([], defaultGodChatShellStrings);
    const labels = chips.map((c) => c.label);
    const prompts = chips.map((c) => c.prompt);
    // No reference to any specific (non-existent) member.
    expect([...labels, ...prompts].join("|")).not.toContain("顾辰风");
    // Generic create-world + create-role + inspect chips are present.
    expect(labels).toContain("创建一个修真世界");
    expect(labels).toContain("加一个角色");
    expect(labels).toContain("现在世界什么状态？");
  });

  test("one scoped role named 云遥 → role chip templates 云遥, never 顾辰风", async () => {
    const { buildSuggestions, defaultGodChatShellStrings } = await import("./god-chat-shell.tsx");
    const chips = buildSuggestions([{ displayName: "云遥" }], defaultGodChatShellStrings);
    const joined = chips.map((c) => `${c.label}|${c.prompt}`).join("||");
    expect(joined).toContain("让云遥");
    expect(joined).not.toContain("顾辰风");
    expect(joined).not.toContain("{name}");
    // Create-world + inspect generic chips are still kept alongside the role chip.
    expect(chips.map((c) => c.label)).toContain("创建一个修真世界");
    expect(chips.map((c) => c.label)).toContain("现在世界什么状态？");
  });

  test("picks the FIRST scoped member deterministically", async () => {
    const { buildSuggestions, defaultGodChatShellStrings } = await import("./god-chat-shell.tsx");
    const chips = buildSuggestions(
      [{ displayName: "首席" }, { displayName: "次席" }],
      defaultGodChatShellStrings,
    );
    const joined = chips.map((c) => c.label).join("|");
    expect(joined).toContain("让首席");
    expect(joined).not.toContain("次席");
  });
});

describe("GodChatShell empty-state chips reference only real roles (F2)", () => {
  test("fresh roleless world → chips include create-role, never 顾辰风", () => {
    const html = renderShell(
      [],
      fakeApp({
        // The pool still carries a prior cast, but the active world has 0 members.
        roles: [{ displayName: "顾辰风", id: "gu-chenfeng" }],
        selectedWorld: { id: "empty-world", roleIds: [] },
        worlds: [{ id: "empty-world", name: "空世界" }],
      }),
    );
    expect(html).not.toContain("顾辰风");
    // Generic create-world + create-role + inspect chips.
    expect(html).toContain("创建一个修真世界");
    expect(html).toContain("加一个角色");
    expect(html).toContain("现在世界什么状态？");
  });

  test("world with a member named 云遥 → role chip names 云遥, never 顾辰风", () => {
    const html = renderShell(
      [],
      fakeApp({
        roles: [{ displayName: "云遥", id: "yun-yao" }],
        selectedWorld: { id: "sect-world", roleIds: ["yun-yao"] },
        worlds: [{ id: "sect-world", name: "宗门世界" }],
      }),
    );
    expect(html).toContain("让云遥");
    expect(html).not.toContain("顾辰风");
    // The create-role chip is swapped out for the real-member control chip.
    expect(html).not.toContain("加一个角色");
    expect(html).toContain("创建一个修真世界");
  });
});

/**
 * The empty state (no turns yet) must still seed the conversation with the
 * vision's NL example suggestions so the operator always has a way to start —
 * the F4 spacing tweak must not drop the suggestions.
 */
describe("GodChatShell empty state", () => {
  test("renders the seed suggestions when there are no turns", () => {
    const html = renderShell([]);
    expect(html).toContain("创建一个修真世界");
    expect(html).toContain("现在世界什么状态？");
  });

  /**
   * Per the NL-first vision the fresh-world greeting reads as one calmly
   * centered block — the empty-state wrapper centers vertically and must NOT
   * regress to the old lower-third bias (justify-end + pb-[18vh]).
   */
  test("centers the empty-state block instead of biasing it downward", () => {
    const html = renderShell([]);
    expect(html).toContain("justify-center");
    expect(html).not.toContain("justify-end");
    expect(html).not.toContain("pb-[18vh]");
  });

  /**
   * F2 root-cause lock: the centered greeting must NOT live inside the
   * <Conversation> StickToBottom scroll viewport. Inside it, an inner `h-full`
   * resolves to the bottom-stuck scroll *content* container (not the visible
   * viewport), which dropped the greeting to ~44% height with dead space below.
   * The fix renders the greeting as its OWN `flex-1 min-h-0` column child — so
   * it centers against the true chat-area height (viewport − header − composer).
   *
   * We prove the SEPARATION structurally: when empty, the StickToBottom scroll
   * root (Conversation renders `role="log"`) and its auto-stick anchor must be
   * ABSENT — the greeting is not in any scroll semantics — while the dedicated
   * centered container (`god-chat-empty`, `flex-1 min-h-0`) is present.
   */
  test("renders the empty state OUTSIDE the Conversation/StickToBottom scroll flow", () => {
    const html = renderShell([]);
    // The dedicated centered container exists and claims the real chat height.
    expect(html).toContain('data-testid="god-chat-empty"');
    expect(html).toContain("min-h-0");
    expect(html).toContain("flex-1");
    // No scroll viewport (Conversation => role="log") and no auto-stick anchor
    // are mounted while empty — the greeting is free of stick-to-bottom semantics.
    expect(html).not.toContain('role="log"');
    expect(html).not.toContain('data-testid="conversation-auto-scroll"');
  });

  /**
   * The empty state's Suggestions must stay live (onPick=chat.setDraft) so the
   * operator can start by tapping a seed prompt — moving the block out of the
   * scroll flow must not strip the interactive chips.
   */
  test("keeps the empty-state suggestions interactive (onPick chips)", () => {
    const html = renderShell([]);
    expect(html).toContain('data-testid="god-chat-empty"');
    // The Suggestions component renders its seed prompts as tappable buttons.
    expect(html).toContain("创建一个修真世界");
    expect(html).toContain('data-testid="god-chat-suggestion"');
  });

  /**
   * Once turns exist the timeline must render the REAL <Conversation> scroll
   * flow (role="log" + auto-stick anchor) and the empty-state container must be
   * gone — the inverse of the empty-state separation above.
   */
  test("renders the Conversation scroll flow (not the empty container) once turns exist", () => {
    const html = renderShell([
      { id: "u1", role: "operator", text: "创建一个修真世界" },
      { id: "s1", role: "system", text: "已为你拟好世界蓝图。" },
    ]);
    expect(html).not.toContain('data-testid="god-chat-empty"');
    expect(html).toContain('role="log"');
    expect(html).toContain('data-testid="conversation-auto-scroll"');
  });

  /**
   * Reading-measure lock: the wide desktop chat column would read edge-to-edge
   * at full bleed, so the conversation AND the composer share one calm, centered
   * reading measure (max-w-4xl, ~896px → ~128px gutter each side inside the
   * 1152px rail-less column). The composer must share the EXACT measure so the
   * input aligns dead-under the content column — a regression to the old narrow
   * max-w-3xl (or a mismatch between the two) must fail here.
   */
  test("composer uses the widened max-w-4xl reading measure", () => {
    // The composer renders in both empty and non-empty states; assert from the
    // non-empty render so the conversation column shares the same measure.
    const html = renderShell([
      { id: "u1", role: "operator", text: "创建一个修真世界" },
      { id: "s1", role: "system", text: "已为你拟好世界蓝图。" },
    ]);
    // Both the conversation content and the composer wrapper carry max-w-4xl…
    const measures = html.match(/mx-auto w-full max-w-4xl/g) ?? [];
    expect(measures.length).toBeGreaterThanOrEqual(2);
    // …and the old narrow measure is gone.
    expect(html).not.toContain("max-w-3xl");
  });

  /**
   * Overlap-safety lock: the empty-state suggestions are taken out of the
   * centering math (absolute) but MUST anchor to the BOTTOM of the title group
   * (top-full), not a fixed top-1/2 offset — otherwise a wrapped description on
   * mobile overlaps them. They must also center on the title group's axis via
   * left-1/2 + -translate-x-1/2 (NOT inset-x-0, which clips wider chips on
   * desktop). The container keeps its centering utilities.
   */
  test("anchors empty-state suggestions below the title group, overlap-safe", () => {
    const html = renderShell([]);
    // The container is the relative anchor and keeps its centering utilities.
    expect(html).toContain('data-testid="god-chat-empty"');
    expect(html).toContain("justify-center");
    expect(html).toContain("min-h-0");
    expect(html).toContain("flex-1");
    // Suggestions hang off the BOTTOM of the title group, centered on its axis.
    expect(html).toContain("top-full");
    expect(html).toContain("-translate-x-1/2");
    // The chips still render and stay interactive.
    expect(html).toContain('data-testid="god-chat-suggestion"');
  });

  /**
   * R8 optical-center lock. The empty-state hero's whole visual CLUSTER (title +
   * description + the absolutely-anchored chips) must land at TRUE vertical
   * center on both breakpoints. The fix has two structural invariants we assert
   * here from the markup (live screenshot + bounding-box measurement is how the
   * exact bias was chosen — cluster midpoint ≈50% at both 1440×900 and 390×844 —
   * but the regression guard is the structure that produces it):
   *
   *  1. The centering container keeps `flex-1 min-h-0 items-center
   *     justify-center` and carries NO top padding (`pt-*`). A top pad would
   *     shrink the centered box asymmetrically and tug the title off true
   *     center — exactly the over-correction the earlier `pt-3`/`pt-10` caused.
   *  2. The optical compensation lives on the TITLE GROUP itself as an UPWARD
   *     translate (`-translate-y-10` ≈ 40px). Because the chips hang BELOW the
   *     title group via `top-full` (out of the centering math), `justify-center`
   *     centers ONLY the title group — leaving the combined title+chips cluster
   *     sitting BELOW true center. Nudging the title group UP by ~the chip
   *     block's downward extent lands the COMBINED cluster midpoint on true
   *     center — WITHOUT pulling the absolutely-anchored chips into the centering
   *     math. (The prior downward `translate-y-2.5` overshot past center.)
   */
  test("up-biases the title group so the whole cluster optically centers (no container pad)", () => {
    const html = renderShell([]);
    // Carve out JUST the empty container's own class attribute so the composer's
    // own `pt-3` (a different element below) can never pollute the no-top-pad
    // assertion — we only care about the centering container's classes here.
    const marker = 'data-testid="god-chat-empty"';
    const tagStart = html.lastIndexOf("<div", html.indexOf(marker));
    const tagEnd = html.indexOf(">", html.indexOf(marker));
    const containerTag = html.slice(tagStart, tagEnd);
    // The container keeps the asserted centering invariant…
    expect(containerTag).toContain("min-h-0");
    expect(containerTag).toContain("flex-1");
    expect(containerTag).toContain("items-center");
    expect(containerTag).toContain("justify-center");
    // …and carries NO top padding that would tug the title off true center.
    expect(containerTag).not.toContain("pt-3");
    expect(containerTag).not.toContain("pt-10");
    // The compensation lives on the title group as an UPWARD translate (the chips
    // stay out of the centering math) — and the old downward nudge is gone.
    expect(html).toContain("-translate-y-10");
    expect(html).not.toContain("translate-y-2.5");
  });

  /**
   * F7 ultra-wide gutter must NOT disturb the converged <1536px layout. The
   * WorldPulseGutter is `hidden 2xl:flex` (only paints at >=1536px) AND the
   * conversation column keeps its established max-w-4xl reading measure (never
   * widened to max-w-5xl / not narrowed to max-w-3xl) at every width. We assert
   * the gutter's responsive gate is present and the reading measure is intact —
   * a regression that leaked the gutter below 2xl, or re-sized the column, fails.
   */
  test("renders the ultra-wide pulse gutter only at 2xl, leaving the reading measure intact", () => {
    const html = renderShell(
      [
        { id: "u1", role: "operator", text: "创建一个修真世界" },
        { id: "s1", role: "system", text: "已为你拟好世界蓝图。" },
      ],
      substantialApp(),
    );
    // The gutter exists but is gated to 2xl only (never below 1536px).
    const start = html.indexOf('data-testid="world-pulse-gutter"');
    expect(start).toBeGreaterThanOrEqual(0);
    const open = html.slice(0, html.indexOf(">", start));
    expect(open).toContain("hidden");
    expect(open).toContain("2xl:flex");
    // The conversation column STILL uses the max-w-4xl measure, never widened.
    expect(html).toContain("mx-auto w-full max-w-4xl");
    expect(html).not.toContain("max-w-3xl");
    expect(html).not.toContain("max-w-5xl");
  });

  /**
   * F3 first-load balance: an empty conversation must also center the lg+ rail's
   * read-only summary (data-centered="true") so it shares the centered hero's
   * vertical rhythm instead of leaving a dead lower-right zone. The toggle is
   * lg+-scoped on the rail, so it never shifts the <lg mobile centered hero.
   */
  test("centers the lg+ context rail on first load to balance the centered hero", () => {
    const html = renderShell([]);
    expect(html).toContain('data-centered="true"');
    expect(html).toContain("lg:justify-center");
  });

  /**
   * Once a turn exists AND the world has substance (multiple state fields +
   * members), the timeline scrolls and the rail content grows top-down beside it,
   * so the rail must drop the centering (no dead zone to balance anymore). Proves
   * the empty-transcript centering is gone once the conversation has turns — and
   * that a developed world is NOT mistaken for a sparse one.
   */
  test("drops the rail centering once turns exist and the world has substance", () => {
    const html = renderShell(
      [
        { id: "u1", role: "operator", text: "创建一个修真世界" },
        { id: "s1", role: "system", text: "已为你拟好世界蓝图。" },
      ],
      substantialApp(),
    );
    expect(html).not.toContain('data-centered="true"');
    // The rail no longer adds the centering utility once turns exist + substance.
    expect(html).not.toContain("lg:justify-center");
  });

  /**
   * Vertical-balance fix: a freshly-created sparse world (a small handful of
   * state fields, ZERO members) must read as one balanced composition even when
   * the transcript is already non-empty — the rail SELF-DETECTS the sparse world
   * and centers (data-centered="true" + lg:justify-center) so its lower ~70% is
   * no longer a dead zone beside the chat. The signal flows purely from
   * railContext (worldState + zero scoped members), independent of chat.turns.
   */
  test("self-centers the rail for a sparse fresh world even with a non-empty transcript", () => {
    const html = renderShell(
      [
        { id: "u1", role: "operator", text: "创建一个赛博修真世界" },
        { id: "s1", role: "system", text: "赛博修真世界已就绪。" },
      ],
      fakeApp({
        // A just-created world: a couple of state fields, but no cast yet.
        roles: [],
        selectedWorld: { id: "cyber-cultivation", roleIds: [] },
        worlds: [{ id: "cyber-cultivation", name: "赛博修真世界" }],
        worldState: { state: { publicState: { sect: {}, world: { day: 1 } } }, version: 1 },
      }),
    );
    expect(html).toContain('data-centered="true"');
    expect(html).toContain("lg:justify-center");
  });
});
