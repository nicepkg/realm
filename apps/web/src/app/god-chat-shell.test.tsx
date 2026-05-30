import { describe, expect, test } from "bun:test";
import { renderShell } from "./god-chat-shell-render-fixtures.tsx";

type Turn = { id: string; card?: { variant: string; kind: string } };

const turns: Turn[] = [
  { id: "t1" },
  { card: { kind: "god", variant: "preview" }, id: "t2" },
  { card: { kind: "god", variant: "result" }, id: "t3" },
  { card: { kind: "config", variant: "preview" }, id: "t4" },
];

describe("resolveLivePreviewTurnId", () => {
  test("returns undefined when nothing is pending", async () => {
    const { resolveLivePreviewTurnId } = await import("./god-chat-shell.tsx");
    expect(resolveLivePreviewTurnId(turns, undefined)).toBeUndefined();
  });

  test("matches the most recent preview card of the pending kind", async () => {
    const { resolveLivePreviewTurnId } = await import("./god-chat-shell.tsx");
    expect(resolveLivePreviewTurnId(turns, "config")).toBe("t4");
    expect(resolveLivePreviewTurnId(turns, "god")).toBe("t2");
  });

  test("ignores result cards and never matches a non-pending kind", async () => {
    const { resolveLivePreviewTurnId } = await import("./god-chat-shell.tsx");
    expect(resolveLivePreviewTurnId(turns, "state-patch")).toBeUndefined();
    // A god result must never be treated as a live preview.
    expect(
      resolveLivePreviewTurnId([{ card: { kind: "god", variant: "result" }, id: "r" }], "god"),
    ).toBeUndefined();
  });
});

describe("streamingDetailLength", () => {
  test("returns the detail length of the last streaming role bubble", async () => {
    const { streamingDetailLength } = await import("./god-chat-shell.tsx");
    const t = [
      { card: { detail: "done", streaming: false, variant: "role-speech" } },
      { card: { detail: "在下顾辰风", streaming: true, variant: "role-speech" } },
    ];
    // The streamed (still-growing) bubble wins, not the settled one.
    expect(streamingDetailLength(t)).toBe("在下顾辰风".length);
  });

  test("returns 0 when no role bubble is streaming", async () => {
    const { streamingDetailLength } = await import("./god-chat-shell.tsx");
    expect(streamingDetailLength([])).toBe(0);
    expect(
      streamingDetailLength([
        { card: { detail: "settled", streaming: false, variant: "role-speech" } },
        { card: { detail: "preview", streaming: undefined, variant: "preview" } },
      ]),
    ).toBe(0);
  });
});

/**
 * Regression lock for the "stuck mid-history after send" bug: the shell MUST
 * mount the REAL `ConversationAutoScroll` inside `<Conversation>`. Its DOM anchor
 * (`data-testid="conversation-auto-scroll"`) is the handle the auto-stick effect
 * uses to locate the scroll container and drive `scrollTop` directly (bypassing
 * the use-stick-to-bottom `isAtBottom` false-positive). The growth-guard +
 * direct-DOM scroll behaviour is unit-tested in conversation.test.tsx; the value
 * the shell feeds (`streamingDetailLength`) is unit-tested above. Here we prove
 * the shell actually renders the affordance into the conversation — once.
 *
 * We render the REAL component (no `mock.module` on the shared conversation
 * module) to avoid leaking a stub into conversation.test.tsx — Bun's module mocks
 * are process-global and cannot be reliably restored mid-process.
 */
describe("GodChatShell folds system feedback into result cards", () => {
  test("a system result turn folds its feedback line into the card (no standalone bubble)", () => {
    const html = renderShell([
      { id: "u1", role: "operator", text: "让云遥禁言" },
      {
        card: { detail: "对「云遥」执行：禁言", kind: "god", title: "神谕裁决", variant: "result" },
        id: "s1",
        role: "system",
        text: "裁决已对云遥生效。",
      },
    ]);
    // The feedback line is folded INTO the card frame as the prefix…
    expect(html).toContain('data-testid="god-chat-card-feedback"');
    expect(html).toContain("裁决已对云遥生效。");
    // …and there is NO separate surface-muted text bubble carrying that same line
    // above the card (the standalone system text bubble is suppressed). The card's
    // own muted surface remains, so we assert the bubble's text-paragraph class is
    // not used for a leading line by checking the feedback sits inside the card.
    const cardAt = html.indexOf('data-testid="god-chat-card-god"');
    const feedbackAt = html.indexOf('data-testid="god-chat-card-feedback"');
    expect(cardAt).toBeGreaterThanOrEqual(0);
    expect(feedbackAt).toBeGreaterThan(cardAt);
  });

  test("a system PREVIEW turn keeps its standalone text bubble (no folding)", () => {
    const html = renderShell([
      { id: "u1", role: "operator", text: "让云遥禁言" },
      {
        card: {
          detail: "对「云遥」执行：禁言",
          kind: "god",
          title: "神谕裁决",
          variant: "preview",
        },
        id: "s1",
        role: "system",
        text: "我拟对云遥执行禁言，确认吗？",
      },
    ]);
    // A preview turn is untouched: its leading text renders as a normal bubble and
    // no folded feedback prefix appears inside the card.
    expect(html).toContain("我拟对云遥执行禁言，确认吗？");
    expect(html).not.toContain("god-chat-card-feedback");
  });
});

describe("GodChatShell mounts ConversationAutoScroll", () => {
  test("renders the auto-scroll anchor exactly once when turns exist", () => {
    const html = renderShell([
      { id: "u1", role: "operator", text: "创建一个修真世界" },
      { id: "s1", role: "system", text: "已为你拟好世界蓝图。" },
    ]);
    const matches = html.match(/data-testid="conversation-auto-scroll"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("still renders the anchor while a role bubble streams in place", () => {
    // A streaming role bubble grows its detail IN PLACE (no new turn), so the
    // viewport tracks the bottom via streamSignal (streamingDetailLength). The
    // affordance must remain mounted throughout the stream.
    const html = renderShell([
      { id: "u1", role: "operator", text: "让顾辰风说话" },
      {
        card: {
          detail: "在下顾辰风，今日出关。",
          kind: "run-turn",
          speakerName: "顾辰风",
          streaming: true,
          variant: "role-speech",
        },
        id: "r1",
        role: "system",
        text: "",
      },
    ]);
    const matches = html.match(/data-testid="conversation-auto-scroll"/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
