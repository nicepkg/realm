import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePickActions, Suggestions } from "./suggestions.tsx";

const items = [
  { kind: "write" as const, label: "创建世界", prompt: "创建一个有宗门、对手和师父的修真世界" },
  { kind: "write" as const, label: "设定规则", prompt: "设定规则：每天掉一点灵气" },
];

describe("Suggestions", () => {
  test("renders one labelled pill per item with the stable test id", () => {
    const html = renderToStaticMarkup(<Suggestions items={items} onPick={() => undefined} />);

    expect(html).toContain("创建世界");
    expect(html).toContain("设定规则");
    // One test id per suggestion pill.
    const matches = html.match(/data-testid="god-chat-suggestion"/g) ?? [];
    expect(matches.length).toBe(2);
  });

  test("renders the label text, not the raw prompt", () => {
    const html = renderToStaticMarkup(<Suggestions items={items} onPick={() => undefined} />);

    // The full prompt only lives in the click handler, never in the visible label.
    expect(html).not.toContain("创建一个有宗门");
  });

  test("renders nothing when there are no items", () => {
    const html = renderToStaticMarkup(<Suggestions items={[]} onPick={() => undefined} />);
    expect(html).toBe("");
  });

  test("zero regression: without prefillHint, no hint region and no aria-pressed", () => {
    const html = renderToStaticMarkup(<Suggestions items={items} onPick={() => undefined} />);

    // The optional feedback layer must be completely absent when not opted in.
    expect(html).not.toContain("god-chat-suggestion-hint");
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain("aria-live");
  });

  test("prefillHint mounts a polite, screen-reader-only live region (initially empty)", () => {
    const html = renderToStaticMarkup(
      <Suggestions items={items} onPick={() => undefined} prefillHint="已填入，按发送" />,
    );

    expect(html).toContain('data-testid="god-chat-suggestion-hint"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("sr-only");
    // Idle: the live region carries no text until a pill is actually picked.
    expect(html).not.toContain("已填入，按发送");
  });

  test("prefillHint marks WRITE pills as toggle buttons (aria-pressed) without changing the visible label", () => {
    const html = renderToStaticMarkup(
      <Suggestions items={items} onPick={() => undefined} prefillHint="已填入，按发送" />,
    );

    // Each WRITE pill becomes an idle (unpressed) toggle when the hint is enabled.
    const matches = html.match(/aria-pressed="false"/g) ?? [];
    expect(matches.length).toBe(2);
    expect(html).toContain("创建世界");
  });

  test("a READ pill is a one-shot send action, never a toggle (no aria-pressed) even with prefillHint", () => {
    const mixed = [
      { kind: "write" as const, label: "创建世界", prompt: "创建一个修真世界" },
      { kind: "read" as const, label: "现在世界什么状态？", prompt: "现在世界什么状态？" },
    ];
    const html = renderToStaticMarkup(
      <Suggestions items={mixed} onPick={() => undefined} prefillHint="已填入，按发送" />,
    );

    // Only the single write pill is a toggle; the read pill carries no aria-pressed.
    const matches = html.match(/aria-pressed="false"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(html).toContain("现在世界什么状态？");
  });
});

describe("resolvePickActions — write (prefill-then-send)", () => {
  test("a write chip calls onPick with the full prompt and never auto-submits", () => {
    const picks: string[] = [];
    const result = resolvePickActions(
      { kind: "write", prompt: "创建一个修真世界" },
      {
        onPick: (p) => {
          picks.push(p);
        },
      },
    );
    const picked = picks.at(-1) ?? null;

    // It prefills (onPick) — and reports the prompt back, NOT sent.
    expect(picked).toBe("创建一个修真世界");
    expect(result.prompt).toBe("创建一个修真世界");
    expect(result.prefilled).toBe(true);
    expect(result.sent).toBe(false);
    // No onPicked supplied → the optional focus callback is reported as not run.
    expect(result.runOnPicked).toBe(false);
  });

  test("an un-annotated chip defaults to write (prefill, never auto-send)", () => {
    const sent: string[] = [];
    const result = resolvePickActions(
      { prompt: "设定规则：每天掉一点灵气" },
      { onPick: () => undefined, onPickRead: (p) => sent.push(p) },
    );

    // Default kind is write → onPickRead is NEVER fired, so nothing is sent.
    expect(sent).toEqual([]);
    expect(result.sent).toBe(false);
    expect(result.prefilled).toBe(true);
  });

  test("a write chip fires onPicked after onPick, in order, when supplied", () => {
    const order: string[] = [];
    const result = resolvePickActions(
      { kind: "write", prompt: "跑一回合" },
      {
        onPick: () => order.push("pick"),
        onPicked: () => order.push("picked"),
      },
    );

    expect(order).toEqual(["pick", "picked"]);
    expect(result.runOnPicked).toBe(true);
    expect(result.sent).toBe(false);
  });

  test("a write chip preserves the exact prompt (no trim) so the composer stays editable", () => {
    const picks: string[] = [];
    const raw = "  设定规则：每天掉一点灵气  ";
    resolvePickActions(
      { kind: "write", prompt: raw },
      {
        onPick: (p) => {
          picks.push(p);
        },
      },
    );

    // Verbatim prefill — the operator can edit before pressing send.
    expect(picks.at(-1)).toBe(raw);
  });
});

describe("resolvePickActions — read (direct-send)", () => {
  test("a read chip SENDS via onPickRead and never prefills or fires onPicked", () => {
    const order: string[] = [];
    const result = resolvePickActions(
      { kind: "read", prompt: "现在世界什么状态？" },
      {
        onPick: () => order.push("pick"),
        onPickRead: (p) => order.push(`send:${p}`),
        onPicked: () => order.push("picked"),
      },
    );

    // Only onPickRead runs — no prefill (onPick), no focus/pulse (onPicked).
    expect(order).toEqual(["send:现在世界什么状态？"]);
    expect(result.sent).toBe(true);
    expect(result.prefilled).toBe(false);
    expect(result.runOnPicked).toBe(false);
  });

  test("a read chip with NO onPickRead degrades to a plain prefill (never a dead click)", () => {
    const picks: string[] = [];
    const result = resolvePickActions(
      { kind: "read", prompt: "现在世界什么状态？" },
      {
        onPick: (p) => picks.push(p),
      },
    );

    // Fallback: it still prefills so the click does SOMETHING.
    expect(picks).toEqual(["现在世界什么状态？"]);
    expect(result.sent).toBe(false);
    expect(result.prefilled).toBe(true);
  });
});
