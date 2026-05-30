import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorMessage } from "./operator-message.tsx";

describe("OperatorMessage", () => {
  test("operator variant right-aligns and uses the green outgoing bubble", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage text="创建一个修真世界" variant="operator" />,
    );

    expect(html).toContain('data-variant="operator"');
    expect(html).toContain("justify-end");
    expect(html).toContain("var(--realm-bubble-outgoing)");
    expect(html).toContain("创建一个修真世界");
    // Operator bubbles stay a capped chat affordance even if a child were present.
    expect(html).toContain("max-w-[82%]");
    expect(html).toContain("md:max-w-[68%]");
  });

  test("system variant left-aligns with a neutral surface bubble", () => {
    const html = renderToStaticMarkup(<OperatorMessage text="世界已创建" variant="system" />);

    expect(html).toContain('data-variant="system"');
    expect(html).toContain("justify-start");
    expect(html).toContain("var(--realm-surface-muted)");
    expect(html).not.toContain("var(--realm-bubble-outgoing)");
  });

  test("plain system text turn (no card) widens toward the column edge", () => {
    const html = renderToStaticMarkup(<OperatorMessage text="世界已创建" variant="system" />);

    // A God answer is meant to be READ: it widens to fill the centered column
    // instead of leaving a ~32% blank right gutter. Below lg it stops short of
    // full bleed (max-w-[92%]/md:max-w-[88%]); from lg (>=1024px) up the wide
    // desktop gutter is large enough that an 88% cap reads left-weighted, so it
    // reaches the column edge to stay balanced with the full-width cards beneath.
    expect(html).toContain("max-w-[92%]");
    expect(html).toContain("md:max-w-[88%]");
    expect(html).toContain("lg:max-w-full");
    // Still tighter than the operator's right-aligned chat affordance.
    expect(html).not.toContain("md:max-w-[68%]");
    // The card full-bleed (`w-full max-w-full`) is reserved for card turns; a
    // plain text answer only reaches the edge via the `lg:` prefix, never bare.
    expect(html).not.toContain("w-full max-w-full");
  });

  test("card-bearing system turn drops the 68% cap for the full reading measure", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage text="现在世界什么状态？" variant="system">
        <div data-testid="inspect-card">状态树</div>
      </OperatorMessage>,
    );

    // The inner wrapper fills the centered reading column instead of ~half of it.
    expect(html).toContain("w-full max-w-full");
    expect(html).not.toContain("md:max-w-[68%]");
  });

  test("card-only system turn (no text) also uses the full reading measure", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage variant="system">
        <div data-testid="inspect-card">仅状态卡</div>
      </OperatorMessage>,
    );

    expect(html).toContain("w-full max-w-full");
    expect(html).not.toContain("md:max-w-[68%]");
  });

  test("operator turn that carries a card stays capped (cards are a God affordance)", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage text="改一下规则" variant="operator">
        <div data-testid="operator-child">附带内容</div>
      </OperatorMessage>,
    );

    // Full-width is system-card-only; operator turns never lose the bubble cap.
    expect(html).toContain("max-w-[82%]");
    expect(html).toContain("md:max-w-[68%]");
    expect(html).not.toContain("max-w-full");
  });

  test("operator and system non-card caps stay intentionally asymmetric", () => {
    const operatorHtml = renderToStaticMarkup(
      <OperatorMessage text="改一下规则" variant="operator" />,
    );
    const systemHtml = renderToStaticMarkup(<OperatorMessage text="规则已更新" variant="system" />);

    // Operator (human) bubbles stay tight and right-aligned across every
    // breakpoint; the wider system caps never bleed into them.
    expect(operatorHtml).toContain("md:max-w-[68%]");
    expect(operatorHtml).not.toContain("md:max-w-[88%]");
    expect(operatorHtml).not.toContain("lg:max-w-full");

    // System (God) answers widen to fill the column, reaching the column edge
    // from lg up so the wide-desktop right gutter no longer reads lopsided.
    expect(systemHtml).toContain("md:max-w-[88%]");
    expect(systemHtml).toContain("lg:max-w-full");
    expect(systemHtml).not.toContain("md:max-w-[68%]");
  });

  test("only new turns get the bubble-in entrance class", () => {
    const stale = renderToStaticMarkup(<OperatorMessage text="历史消息" variant="system" />);
    expect(stale).not.toContain("realm-bubble-in");

    const fresh = renderToStaticMarkup(<OperatorMessage isNew text="新消息" variant="system" />);
    expect(fresh).toContain("realm-bubble-in");
    expect(fresh).toContain("realm-bubble-in-in");
  });

  test("renders an inline card child slot beneath the text", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage text="确认补丁" variant="system">
        <div data-testid="inline-card">补丁预览</div>
      </OperatorMessage>,
    );

    expect(html).toContain('data-testid="inline-card"');
    expect(html).toContain("补丁预览");
  });

  test("can render a card-only system turn with no text bubble", () => {
    const html = renderToStaticMarkup(
      <OperatorMessage variant="system">
        <div data-testid="inline-card">仅卡片</div>
      </OperatorMessage>,
    );

    expect(html).toContain('data-testid="inline-card"');
    // No text bubble surface should be emitted when text is absent.
    expect(html).not.toContain("whitespace-pre-wrap");
  });
});
