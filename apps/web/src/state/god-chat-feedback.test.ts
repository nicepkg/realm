import { describe, expect, test } from "bun:test";
import type { ConfigPatchProposal } from "@realm/api-contract";
import { previewCard } from "@/state/god-chat-feedback.ts";
import type { StagedConfig } from "@/state/god-chat-model.ts";

/**
 * Faithful config preview: an add-role proposal must surface the distilled role
 * identity (displayName · occupation · traits) so the card shows WHO will be
 * created, not just the thin "为「X」创建一个项目角色配置。" summary. World / non-role
 * proposals keep the plain localized summary.
 */
describe("previewCard — config add-role identity", () => {
  function roleProposal(): ConfigPatchProposal {
    return {
      id: "patch:role:1",
      title: "Create role 云遥",
      summary: "为「云遥」创建一个项目角色配置。",
      riskLevel: "low",
      riskReasons: [],
      typedConfirmation: null,
      requiredCapabilities: ["role.create"],
      operations: [
        {
          path: ".agents/roles/role-1/role.yaml",
          action: "create",
          previousHash: null,
          nextHash: "h",
          nextContent: "version: 1\n",
        },
      ],
      createdAt: new Date("2026-05-30T00:00:00.000Z").toISOString(),
    };
  }

  function stagedRole(goal: string, proposal: ConfigPatchProposal): StagedConfig {
    return { goal, kind: "config", proposal };
  }

  test("breaks out displayName · occupation · traits for an add-role proposal", () => {
    const card = previewCard(stagedRole("加一个叫云遥的炼丹师，谨慎、爱钱", roleProposal()));
    expect(card.kind).toBe("config");
    expect(card.variant).toBe("preview");
    // The distilled identity line must appear verbatim.
    expect(card.detail).toContain("云遥 · 炼丹师 · 谨慎/爱钱");
    // The localized summary still leads in, and the risk line is preserved.
    expect(card.detail).toContain("云遥");
    expect(card.detail).toContain("风险等级：低");
    // zh-CN only — no English leak in the body.
    expect(card.detail).not.toMatch(/[A-Za-z]/);
  });

  test("renders occupation-only roles without an empty trait segment", () => {
    const proposal = roleProposal();
    proposal.title = "Create role 沈墨";
    proposal.summary = "为「沈墨」创建一个项目角色配置。";
    const card = previewCard(stagedRole("加一个叫沈墨的剑修", proposal));
    expect(card.detail).toContain("沈墨 · 剑修");
    // No dangling separator when there are no traits.
    expect(card.detail).not.toContain("沈墨 · 剑修 · ");
  });

  test("renders trait-only roles without an undefined occupation", () => {
    const proposal = roleProposal();
    proposal.title = "Create role 林清";
    proposal.summary = "为「林清」创建一个项目角色配置。";
    const card = previewCard(stagedRole("创建角色「林清」性格洒脱", proposal));
    expect(card.detail).toContain("林清 · 性格洒脱");
    expect(card.detail).not.toContain("undefined");
  });

  test("detects an add-role proposal via the role.yaml path when capability is absent", () => {
    const proposal = roleProposal();
    proposal.requiredCapabilities = [];
    const card = previewCard(stagedRole("加一个叫云遥的炼丹师，谨慎、爱钱", proposal));
    expect(card.detail).toContain("云遥 · 炼丹师 · 谨慎/爱钱");
  });

  test("keeps the plain summary for a world proposal", () => {
    const worldProposal: ConfigPatchProposal = {
      id: "patch:world:1",
      title: "Create world 赛博修真世界",
      summary: "创建一个推演世界，并附带一个全员房间。",
      riskLevel: "low",
      riskReasons: [],
      typedConfirmation: null,
      requiredCapabilities: ["world.create"],
      operations: [
        {
          path: ".agents/worlds/assistant-world/world.yaml",
          action: "create",
          previousHash: null,
          nextHash: "h",
          nextContent: "version: 1\n",
        },
      ],
      createdAt: new Date("2026-05-30T00:00:00.000Z").toISOString(),
    };
    const card = previewCard(stagedRole("创建一个赛博修真世界", worldProposal));
    expect(card.detail).toContain("创建一个推演世界");
    // The world title preserves the full author name (preview cards carry a title).
    expect(card.variant).toBe("preview");
    if (card.variant !== "role-speech") {
      expect(card.title).toContain("赛博修真世界");
    }
    // No role-identity dot line leaks into a world card.
    expect(card.detail).not.toContain(" · ");
    // The goal named no inhabitants → no faithfulness note (bare world satisfies it).
    expect(card.detail).not.toContain("本次不创建");
  });

  test("world preview faithfully lists inhabitants the goal named (F2)", () => {
    const worldProposal: ConfigPatchProposal = {
      id: "patch:world:2",
      title: "Create world 赛博修真界",
      // The bare create-world patch only ever makes a world + 全员房间.
      summary: "创建一个对局世界，并附带一个全员房间。",
      riskLevel: "low",
      riskReasons: [],
      typedConfirmation: null,
      requiredCapabilities: ["world.create"],
      operations: [
        {
          path: ".agents/worlds/cyber/world.yaml",
          action: "create",
          previousHash: null,
          nextHash: "h",
          nextContent: "version: 1\n",
        },
      ],
      createdAt: new Date("2026-05-30T00:00:00.000Z").toISOString(),
    };
    // The operator names a sect + rival + master; the preview must reflect that
    // none of them are created yet — "说了 A 只做 B" must be visible up front.
    const card = previewCard(
      stagedRole("创建一个叫赛博修真界的世界，有宗门、对手和师父", worldProposal),
    );
    expect(card.detail).toContain("本次将创建：世界 + 全员房间");
    expect(card.detail).toContain("本次不创建：");
    expect(card.detail).toContain("宗门");
    expect(card.detail).toContain("对手");
    expect(card.detail).toContain("师父");
    expect(card.detail).toContain("确认后我再单独建");
    // The risk line is still preserved below the faithful note.
    expect(card.detail).toContain("风险等级：低");
  });
});
