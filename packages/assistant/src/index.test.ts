import { describe, expect, test } from "bun:test";
import {
  detectWorldStructureClues,
  extractWorldName,
  inferConfigPlanFromGoal,
  inferRoleFromGoal,
  inferWorldFromGoal,
  ModelBackedConfigAssistantPlanner,
  parseAssistantConfigPlan,
} from "./index.ts";

// Mirror of @realm/core idSchema (^[a-zA-Z0-9][a-zA-Z0-9._:-]*$). Inlined here
// instead of importing @realm/core to avoid widening this package's deps for a
// single assertion; the world id must satisfy this to be a valid path segment.
const ID_SCHEMA_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

describe("assistant config planner", () => {
  test("infers role proposals from natural language goals", () => {
    expect(inferRoleFromGoal("创建一个巴菲特角色")).toMatchObject({
      id: "buffett",
      displayName: "巴菲特",
      summary: "长期价值投资者。",
    });
    expect(inferRoleFromGoal("Add QA reviewer")).toMatchObject({
      id: "qa",
      displayName: "质量评审",
      summary: "负责质量把关与回归审查。",
    });
  });

  test("extracts a Chinese name and zh summary from a generic role goal", () => {
    const role = inferRoleFromGoal("加一个叫白衣的剑客角色，冷峻寡言");
    // 叫X的Y: name=白衣, profession=剑客 (structural 角色 tail dropped).
    expect(role.displayName).toBe("白衣");
    expect(role.summary).toBe("白衣，剑客。冷峻寡言。");
    // Chinese names have no safe slug; the id must be a stable ascii token
    // (deterministic FNV-1a hex hash, mirroring world ids).
    expect(role.id).toMatch(/^role-[0-9a-f]+$/);
    expect(role.displayName).not.toBe("Custom Role");
  });

  test("splits 叫X的Y into name + profession and keeps every trait clause", () => {
    const role = inferRoleFromGoal("加一个叫沈墨的剑修，孤傲、护短");
    // The profession must never bleed into the displayName.
    expect(role.displayName).toBe("沈墨");
    expect(role.displayName).not.toBe("沈墨的剑修");
    // Profession seeds the summary; both traits (孤傲, 护短) survive.
    expect(role.summary).toBe("沈墨，剑修。孤傲，护短。");
    expect(role.summary).toContain("剑修");
    expect(role.summary).toContain("孤傲");
    expect(role.summary).toContain("护短");
    expect(role.id).toMatch(/^role-[0-9a-f]+$/);
  });

  test("splits 一个Y叫X profession-before-name phrasing", () => {
    const role = inferRoleFromGoal("加一个炼丹师叫青禾，温和细致");
    expect(role.displayName).toBe("青禾");
    expect(role.summary).toBe("青禾，炼丹师。温和细致。");
  });

  test("splits 名为X的Y phrasing", () => {
    const role = inferRoleFromGoal("创建一个名为李慕白的法师，沉稳睿智");
    expect(role.displayName).toBe("李慕白");
    expect(role.summary).toBe("李慕白，法师。沉稳睿智。");
  });

  test("falls back to a zh default name when none is proposed", () => {
    const role = inferRoleFromGoal("加一个角色帮我盯盘");
    expect(role.displayName).toBe("新角色");
    expect(role.displayName).not.toBe("Custom Role");
    expect(role.summary).toContain("新角色");
  });

  test("supports quoted Chinese names without leaking quote glyphs", () => {
    const role = inferRoleFromGoal("创建角色「林清」性格洒脱");
    expect(role.displayName).toBe("林清");
    expect(role.summary).toBe("林清，性格洒脱。");
  });

  test("infers world proposals from world creation goals with zh names", () => {
    const plan = inferConfigPlanFromGoal("创建一个修真世界");
    expect(plan.kind).toBe("world");
    if (plan.kind === "world") {
      expect(plan.world).toMatchObject({
        name: "修真世界",
        mode: "game",
        // Persisted verbatim as the world-main room's display NAME (the room id
        // is hardcoded "main" in patch-store); must be the zh-CN label, never
        // the raw English stable id "main".
        roomName: "全员议事",
        roleIds: [],
      });
      // The id is now derived from the name, no longer a hardcoded collision.
      expect(plan.world.id).not.toBe("assistant-world");
      expect(plan.world.id).toMatch(ID_SCHEMA_RE);
    }
  });

  test("composes a theme-faithful zh world name from a multi-genre prompt", () => {
    const world = inferWorldFromGoal("创建一个有宗门对手师父的赛博朋克武侠世界");
    // The name must reflect the prompt theme, never the generic 助理世界 stub.
    expect(world.name).not.toBe("助理世界");
    expect(world.name).toContain("赛博朋克");
    expect(world.name).toContain("武侠");
    expect(world.name).not.toMatch(/[A-Za-z]/);
    // A narrative genre (武侠) in the matches biases the mode toward game.
    expect(world.mode).toBe("game");
    // The id is name-derived, idSchema-safe, and no longer the shared stub.
    expect(world.id).not.toBe("assistant-world");
    expect(world.id).toMatch(ID_SCHEMA_RE);
    // Default world-main room display NAME is the zh-CN label, not the raw id.
    expect(world.roomName).toBe("全员议事");
  });

  test("keeps the operator's full authored '…世界' descriptor verbatim", () => {
    // The leading modifier (赛博) must NOT be dropped by keyword recomposition:
    // 赛博修真世界 keyword-matches only 修真, which would render '修真世界'.
    expect(extractWorldName("创建一个赛博修真世界")).toBe("赛博修真世界");
    expect(extractWorldName("创建一个末世废土世界")).toBe("末世废土世界");
    // A plain themed phrase stays itself (no extra modifier to preserve).
    expect(extractWorldName("创建一个修真世界")).toBe("修真世界");
    // A trailing 的-clause leaves "世界" standing alone -> no explicit descriptor.
    expect(extractWorldName("帮我做一个废土末世的世界")).toBeUndefined();
    // Bare "世界" with only scaffolding in front -> no explicit descriptor.
    expect(extractWorldName("帮我建一个世界")).toBeUndefined();
    // No "世界" at all -> nothing to extract.
    expect(extractWorldName("帮我建一个江湖")).toBeUndefined();
  });

  test("preserves the full author world name through inferWorldFromGoal", () => {
    // 赛博修真世界 keyword-matches only 修真; the author's 赛博 must survive.
    const cyber = inferWorldFromGoal("创建一个赛博修真世界");
    expect(cyber.name).toBe("赛博修真世界");
    expect(cyber.name).not.toBe("修真世界");
    // 修真 is a narrative genre -> game mode.
    expect(cyber.mode).toBe("game");

    const wasteland = inferWorldFromGoal("创建一个末世废土世界");
    expect(wasteland.name).toBe("末世废土世界");
    expect(wasteland.name).not.toBe("末世世界");

    // A quoted name still wins over the descriptor scan.
    const quoted = inferWorldFromGoal("创建世界「云岭」");
    expect(quoted.name).toBe("云岭");
  });

  test("derives a sandbox theme world for non-narrative genres", () => {
    const world = inferWorldFromGoal("帮我做一个废土末世的世界");
    expect(world.name).toContain("废土");
    expect(world.name).not.toBe("助理世界");
    expect(world.mode).toBe("sandbox");
    expect(world.id).not.toBe("assistant-world");
    expect(world.id).toMatch(ID_SCHEMA_RE);
  });

  test("falls back to 新世界 when no theme keyword or name is present", () => {
    const world = inferWorldFromGoal("帮我建一个世界");
    expect(world.name).toBe("新世界");
    expect(world.name).not.toMatch(/[A-Za-z]/);
    expect(world.id).not.toBe("assistant-world");
    expect(world.id).toMatch(ID_SCHEMA_RE);
  });

  test("never emits an English world name", () => {
    const plan = inferConfigPlanFromGoal("帮我建一个名叫青云界的修真世界");
    expect(plan.kind).toBe("world");
    if (plan.kind === "world") {
      expect(plan.world.name).toBe("青云界");
      expect(plan.world.name).not.toMatch(/[A-Za-z]/);
    }
  });

  describe("world id derivation (NO-NL-WORLD-SWITCH root fix)", () => {
    // Mirror of god-chat-write.ts WORLD_MANIFEST_PATH so we prove the derived id
    // survives a round-trip through the patch path that extractCreatedWorldId
    // parses and resolveCreatedWorldId re-derives.
    const WORLD_MANIFEST_PATH = /\.agents\/worlds\/([^/]+)\/world\.ya?ml$/;

    test("distinct world goals yield distinct ids (worlds can coexist)", () => {
      const a = inferWorldFromGoal("创建一个赛博修真世界");
      const b = inferWorldFromGoal("创建一个末世废土世界");
      const c = inferWorldFromGoal("创建一个修真世界");
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
      // None may regress to the old shared stub that caused the collision.
      for (const id of [a.id, b.id, c.id]) {
        expect(id).not.toBe("assistant-world");
      }
    });

    test("the same goal re-derives the same id (deterministic for the fallback)", () => {
      const goal = "创建一个赛博修真世界";
      expect(inferWorldFromGoal(goal).id).toBe(inferWorldFromGoal(goal).id);
      // Two goals that resolve to the SAME name share one id by design (they are
      // the same world); the id keys on the resolved name, not the raw goal.
      expect(inferWorldFromGoal("创建一个修真世界").id).toBe(
        inferWorldFromGoal("帮我做一个修真世界").id,
      );
    });

    test("the derived id is idSchema-safe and a valid manifest path segment", () => {
      for (const goal of [
        "创建一个赛博修真世界",
        "帮我建一个世界",
        "创建世界「云岭」",
        "Create stock council world",
      ]) {
        const { id } = inferWorldFromGoal(goal);
        expect(id).toMatch(ID_SCHEMA_RE);
        // No spaces / path separators — a single clean directory segment.
        expect(id).not.toMatch(/[\s/]/);
        // The id must round-trip through the world.yaml manifest path that
        // extractCreatedWorldId(...) parses to recover the created world id.
        const path = `.agents/worlds/${id}/world.yaml`;
        expect(path.match(WORLD_MANIFEST_PATH)?.[1]).toBe(id);
      }
    });

    test("ascii names keep a readable slug; zh names get a hash token", () => {
      // ASCII keeps a human-readable kebab slug (plus a stability hash suffix).
      const ascii = inferWorldFromGoal("Create stock council world");
      expect(ascii.id).toMatch(/^world-[a-z0-9-]+$/);
      // Chinese names have no safe slug -> pure hash token, still idSchema-safe.
      const zh = inferWorldFromGoal("创建一个赛博修真世界");
      expect(zh.id).toMatch(/^world-[0-9a-f]{8}$/);
    });
  });

  test("detects role/organization structure clues in a create-world goal (F2)", () => {
    const clues = detectWorldStructureClues("创建一个有宗门对手师父的赛博朋克武侠世界");
    expect(clues).toContain("宗门");
    expect(clues).toContain("对手");
    expect(clues).toContain("师父");
  });

  test("a bare themed world goal names no structure → empty clue list (F2)", () => {
    expect(detectWorldStructureClues("创建一个修真世界")).toEqual([]);
    expect(detectWorldStructureClues("帮我建一个世界")).toEqual([]);
  });

  test("structure clues are de-duped and first-seen ordered (F2)", () => {
    // 门派 appears twice; it must surface exactly once, in noun-list order.
    const clues = detectWorldStructureClues("一个有门派、敌人、门派的玄幻世界");
    expect(clues.filter((entry) => entry === "门派")).toHaveLength(1);
    expect(clues).toContain("门派");
    expect(clues).toContain("敌人");
  });

  test("structure clues NEVER mint roles — the world patch stays an empty skeleton (F2)", () => {
    // Honest path (findings option b): the runtime never fabricates the named
    // inhabitants; roleIds stays [] so the hook can offer a follow-up instead.
    const world = inferWorldFromGoal("创建一个有宗门对手师父的修真世界");
    expect(world.roleIds).toEqual([]);
    const plan = inferConfigPlanFromGoal("创建一个有宗门和对手的修真世界");
    expect(plan.kind).toBe("world");
    if (plan.kind === "world") {
      expect(plan.world.roleIds).toEqual([]);
    }
  });

  test("parses model-backed role plans from fenced JSON", () => {
    const plan = parseAssistantConfigPlan(
      [
        "```json",
        JSON.stringify({
          kind: "role",
          role: {
            id: "product-manager",
            displayName: "Product Manager",
            model: "default",
            summary: "Clarifies requirements and tradeoffs.",
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(plan).toEqual({
      kind: "role",
      role: {
        id: "product-manager",
        displayName: "Product Manager",
        model: "default",
        summary: "Clarifies requirements and tradeoffs.",
      },
    });
  });

  test("uses an injected model client for assistant planning", async () => {
    const planner = new ModelBackedConfigAssistantPlanner({
      complete: async () =>
        JSON.stringify({
          kind: "world",
          world: {
            id: "stock-council",
            name: "Stock Council",
            mode: "debate",
            roomName: "All Hands",
            roleIds: ["buffett"],
          },
        }),
    });

    await expect(planner.plan("Create stock council")).resolves.toMatchObject({
      kind: "world",
      world: { id: "stock-council", mode: "debate" },
    });
  });
});
