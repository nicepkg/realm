import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary, Room } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import { MessengerMessage } from "./messenger-message.tsx";

describe("messenger message", () => {
  test("keeps room visibility metadata in the bubble action layer", () => {
    const roles: RoleSummary[] = [
      { displayName: "Lei Jun", id: "leijun", model: "default", source: "config" },
      { displayName: "Gu Chenfeng", id: "guchenfeng", model: "default", source: "config" },
    ];
    const room: Room = {
      id: "main",
      memberIds: [],
      name: "All Hands",
      type: "world-main",
      worldId: "cultivation",
    };
    const message: Message = {
      authorId: "owner",
      content: "Check visibility.",
      createdAt: "2026-05-28T00:00:00.000Z",
      displayedAuthorId: "owner",
      id: "message-1",
      roomId: "main",
      worldId: "cultivation",
    };

    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage message={message} roles={roles} room={room} showTimestamp={false} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="message-bubble-tools"');
    expect(html).toContain("focus-within:opacity-100");
    expect(html).toContain("focus-visible:outline-[#07c160]");
    expect(html).toContain('data-testid="message-visibility"');
    expect(html).toContain('data-testid="visibility-chips"');
    // zh-CN is the default locale after the rebuild, so the visibility label
    // renders in Chinese ("可见："). The structure under test is unchanged.
    expect(html).toContain("可见：");
    // The owner identity must localize to "老板" — never leak the raw English
    // default "Boss" into the zh-CN bubble.
    expect(html).toContain("老板");
    expect(html).not.toContain("Boss");
    expect(html).toContain("Lei Jun");
    expect(html).toContain("+1");
  });

  test("localizes the owner identity to 老板 instead of leaking the raw 'Boss' default", () => {
    const roles: RoleSummary[] = [
      { displayName: "Lei Jun", id: "leijun", model: "default", source: "config" },
    ];
    const room: Room = {
      id: "main",
      memberIds: ["owner", "leijun"],
      name: "All Hands",
      type: "group",
      worldId: "cultivation",
    };
    // An owner-authored message viewed by a role account: the owner is the
    // incoming author, so its name surfaces in the avatar label + sr-only line.
    const message: Message = {
      authorId: "owner",
      content: "Identity takeover audit.",
      createdAt: "2026-05-28T00:00:00.000Z",
      displayedAuthorId: "owner",
      id: "message-1",
      realOperatorId: "owner",
      roomId: "main",
      worldId: "cultivation",
    };

    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage
          message={message}
          roles={roles}
          room={room}
          showTimestamp={false}
          viewerIdentity="leijun"
        />
      </I18nProvider>,
    );

    // Avatar monogram + sr-only author line resolve to the localized label.
    expect(html).toContain("老板");
    // No raw English default and no raw protocol id leaks anywhere in the bubble.
    expect(html).not.toContain("Boss");
    expect(html).not.toContain("via owner");
    // The sr-only "via" line humanizes the operator id ("owner" -> "老板").
    expect(html).toContain("经由 老板");
  });

  test("renders an avatar for both incoming role messages and owner messages", () => {
    const roles: RoleSummary[] = [
      { displayName: "Lei Jun", id: "leijun", model: "default", source: "config" },
    ];
    const room: Room = {
      id: "main",
      memberIds: ["owner", "leijun"],
      name: "All Hands",
      type: "group",
      worldId: "cultivation",
    };
    const baseMessage = {
      content: "Avatar check.",
      createdAt: "2026-05-28T00:00:00.000Z",
      id: "message-1",
      roomId: "main",
      worldId: "cultivation",
    } satisfies Partial<Message>;
    const incomingMessage = {
      ...baseMessage,
      authorId: "leijun",
      displayedAuthorId: "leijun",
    } as Message;
    const outgoingMessage = {
      ...baseMessage,
      authorId: "owner",
      displayedAuthorId: "owner",
      id: "message-2",
    } as Message;

    const incomingHtml = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage
          message={incomingMessage}
          roles={roles}
          room={room}
          showTimestamp={false}
        />
      </I18nProvider>,
    );
    const outgoingHtml = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage
          message={outgoingMessage}
          roles={roles}
          room={room}
          showTimestamp={false}
        />
      </I18nProvider>,
    );

    expect(incomingHtml).toContain('data-testid="identity-avatar"');
    expect(incomingHtml).toContain("Lei Jun");
    expect(outgoingHtml).toContain('data-testid="identity-avatar"');
    expect(outgoingHtml).toContain('data-author="user"');
  });
});
