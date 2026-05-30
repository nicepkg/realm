import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptInput } from "./prompt-input.tsx";

/**
 * Extract the FULL opening tag that carries `data-testid="<id>"`. React renders
 * attributes (className, data-slot, aria-*) in its own order, so a naive
 * "slice from data-testid to the next '>'" misses attributes emitted BEFORE the
 * testid. We walk back to the owning `<tag` and forward to its closing `>`,
 * skipping `&gt;` entities so a Tailwind `has-[>svg]` arbitrary class never ends
 * the tag early.
 */
function openingTagWithTestId(html: string, testId: string): string {
  const marker = html.indexOf(`data-testid="${testId}"`);
  if (marker === -1) {
    return "";
  }
  const start = html.lastIndexOf("<", marker);
  let i = marker;
  while (i < html.length) {
    if (html[i] === ">" && html.slice(i - 4, i) !== "&gt;") {
      break;
    }
    i += 1;
  }
  return html.slice(start, i + 1);
}

const baseProps = {
  value: "",
  onValueChange: () => undefined,
  onSubmit: () => undefined,
  placeholder: "和上帝对话…",
  sendLabel: "发送",
};

describe("PromptInput", () => {
  test("renders the localized placeholder and stable test ids", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} />);

    expect(html).toContain('data-testid="god-chat-input"');
    expect(html).toContain('data-testid="god-chat-send"');
    expect(html).toContain("和上帝对话…");
    expect(html).toContain('aria-label="发送"');
  });

  test("send is disabled when the value is empty (whitespace only)", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} value="   " />);

    // The send button must carry the disabled attribute when there is nothing to send.
    const sendChunk = html.slice(html.indexOf('data-testid="god-chat-send"'));
    expect(sendChunk).toContain("disabled");
  });

  test("send is enabled when there is non-empty trimmed text", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} value="创建一个修真世界" />);

    const sendStart = html.indexOf('data-testid="god-chat-send"');
    // Look only at the opening tag of the send button, not the whole document.
    const sendTag = html.slice(sendStart, html.indexOf(">", sendStart));
    expect(sendTag).not.toContain("disabled");
  });

  test("busy keeps the field editable but blocks send", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} busy value="跑一回合" />);

    const inputStart = html.indexOf('data-testid="god-chat-input"');
    const inputTag = html.slice(inputStart, html.indexOf(">", inputStart));
    expect(inputTag).not.toContain("disabled");

    const sendStart = html.indexOf('data-testid="god-chat-send"');
    const sendTag = html.slice(sendStart, html.indexOf(">", sendStart));
    expect(sendTag).toContain("disabled");
  });

  test("disabled locks the textarea", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} disabled value="任何文本" />);

    const inputStart = html.indexOf('data-testid="god-chat-input"');
    const inputTag = html.slice(inputStart, html.indexOf(">", inputStart));
    expect(inputTag).toContain("disabled");
  });

  test("busy marks the field aria-busy so AT knows a request is in flight", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} busy value="跑一回合" />);

    const inputTag = openingTagWithTestId(html, "god-chat-input");
    expect(inputTag).toContain('aria-busy="true"');
  });

  test("no error banner renders when errorText is absent", () => {
    const html = renderToStaticMarkup(<PromptInput {...baseProps} value="一句话" />);
    expect(html).not.toContain('data-testid="god-chat-error"');
  });

  test("a submit failure shows calm zh-CN recovery copy as a role=alert, draft preserved", () => {
    const draft = "创建一个修真世界";
    const html = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        errorText="网络好像断开了，消息还在，点重试就好。"
        onRetry={() => undefined}
        retryLabel="重试"
        value={draft}
      />,
    );

    // The alert announces the recovery copy once (no raw error string).
    const errorStart = html.indexOf('data-testid="god-chat-error"');
    expect(errorStart).toBeGreaterThan(-1);
    const errorTag = html.slice(errorStart, html.indexOf(">", errorStart));
    expect(errorTag).toContain('role="alert"');
    expect(html).toContain("网络好像断开了，消息还在，点重试就好。");

    // The draft the operator typed is still in the editable field (nothing lost).
    const inputStart = html.indexOf('data-testid="god-chat-input"');
    const inputBlock = html.slice(inputStart, inputStart + 600);
    expect(inputBlock).toContain(draft);
    // The field is editable: no standalone `disabled` boolean attribute (the
    // `disabled:` Tailwind variants in className are not the attribute).
    const inputTag = openingTagWithTestId(html, "god-chat-input");
    expect(/\sdisabled(=|\s|>)/.test(inputTag)).toBe(false);
  });

  test("retry affordance carries an accessible name and is keyboard-reachable", () => {
    const html = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        errorText="请求超时了，再试一次。"
        onRetry={() => undefined}
        retryLabel="重试"
        value="任何文本"
      />,
    );

    const retryTag = openingTagWithTestId(html, "god-chat-retry");
    expect(retryTag).not.toBe("");
    // Icon-only-safe: the control has an accessible name and is a real button
    // (tabbable), not a div, so keyboard + AT can reach and activate it.
    expect(retryTag).toContain('aria-label="重试"');
    expect(retryTag.startsWith("<button")).toBe(true);
  });

  test("an unrecoverable error shows copy only, with no retry button", () => {
    const html = renderToStaticMarkup(
      <PromptInput {...baseProps} errorText="这个世界名字和已有的冲突了。" value="任何文本" />,
    );
    expect(html).toContain('data-testid="god-chat-error"');
    // No onRetry → no retry control, but the draft + field stay intact.
    expect(html).not.toContain('data-testid="god-chat-retry"');
  });
});
