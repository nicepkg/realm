import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary, Room } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import { MessengerMessage } from "./messenger-message.tsx";

describe("messenger message", () => {
  test("renders visible room visibility metadata below chat bubbles", () => {
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

    expect(html).toContain('data-testid="message-visibility"');
    expect(html).toContain('data-testid="visibility-chips"');
    expect(html).toContain("Visible to:");
    expect(html).toContain("Boss");
    expect(html).toContain("Lei Jun");
    expect(html).toContain("+1");
  });
});
