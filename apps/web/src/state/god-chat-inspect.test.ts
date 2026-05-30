import { describe, expect, test } from "bun:test";
import type { RoleSummary } from "@realm/api-contract";
import { answerWorldState } from "@/state/god-chat-inspect.ts";
import type { ChatCard, GodChatContext } from "@/state/god-chat-model.ts";

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

/**
 * The authoritative full humanized tree, wherever it lives. For a DENSE world (F3)
 * it rides `card.detailLong` while `card.detail` holds the concise summary; for a
 * SPARSE world the full tree stays inline in `card.detail` (no `detailLong`). Most
 * label-localization assertions care about the full tree regardless of which field
 * carries it, so they read it through this helper.
 */
function treeOf(card: ChatCard): string {
  if (card.variant !== "result") {
    return "";
  }
  return card.detailLong ?? card.detail;
}

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
    // Keys that render as plain-object field labels in the humanized tree. The
    // cultivation fixture is DENSE (4 sections + role-bearing privateState), so the
    // full tree rides `detailLong`; read it through `treeOf`.
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
      expect(treeOf(card)).toContain(label);
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
    // Single non-role-bearing section → SPARSE, full tree stays in `detail`;
    // `treeOf` reads it either way.
    expect(treeOf(card)).toContain("严重程度");
    expect(treeOf(card)).toContain("状态");
    // severity: medium humanizes to 中 via the enum-value map.
    expect(treeOf(card)).toContain("严重程度：中");
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
    expect(treeOf(card)).toContain("姓名");
    expect(treeOf(card)).toContain("身份");
    expect(treeOf(card)).toContain("境界");
    // The deep `name` / `role` field keys must not leak as bare English anywhere in
    // the humanized tree.
    expect(treeOf(card)).not.toContain("name：");
    expect(treeOf(card)).not.toContain("role：");
  });

  test("author-invented hyphenated keys stay verbatim (never force-translated)", () => {
    const { card } = answerWorldState(cultivationContext());
    // moon-grass / fire-root are plain-object KEYS under `herbs` → rendered verbatim
    // in the humanized tree (never translated). The fixture is dense → in detailLong.
    expect(treeOf(card)).toContain("moon-grass");
    expect(treeOf(card)).toContain("fire-root");
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
    // Key labels stay zh-CN; the boolean VALUE humanizes to 是/否. privateState is
    // role-bearing → DENSE, so the tree rides detailLong; `treeOf` reads it.
    expect(treeOf(card)).toContain("存活：是");
    expect(treeOf(card)).toContain("禁言：否");
    // No bare English boolean token leaks into the humanized tree.
    expect(treeOf(card)).not.toContain("存活：true");
    expect(treeOf(card)).not.toContain("禁言：false");
    expect(treeOf(card)).not.toContain("：true");
    expect(treeOf(card)).not.toContain("：false");
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
    expect(treeOf(card)).toContain("角色：（暂无字段）");
    expect(treeOf(card)).toContain("天：1");
    expect(treeOf(card)).not.toContain("object Object");
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
    // derivedState is role-bearing → DENSE; the tree rides detailLong. The empty
    // 世界全景 section is dropped entirely (assert across summary + full tree).
    const combined = card.variant === "result" ? `${card.detail}\n${card.detailLong ?? ""}` : "";
    expect(combined).not.toContain("【世界全景】");
    // The non-empty 推演结果 section renders normally.
    expect(treeOf(card)).toContain("【推演结果】");
    expect(treeOf(card)).toContain("危险等级：中");
    // No lone empty-field placeholder leaks into the humanized tree.
    expect(combined).not.toContain("· （暂无字段）");
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
    // Dense world → full tree rides detailLong (read via treeOf).
    expect(treeOf(card)).toContain("【世界全景】");
    expect(treeOf(card)).toContain("【角色私密】");
    expect(treeOf(card)).toContain("【天机（隐藏）】");
    expect(treeOf(card)).toContain("【推演结果】");
    // The fresh-world lead-in must NOT appear on a populated world (anywhere).
    const combined = card.variant === "result" ? `${card.detail}\n${card.detailLong ?? ""}` : "";
    expect(combined).not.toContain("这个世界还很新");
    expect(combined).not.toContain("该世界尚无更多状态。");
    expect(combined).not.toContain("· （暂无字段）");
  });

  describe("dense vs sparse folding (F3)", () => {
    test("a DENSE world (multiple roles with 存活/禁言) yields a short detail + a populated detailLong", () => {
      const { card } = answerWorldState(
        cultivationContext({
          worldState: {
            state: {
              privateState: {
                roles: {
                  guchenfeng: { alive: true, muted: false },
                  leijun: { alive: true, muted: true },
                  yunyao: { alive: false, muted: false },
                },
              },
            },
            version: 12,
          },
        }),
      );
      if (card.variant !== "result") {
        throw new Error("expected a result card");
      }
      // detailLong carries the FULL per-role tree (every role's 存活/禁言).
      expect(card.detailLong).toBeDefined();
      expect(card.detailLong).toContain("【角色私密】");
      expect(card.detailLong).toContain("存活：是");
      expect(card.detailLong).toContain("禁言：是");
      expect(card.detailLong).toContain("存活：否");
      // detail is the CONCISE transition line + section headings, never the full
      // per-role dump. F3: the version+count summary is the LEADING bubble `text`
      // only — it must NOT be duplicated inside the card detail.
      expect(card.detail).toContain("当前在这些方面记录了内容");
      expect(card.detail).toContain("「角色私密」");
      expect(card.detail).not.toContain("当前世界（版本 v12）记录了");
      expect(card.detail).not.toContain("存活：");
      expect(card.detail).not.toContain("禁言：");
      // The summary must be markedly shorter than the full tree it stands in for.
      expect(card.detail.length).toBeLessThan((card.detailLong ?? "").length);
    });

    test("the version+count summary is never duplicated between leading text and dense detail (F3)", () => {
      const { text, card } = answerWorldState(
        cultivationContext({
          worldState: {
            state: {
              privateState: {
                roles: {
                  guchenfeng: { alive: true, muted: false },
                  leijun: { alive: true, muted: true },
                },
              },
            },
            version: 21,
          },
        }),
      );
      if (card.variant !== "result") {
        throw new Error("expected a result card");
      }
      // The version+count line lives ONLY in the leading bubble text.
      expect(text).toContain("当前世界（版本 v21）记录了");
      // It must appear EXACTLY ONCE across text + detail combined (no echo).
      const combined = `${text}\n${card.detail}`;
      const occurrences = combined.split("当前世界（版本 v21）记录了").length - 1;
      expect(occurrences).toBe(1);
      // The détail carries only the transition précis, not the summary sentence.
      expect(card.detail).not.toContain("当前世界（版本 v21）记录了");
    });

    test("a SPARSE world keeps the full tree in detail and emits no detailLong", () => {
      const { card } = answerWorldState(
        cultivationContext({
          worldState: {
            state: {
              publicState: { world: { day: 1, season: "初春" } },
            },
            version: 2,
          },
        }),
      );
      if (card.variant !== "result") {
        throw new Error("expected a result card");
      }
      // A single small non-role-bearing section stays fully inline.
      expect(card.detailLong).toBeUndefined();
      expect(card.detail).toContain("【世界全景】");
      expect(card.detail).toContain("季节：初春");
      expect(card.detail).toContain("天：1");
    });

    test("a world with ≥3 non-empty sections folds even without per-role sub-trees", () => {
      const { card } = answerWorldState(
        cultivationContext({
          worldState: {
            state: {
              hiddenState: { fate: { nextDisaster: "灵雨" } },
              metaState: { tick: 0, turn: 1 },
              publicState: { world: { day: 1 } },
            },
            version: 3,
          },
        }),
      );
      if (card.variant !== "result") {
        throw new Error("expected a result card");
      }
      expect(card.detailLong).toBeDefined();
      expect(card.detailLong).toContain("【世界全景】");
      expect(card.detailLong).toContain("【天机（隐藏）】");
      expect(card.detailLong).toContain("【运行元数据】");
      expect(card.detail).toContain("「世界全景」");
    });
  });
});
