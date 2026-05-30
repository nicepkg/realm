import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePickActions, Suggestions } from "./suggestions.tsx";

const items = [
  { label: "创建世界", prompt: "创建一个有宗门、对手和师父的修真世界" },
  { label: "设定规则", prompt: "设定规则：每天掉一点灵气" },
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

  test("prefillHint marks pills as toggle buttons (aria-pressed) without changing the visible label", () => {
    const html = renderToStaticMarkup(
      <Suggestions items={items} onPick={() => undefined} prefillHint="已填入，按发送" />,
    );

    // Each pill becomes an idle (unpressed) toggle when the hint is enabled.
    const matches = html.match(/aria-pressed="false"/g) ?? [];
    expect(matches.length).toBe(2);
    expect(html).toContain("创建世界");
  });
});

describe("resolvePickActions", () => {
  test("calls onPick with the full prompt and never auto-submits", () => {
    const picks: string[] = [];
    const result = resolvePickActions("创建一个修真世界", {
      onPick: (p) => {
        picks.push(p);
      },
    });
    const picked = picks.at(-1) ?? null;

    // It prefills (onPick) — the only effect — and reports the prompt back.
    expect(picked).toBe("创建一个修真世界");
    expect(result.prompt).toBe("创建一个修真世界");
    // No onPicked supplied → the optional focus callback is reported as not run.
    expect(result.runOnPicked).toBe(false);
  });

  test("fires onPicked after onPick, in order, when supplied", () => {
    const order: string[] = [];
    const result = resolvePickActions("跑一回合", {
      onPick: () => order.push("pick"),
      onPicked: () => order.push("picked"),
    });

    expect(order).toEqual(["pick", "picked"]);
    expect(result.runOnPicked).toBe(true);
  });

  test("preserves the exact prompt (no trim, no submit) so the composer stays editable", () => {
    const picks: string[] = [];
    const raw = "  设定规则：每天掉一点灵气  ";
    resolvePickActions(raw, {
      onPick: (p) => {
        picks.push(p);
      },
    });

    // Verbatim prefill — the operator can edit before pressing send.
    expect(picks.at(-1)).toBe(raw);
  });
});
