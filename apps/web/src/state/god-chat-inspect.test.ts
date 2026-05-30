import { describe, expect, test } from "bun:test";
import type { RoleSummary } from "@realm/api-contract";
import { answerWorldState } from "@/state/god-chat-inspect.ts";
import type { GodChatContext } from "@/state/god-chat-model.ts";

/**
 * Co-located contract for the expanded `STATE_FIELD_LABELS` map: the cultivation-sim
 * `initial-state.yaml` nests well-known schema keys (`world` / `sect` / `name` /
 * `role` / `reputation` / `herbs` / `threats` / `status` / `doubts` / `injuries` /
 * `hiddenGoal` / `supplyNotes` / …) several levels deep. These must now surface as
 * zh-CN labels in the default inspect card so a common world no longer reads as a
 * block of English raw keys. Author-invented keys (`moon-grass` / `fire-root` /
 * `wolf-demon`) stay verbatim. The raw JSON now rides a SEPARATE `card.rawJson`
 * field (rendered behind a collapsed disclosure by the card UI) — it is NEVER
 * inlined into `card.detail`, so the humanized tree stays the authoritative reading.
 *
 * Empty-section collapse (F1): a top-level container with no real fields is dropped
 * from `card.detail` instead of being printed as a hollow `· （暂无字段）` block. A
 * fresh world (only `metaState`) leads with a concept sentence + that one section;
 * a fully blank world degrades to one honest sentence. The summary line and the
 * full `rawJson` are unaffected, so power-inspect still sees every key.
 */

const ROLES: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "雷军", id: "leijun", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

/** A faithful slice of cultivation-sim's initial-state.yaml (deep schema keys). */
function cultivationContext(overrides: Partial<GodChatContext> = {}): GodChatContext {
  return {
    roles: ROLES,
    roomId: "main",
    rooms: [{ id: "main" }],
    worldId: "cultivation",
    worldState: {
      state: {
        derivedState: {
          dangerLevel: "中",
          nextRecommendedAction: "先稳住药材，再围猎狼妖",
        },
        hiddenState: {
          fate: { nextDisaster: "灵雨", traitorHint: "市集账目不符" },
        },
        privateState: {
          roles: {
            guchenfeng: { hiddenGoal: "找回失踪的玉牌", injuries: ["肋骨开裂"] },
            leijun: { doubts: ["宗门无法靠迎击每一个显眼的威胁而存续"] },
            yunyao: { supplyNotes: ["火灵根存量低于账面记录"] },
          },
        },
        publicState: {
          sect: {
            herbs: { "fire-root": 3, "moon-grass": 8 },
            reputation: "低微",
            spiritStones: 120,
            threats: [{ id: "wolf-demon", severity: "medium", status: "潜伏于边境农庄" }],
          },
          world: { ambientQi: "紊乱", day: 1, location: "云岭外门", season: "初春" },
        },
      },
      version: 7,
    },
    ...overrides,
  };
}

describe("answerWorldState — expanded schema-key labels", () => {
  test("localizes the common cultivation-sim schema keys to zh-CN", () => {
    const { card } = answerWorldState(cultivationContext());
    // Keys that render as plain-object field labels in the main (non-raw) subtree.
    for (const label of [
      "世界",
      "宗门",
      "声望",
      "草药",
      "威胁",
      "疑虑",
      "伤势",
      "隐藏目标",
      "补给记录",
      "天命",
      "下一场灾劫",
      "内奸线索",
      "危险等级",
      "建议行动",
    ]) {
      expect(card.detail).toContain(label);
    }
  });

  test("array-of-object schema keys (severity/status) are localized when expanded as plain fields", () => {
    const { card } = answerWorldState(
      cultivationContext({
        // A single threat exposed as a plain object so its inner fields render.
        worldState: {
          state: {
            publicState: {
              sect: { threat: { severity: "medium", status: "潜伏于边境农庄" } },
            },
          },
          version: 9,
        },
      }),
    );
    expect(card.detail).toContain("严重程度");
    expect(card.detail).toContain("状态");
    // severity: medium humanizes to 中 via the enum-value map.
    expect(card.detail).toContain("严重程度：中");
  });

  test("a role's own name/role fields read as 姓名/身份, not raw English keys", () => {
    const { card } = answerWorldState(
      cultivationContext({
        worldState: {
          state: {
            publicState: {
              roles: { leijun: { name: "雷军", realm: "筑基一层", role: "导师" } },
            },
          },
          version: 8,
        },
      }),
    );
    expect(card.detail).toContain("姓名");
    expect(card.detail).toContain("身份");
    expect(card.detail).toContain("境界");
    // The deep `name` / `role` field keys must not leak as bare English. `detail`
    // is now purely the humanized tree (no raw-JSON tail), so assert directly.
    expect(card.detail).not.toContain("name：");
    expect(card.detail).not.toContain("role：");
  });

  test("author-invented hyphenated keys stay verbatim (never force-translated)", () => {
    const { card } = answerWorldState(cultivationContext());
    // moon-grass / fire-root are plain-object KEYS under `herbs` → rendered verbatim
    // in the humanized tree (never translated).
    expect(card.detail).toContain("moon-grass");
    expect(card.detail).toContain("fire-root");
    // wolf-demon is an array-element `id` value; arrays collapse to `N 项` in the
    // humanized tree, so its verbatim form survives in the separate raw-JSON field.
    const rawJson = card.variant === "result" ? card.rawJson : undefined;
    expect(rawJson).toContain("wolf-demon");
  });

  test("raw JSON rides the separate card.rawJson field, never inlined into detail", () => {
    const { card } = answerWorldState(cultivationContext());
    // The card is the result variant carrying a separate rawJson field.
    const rawJson = card.variant === "result" ? card.rawJson : undefined;
    expect(rawJson).toBeDefined();
    expect(rawJson).toContain("nextDisaster");
    // The humanized detail must NOT carry a raw-JSON tail any more.
    expect(card.detail).not.toContain("原始 JSON");
    expect(card.detail).not.toContain("原始字段");
    expect(card.detail).not.toContain('"nextDisaster"');
  });

  test("boolean leaves render as 是/否, never bare true/false; rawJson keeps the raw boolean", () => {
    const { card } = answerWorldState(
      cultivationContext({
        worldState: {
          state: {
            privateState: {
              roles: { leijun: { alive: true, muted: false } },
            },
          },
          version: 11,
        },
      }),
    );
    // Key labels stay zh-CN; the boolean VALUE humanizes to 是/否.
    expect(card.detail).toContain("存活：是");
    expect(card.detail).toContain("禁言：否");
    // No bare English boolean token leaks into the humanized tree.
    expect(card.detail).not.toContain("存活：true");
    expect(card.detail).not.toContain("禁言：false");
    expect(card.detail).not.toContain("：true");
    expect(card.detail).not.toContain("：false");
    // The raw boolean is preserved in the separate raw-JSON disclosure.
    const rawJson = card.variant === "result" ? card.rawJson : undefined;
    expect(rawJson).toContain('"alive": true');
    expect(rawJson).toContain('"muted": false');
  });

  test("a SINGLE nested empty-object leaf alongside real fields still renders 「（暂无字段）」, never [object Object]", () => {
    const { card } = answerWorldState(
      cultivationContext({
        // publicState has a real field (world) AND an empty nested leaf (roles={}).
        // The section is NOT empty, so it renders — and the lone empty leaf keeps
        // its honest placeholder (readability call from the brief).
        worldState: {
          state: { publicState: { roles: {}, world: { day: 1 } } },
          version: 1,
        },
      }),
    );
    expect(card.detail).toContain("角色：（暂无字段）");
    expect(card.detail).toContain("天：1");
    expect(card.detail).not.toContain("object Object");
  });

  test("an entirely-empty section is collapsed away (no hollow 「· （暂无字段）」 block)", () => {
    const { card } = answerWorldState(
      cultivationContext({
        // publicState is empty (roles={}) but derivedState carries a real field.
        worldState: {
          state: {
            derivedState: { dangerLevel: "中" },
            publicState: { roles: {} },
          },
          version: 4,
        },
      }),
    );
    // The empty 世界全景 section is dropped entirely.
    expect(card.detail).not.toContain("【世界全景】");
    // The non-empty 推演结果 section renders normally.
    expect(card.detail).toContain("【推演结果】");
    expect(card.detail).toContain("危险等级：中");
    // No lone empty-field placeholder leaks into the humanized tree.
    expect(card.detail).not.toContain("· （暂无字段）");
  });

  test("a fresh world with only metaState renders the lead-in sentence + only that section", () => {
    const { card } = answerWorldState(
      cultivationContext({
        worldState: {
          state: {
            derivedState: {},
            hiddenState: {},
            metaState: { tick: 0, turn: 1 },
            privateState: { roles: {} },
            publicState: {},
          },
          version: 1,
        },
      }),
    );
    // Lead-in concept sentence, then only the 运行元数据 section.
    expect(card.detail).toContain("这个世界还很新，目前只有运行元数据。");
    expect(card.detail).toContain("【运行元数据】");
    expect(card.detail).toContain("回合：1");
    // Every empty author-facing section is collapsed away.
    expect(card.detail).not.toContain("【世界全景】");
    expect(card.detail).not.toContain("【角色私密】");
    expect(card.detail).not.toContain("【天机（隐藏）】");
    expect(card.detail).not.toContain("【推演结果】");
    expect(card.detail).not.toContain("· （暂无字段）");
  });

  test("a world where EVERY top-level section is empty degrades to a single honest sentence", () => {
    const { card } = answerWorldState(
      cultivationContext({
        worldState: {
          state: {
            derivedState: {},
            metaState: {},
            privateState: { roles: {} },
            publicState: {},
          },
          version: 1,
        },
      }),
    );
    expect(card.detail).toBe("该世界尚无更多状态。");
    expect(card.detail).not.toContain("【");
    expect(card.detail).not.toContain("· （暂无字段）");
  });

  test("summary counts real top-level keys and rawJson keeps the full state even when sections collapse", () => {
    const ctx = cultivationContext({
      worldState: {
        state: {
          derivedState: {},
          metaState: { tick: 0, turn: 1 },
          privateState: { roles: {} },
          publicState: {},
        },
        version: 5,
      },
    });
    const { text, card } = answerWorldState(ctx);
    // Summary line is still based on the real keys (count + container labels),
    // unchanged by section collapse.
    expect(text).toContain("4 类状态");
    expect(text).toContain("运行元数据");
    expect(text).toContain("世界全景");
    // rawJson still carries the full state for power-inspect, including the empties.
    const rawJson = card.variant === "result" ? card.rawJson : undefined;
    expect(rawJson).toBeDefined();
    expect(rawJson).toContain('"publicState": {}');
    expect(rawJson).toContain('"turn": 1');
  });

  test("a real cultivation world renders every non-empty section and never the lead-in sentence", () => {
    const { card } = answerWorldState(cultivationContext());
    expect(card.detail).toContain("【世界全景】");
    expect(card.detail).toContain("【角色私密】");
    expect(card.detail).toContain("【天机（隐藏）】");
    expect(card.detail).toContain("【推演结果】");
    // The fresh-world lead-in must NOT appear on a populated world.
    expect(card.detail).not.toContain("这个世界还很新");
    expect(card.detail).not.toContain("该世界尚无更多状态。");
    expect(card.detail).not.toContain("· （暂无字段）");
  });
});
