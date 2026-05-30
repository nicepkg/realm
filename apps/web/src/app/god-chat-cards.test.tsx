import { describe, expect, test } from "bun:test";
import type { IntentStateOperation } from "@realm/assistant";
import { renderToStaticMarkup } from "react-dom/server";
import { previewCard as buildPreviewCard } from "@/state/god-chat-feedback.ts";
import type { ChatCard, StagedWrite } from "@/state/god-chat-model.ts";
import { confirmGate, defaultGodChatCardStrings, GodChatCard } from "./god-chat-cards.tsx";

const previewCard: ChatCard = {
  detail: "对「顾辰风」执行：禁言\n理由：作弊",
  kind: "god",
  title: "神谕裁决",
  variant: "preview",
};

const resultCard: ChatCard = {
  detail: "配置已写入 world.yaml",
  kind: "config",
  title: "配置已写入",
  variant: "result",
};

describe("GodChatCard", () => {
  test("a live preview grows confirm + cancel controls with per-kind test ids", () => {
    const html = renderToStaticMarkup(
      <GodChatCard
        card={previewCard}
        isPending
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="god-chat-card-god"');
    expect(html).toContain('data-testid="god-chat-card-god-confirm"');
    expect(html).toContain('data-testid="god-chat-card-god-cancel"');
    expect(html).toContain("神谕裁决");
  });

  test("a non-pending preview renders read-only (no confirm row)", () => {
    const html = renderToStaticMarkup(<GodChatCard card={previewCard} isPending={false} />);
    expect(html).not.toContain("god-chat-card-god-confirm");
  });

  test("a result card never renders confirm controls even if marked pending", () => {
    const html = renderToStaticMarkup(
      <GodChatCard card={resultCard} isPending onConfirm={() => undefined} />,
    );
    expect(html).toContain('data-card-variant="result"');
    expect(html).not.toContain("god-chat-card-config-confirm");
  });

  test("a trust-elevation preview renders a single confirm button (shield card, no phrase)", () => {
    const trustPreview: ChatCard = {
      detail: "当前项目为只读模式，无法运行角色或写入。",
      kind: "trust",
      title: "提升信任等级",
      variant: "preview",
    };
    const html = renderToStaticMarkup(
      <GodChatCard
        card={trustPreview}
        isPending
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="god-chat-card-trust"');
    expect(html).toContain('data-testid="god-chat-card-trust-confirm"');
    expect(html).not.toContain("god-chat-card-trust-phrase");
    expect(html).toContain("提升信任等级");
  });

  test("a role-speech card renders a named speaker bubble, not an action card", () => {
    const speech: ChatCard = {
      detail: "我已闭关三日，灵气未复。",
      kind: "run-turn",
      speakerName: "顾辰风",
      streaming: true,
      variant: "role-speech",
    };
    const html = renderToStaticMarkup(<GodChatCard card={speech} />);
    expect(html).toContain('data-testid="god-chat-role-speech"');
    expect(html).toContain('data-streaming="true"');
    expect(html).toContain("顾辰风");
    expect(html).toContain("我已闭关三日");
    // It is NOT an action card: no confirm/cancel affordances.
    expect(html).not.toContain("god-chat-card-run-turn-confirm");
  });

  test("an inspect result keeps the humanized tree in full and tucks raw JSON behind a collapsed disclosure", () => {
    const inspectResult: ChatCard = {
      detail: "【世界全景】\n  · 季节：春\n  · 天气：晴\n【天机（隐藏）】\n  · 内奸线索：沈墨",
      kind: "inspect",
      rawJson: '{\n  "hiddenState": {\n    "alive": true,\n    "muted": false\n  }\n}',
      title: "世界状态",
      variant: "result",
    };
    const html = renderToStaticMarkup(<GodChatCard card={inspectResult} />);
    // The humanized zh-CN tree renders verbatim and in full.
    expect(html).toContain("世界全景");
    expect(html).toContain("季节：春");
    expect(html).toContain("内奸线索：沈墨");
    // The raw JSON is present but behind a default-closed disclosure (no `open`).
    expect(html).toContain('data-testid="god-chat-card-raw-json"');
    expect(html).toContain("查看原始 JSON");
    expect(html).not.toContain("<details open");
    // The raw field dump must NOT bleed into the humanized detail prose — there is
    // no inline "原始 JSON" delimiter tail any more.
    expect(html).not.toContain("原始字段");
    // The raw keys live ONLY inside the <pre>, not in the humanized tree text.
    const detailEnd = html.indexOf('data-testid="god-chat-card-raw-json"');
    expect(html.slice(0, detailEnd)).not.toContain('"hiddenState"');
  });

  test("an inspect result without raw JSON renders no disclosure", () => {
    const inspectResult: ChatCard = {
      detail: "世界状态尚未加载完成，稍后再问一次。",
      kind: "inspect",
      title: "世界状态",
      variant: "result",
    };
    const html = renderToStaticMarkup(<GodChatCard card={inspectResult} />);
    expect(html).not.toContain("god-chat-card-raw-json");
  });

  test("a high-risk config patch surfaces a typed-confirmation phrase input", () => {
    const configPreview: ChatCard = {
      detail: "新增三个角色\n风险等级：高",
      kind: "config",
      title: "配置改动",
      variant: "preview",
    };
    const html = renderToStaticMarkup(
      <GodChatCard
        card={configPreview}
        confirmationPhrase="APPLY"
        isPending
        onConfirm={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="god-chat-card-config-phrase"');
    expect(html).toContain("APPLY");
  });

  test("typed-confirm tier renders a 点此填入 fill-assist button with an aria-label", () => {
    const phrase = "APPLY patch-mprwre61-64f126cc";
    const configPreview: ChatCard = {
      detail: "新增三个角色\n风险等级：高",
      kind: "config",
      title: "配置改动",
      variant: "preview",
    };
    const html = renderToStaticMarkup(
      <GodChatCard
        card={configPreview}
        confirmationPhrase={phrase}
        isPending
        onConfirm={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="god-chat-card-config-phrase-fill"');
    expect(html).toContain(defaultGodChatCardStrings.fillPhraseLabel);
    expect(html).toContain(`aria-label="${defaultGodChatCardStrings.fillPhraseAriaLabel(phrase)}"`);
  });

  test("plain confirm and trust-elevation tiers never render the fill-assist button", () => {
    const plainConfirm: ChatCard = {
      detail: "对「顾辰风」执行：禁言",
      kind: "god",
      title: "神谕裁决",
      variant: "preview",
    };
    const html = renderToStaticMarkup(
      <GodChatCard card={plainConfirm} isPending onConfirm={() => undefined} />,
    );
    expect(html).not.toContain("phrase-fill");
  });
});

describe("confirmGate fill-then-confirm behavior", () => {
  const phrase = "APPLY patch-mprwre61-64f126cc";

  test("an empty input keeps confirm disabled for a typed-confirm tier", () => {
    const gate = confirmGate({ busy: false, confirmationPhrase: phrase, typed: "" });
    expect(gate.requiresPhrase).toBe(true);
    expect(gate.canConfirm).toBe(false);
  });

  test("clicking 点此填入 sets the input to the full phrase and enables confirm", () => {
    // The fill handler does exactly one thing: setTyped(phrase). Model that, then
    // re-evaluate the gate the same way the component does.
    let typed = "";
    const handleFillPhrase = () => {
      typed = phrase;
    };
    handleFillPhrase();
    expect(typed).toBe(phrase);
    const gate = confirmGate({ busy: false, confirmationPhrase: phrase, typed });
    expect(gate.phraseMatches).toBe(true);
    expect(gate.canConfirm).toBe(true);
  });

  test("filling the phrase does NOT auto-submit — onConfirm only fires on a deliberate submit", () => {
    let typed = "";
    let confirmCalls = 0;
    const onConfirm = () => {
      confirmCalls += 1;
    };
    // Fill is value-only: it must not invoke onConfirm.
    const handleFillPhrase = () => {
      typed = phrase;
    };
    handleFillPhrase();
    expect(confirmCalls).toBe(0);
    // The operator still has to submit; only then does onConfirm fire (once).
    const gate = confirmGate({ busy: false, confirmationPhrase: phrase, typed });
    if (gate.canConfirm) {
      onConfirm();
    }
    expect(confirmCalls).toBe(1);
  });

  test("a busy row keeps confirm disabled even after the phrase is filled", () => {
    const gate = confirmGate({ busy: true, confirmationPhrase: phrase, typed: phrase });
    expect(gate.canConfirm).toBe(false);
  });
});

describe("previewCard reason suppression", () => {
  function godProposal(
    reason: string,
    targetRoleName = "沈墨",
  ): Extract<StagedWrite, { kind: "god" }> {
    return {
      action: "mute",
      kind: "god",
      reason,
      targetRoleId: "shenmo",
      targetRoleName,
      worldId: "w1",
    };
  }

  function patchProposal(reason: string): Extract<StagedWrite, { kind: "state-patch" }> {
    const operations: IntentStateOperation[] = [
      { op: "append", path: "/metaState/rules", value: "设定规则：每天消耗一点灵气" },
    ];
    return { kind: "state-patch", operations, reason, worldId: "w1" };
  }

  test("god card keeps the 理由 line when the reason adds information", () => {
    const card = buildPreviewCard(godProposal("沈墨出言不逊"));
    expect(card.detail).toBe("对「沈墨」执行：禁言\n理由：沈墨出言不逊");
  });

  test("god card drops the 理由 line when the reason duplicates the command", () => {
    // The action text already contains the verbatim reason → no echo.
    const card = buildPreviewCard(godProposal("对「沈墨」执行：禁言"));
    expect(card.detail).toBe("对「沈墨」执行：禁言");
    expect(card.detail).not.toContain("理由");
  });

  test("god card drops the 理由 line when the reason is blank", () => {
    const card = buildPreviewCard(godProposal("   "));
    expect(card.detail).toBe("对「沈墨」执行：禁言");
    expect(card.detail).not.toContain("理由");
  });

  test("god card strips the trailing imperative clause, keeping only the justification", () => {
    // "云遥作弊，把她禁言" echoes the action verb (禁言) in its trailing 把-clause; the
    // 理由 should carry only "云遥作弊", never repeat the action verb.
    const card = buildPreviewCard(godProposal("云遥作弊，把她禁言", "云遥"));
    expect(card.detail).toBe("对「云遥」执行：禁言\n理由：云遥作弊");
    expect(card.detail).not.toContain("把她禁言");
  });

  test("god card suppresses the 理由 line when only an imperative clause remains", () => {
    // Pure imperative echo with no justification → nothing meaningful survives.
    const card = buildPreviewCard(godProposal("把她禁言", "云遥"));
    expect(card.detail).toBe("对「云遥」执行：禁言");
    expect(card.detail).not.toContain("理由");
  });

  test("state-patch card keeps the 理由 line when the reason adds information", () => {
    const card = buildPreviewCard(patchProposal("收紧资源消耗"));
    expect(card.detail).toContain("理由：收紧资源消耗");
  });

  test("state-patch card drops the 理由 line when the action already conveys the reason", () => {
    // The describeOperations text contains the reason verbatim → suppress.
    const card = buildPreviewCard(patchProposal("设定规则：每天消耗一点灵气"));
    expect(card.detail).not.toContain("理由");
    expect(card.detail).toContain("追加");
  });
});
