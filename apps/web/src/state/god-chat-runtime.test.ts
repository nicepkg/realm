import { describe, expect, test } from "bun:test";
import type { ConfigPatchProposal, RoleSummary } from "@realm/api-contract";
import {
  configResultFeedback,
  describeOperations,
  type GodChatContext,
  humanizePatchPath,
  type StagedConfig,
} from "@/state/god-chat-model.ts";
import { answerWorldState, localizeProposalSummary } from "@/state/god-chat-runtime.ts";

/** Two roles whose ids must localize to display names in paths and inspect cards. */
const ROLES: RoleSummary[] = [
  { id: "guchenfeng", displayName: "顾辰风", model: "default", source: "config" },
  { id: "leijun", displayName: "雷军", model: "default", source: "config" },
];

/**
 * Runtime-helper contract focused on the world-state inspect answer (R3 task):
 * the DEFAULT answer must read as zh-CN — friendly container labels, humanized
 * known enum values, author-chosen custom keys passed through verbatim — and must
 * NEVER leak a bare English container key (`publicState` / `privateState` / …)
 * into the default prose or summary. The raw JSON rides a SEPARATE `card.rawJson`
 * field (rendered behind a collapsed disclosure by the card UI) — never inlined
 * into `card.detail`. The settle/de-dup contract lives in
 * `god-chat-runtime-settle.test.ts`.
 */

function context(overrides: Partial<GodChatContext> = {}): GodChatContext {
  return {
    roles: [],
    roomId: "main",
    rooms: [{ id: "main" }],
    worldId: "cultivation",
    worldState: {
      state: {
        publicState: { world: { season: "spring" }, sect: { name: "天剑宗" } },
        privateState: { yunyao: { mood: "wary" } },
        hiddenState: { "wolf-demon": { threat: "high" } },
        derivedState: { conflict: { severity: "medium" } },
      },
      version: 3,
    },
    ...overrides,
  };
}

describe("answerWorldState — zh-CN default inspect answer", () => {
  test("summary uses Chinese container labels, not English keys", () => {
    const answer = answerWorldState(context());
    expect(answer.text).toContain("v3");
    expect(answer.text).toContain("世界全景");
    expect(answer.text).toContain("角色私密");
    expect(answer.text).toContain("天机（隐藏）");
    expect(answer.text).toContain("推演结果");
    // The summary must never leak a raw English container key.
    expect(answer.text).not.toContain("publicState");
    expect(answer.text).not.toContain("privateState");
    expect(answer.text).not.toContain("hiddenState");
    expect(answer.text).not.toContain("derivedState");
  });

  test("default card detail labels containers in zh-CN and humanizes known enums", () => {
    const { card } = answerWorldState(context());
    expect(card.variant).toBe("result");
    expect(card.kind).toBe("inspect");
    expect(card.detail).toContain("【世界全景】");
    expect(card.detail).toContain("【角色私密】");
    expect(card.detail).toContain("【天机（隐藏）】");
    expect(card.detail).toContain("【推演结果】");
    // severity: medium -> 中 (known enum humanized).
    expect(card.detail).toContain("中");
  });

  test("author-chosen custom keys pass through verbatim", () => {
    const answer = answerWorldState(
      context({ worldState: { state: { qi: 100, sect: "天剑宗" }, version: 5 } }),
    );
    // Custom top-level keys are author-meaningful: shown as-is, not invented.
    expect(answer.text).toContain("qi");
    expect(answer.text).toContain("sect");
    expect(answer.card.detail).toContain("qi");
    expect(answer.card.detail).toContain("sect");
  });

  test("raw JSON rides the separate card.rawJson field, never inlined into detail", () => {
    const { card } = answerWorldState(context());
    const rawJson = card.variant === "result" ? card.rawJson : undefined;
    expect(rawJson).toBeDefined();
    // The literal snapshot values live in the separate raw field for power-inspect.
    expect(rawJson).toContain("spring");
    expect(rawJson).toContain("wolf-demon");
    // The humanized detail must NOT carry an inline raw-JSON tail.
    expect(card.detail).not.toContain("原始 JSON");
  });

  test("no world loaded is calm zh-CN, not an error", () => {
    const answer = answerWorldState(context({ worldId: undefined }));
    expect(answer.text).toContain("世界");
    expect(answer.text).not.toContain("publicState");
  });

  test("empty world state reports a blank world honestly in zh-CN", () => {
    const answer = answerWorldState(context({ worldState: { state: {}, version: 0 } }));
    expect(answer.text).toContain("白纸");
  });

  test("not-yet-loaded world state is calm, not an error", () => {
    const answer = answerWorldState(context({ worldState: undefined }));
    expect(answer.text).toContain("尚未加载");
  });

  // F3-b: role ids and engine schema keys must localize in the inspect card.
  test("role ids localize to display names and engine keys to zh-CN labels", () => {
    const answer = answerWorldState(
      context({
        roles: ROLES,
        worldState: {
          state: {
            publicState: { world: { season: "spring", spiritStones: 320 } },
            privateState: { roles: { leijun: { realm: "筑基", qi: 80 } } },
          },
          version: 7,
        },
      }),
    );
    // Role id → display name (leijun → 雷军), never the bare id in the main view.
    expect(answer.card.detail).toContain("雷军");
    // `detail` is now purely the humanized tree (raw JSON moved to card.rawJson).
    expect(answer.card.detail).not.toContain("leijun");
    // Engine schema keys → zh-CN labels.
    expect(answer.card.detail).toContain("灵石");
    expect(answer.card.detail).toContain("季节");
    expect(answer.card.detail).toContain("境界");
    expect(answer.card.detail).toContain("灵气");
    // The humanized view must not leak the raw English schema keys.
    expect(answer.card.detail).not.toContain("spiritStones");
    expect(answer.card.detail).not.toContain("season");
  });

  test("unknown author keys still pass through verbatim (no invented translation)", () => {
    const answer = answerWorldState(
      context({
        roles: ROLES,
        worldState: { state: { publicState: { "moon-grass": 3 } }, version: 1 },
      }),
    );
    expect(answer.card.detail).toContain("moon-grass");
  });
});

describe("localizeProposalSummary — faithful create-world preview (F2)", () => {
  // The deterministic create-world summary the planner emits (mode word varies).
  const WORLD_SUMMARY = "创建一个对局世界，并附带一个全员房间。";

  test("lists the inhabitants the goal named but the bare world will NOT create", () => {
    const out = localizeProposalSummary(
      WORLD_SUMMARY,
      "创建一个叫赛博修真界的世界，有宗门、对手和师父",
    );
    // The faithful note must explicitly say what IS and what is NOT created.
    expect(out).toContain("本次将创建：世界 + 全员房间");
    expect(out).toContain("本次不创建：");
    expect(out).toContain("宗门");
    expect(out).toContain("对手");
    expect(out).toContain("师父");
    expect(out).toContain("确认后我再单独建");
    // The original localized summary still leads in.
    expect(out).toContain("创建一个对局世界");
  });

  test("matches 师傅/门派/敌人 wording variants via the shared planner detector", () => {
    const out = localizeProposalSummary(WORLD_SUMMARY, "建个门派世界，有敌人和师傅");
    expect(out).toContain("门派");
    expect(out).toContain("敌人");
    expect(out).toContain("师傅");
    expect(out).toContain("本次不创建：");
  });

  test("no note when the goal named no inhabitants — bare world satisfies it", () => {
    const out = localizeProposalSummary(WORLD_SUMMARY, "创建一个赛博修真世界");
    expect(out).toBe("创建一个对局世界，并附带一个全员房间。");
    expect(out).not.toContain("本次不创建");
  });

  test("no goal supplied → backward-compatible, summary unchanged (F4 only)", () => {
    expect(localizeProposalSummary(WORLD_SUMMARY)).toBe(WORLD_SUMMARY);
  });

  test("non-world summary is never decorated even when a goal names nouns", () => {
    // An add-role / rule summary must not gain a world faithfulness note.
    const out = localizeProposalSummary("为「云遥」创建一个项目角色配置。", "加一个宗门弟子云遥");
    expect(out).toBe("为「云遥」创建一个项目角色配置。");
    expect(out).not.toContain("本次不创建");
  });
});

describe("humanizePatchPath — zh-CN reading path, no bare pointer", () => {
  test("role id segment renders as display name, no raw pointer", () => {
    const path = humanizePatchPath("/privateState/roles/guchenfeng/conditions", ROLES);
    expect(path).toContain("顾辰风");
    expect(path).toContain("角色私密");
    expect(path).not.toContain("/privateState");
    expect(path).not.toContain("guchenfeng");
  });

  test("unknown role id falls back to its id rather than dropping it", () => {
    const path = humanizePatchPath("/roles/unknown-one/qi", []);
    expect(path).toContain("unknown-one");
    expect(path).not.toContain("/roles");
  });
});

describe("describeOperations — zh-CN role names in patch paths", () => {
  test("increment on a role condition reads with the display name, not a pointer", () => {
    const summary = describeOperations(
      [{ op: "increment", path: "/privateState/roles/guchenfeng/conditions", amount: -10 }],
      ROLES,
    );
    expect(summary).toContain("顾辰风");
    expect(summary).not.toContain("/privateState/roles/guchenfeng");
  });
});

describe("configResultFeedback — single-layer quotes", () => {
  function stagedConfig(title: string): StagedConfig {
    return {
      goal: "g",
      kind: "config",
      proposal: { title } as unknown as ConfigPatchProposal,
    };
  }

  test("does not double-nest 「」 around an already-quoted localized title", () => {
    // localizeProposalTitle("create world Assistant World") → 创建世界「Assistant World」
    const { text } = configResultFeedback(stagedConfig("create world 助理世界"), ["world.yaml"]);
    expect(text).not.toContain("「「");
    expect(text).not.toContain("」」");
    expect(text).toContain("已应用配置：");
  });
});
