import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptInput } from "./prompt-input.tsx";

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
});
