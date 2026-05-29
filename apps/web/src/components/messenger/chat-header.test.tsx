import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ChatHeader } from "./chat-header.tsx";
import { MessengerMessage } from "./messenger-message.tsx";

const role: RoleSummary = {
  displayName: "Lei Jun",
  id: "leijun",
  model: "default",
  source: "config",
};
const room: Room = {
  id: "main",
  memberIds: ["owner", "leijun"],
  name: "All Hands",
  type: "world-main",
  worldId: "cultivation",
};
const world: WorldSummary = {
  defaultRoomId: "main",
  id: "cultivation",
  mode: { time: { kind: "tick" }, type: "simulation" },
  name: "Cultivation Sim",
  roleIds: ["leijun"],
};

function headerApp(viewerIdentity: string): RealmAppController {
  return {
    selectedRoom: room,
    selectedWorld: world,
    state: { projectName: "Realm Project", roles: [role] },
    turnRun: { status: "idle" },
    viewerIdentity,
  } as unknown as RealmAppController;
}

describe("rebuilt chat header", () => {
  test("renders the operator context without any fake device status bar", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={headerApp("owner")}
          onBackToList={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenInspector={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="chat-header"');
    expect(html).toContain('data-testid="workspace-context-line"');
    expect(html).toContain("Realm Project");
    // No simulated phone chrome anywhere in the rebuilt shell.
    expect(html).not.toContain('data-testid="wechat-status-bar"');
    expect(html).not.toContain("93%");
  });

  test("keeps the trailing bar calm: one details control + overflow, no standalone command icon, no duplicate identity token", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={headerApp("leijun")}
          onBackToList={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenInspector={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    // The Details/Inspector control stays; the standalone command-palette icon
    // is folded into the overflow menu (it lives on ⌘K + the Manager hint).
    // The overflow content is a Radix portal absent from closed static markup,
    // so we only assert the always-rendered bar here.
    expect(html).toContain('data-testid="chat-open-inspector"');
    expect(html).toContain('data-testid="topbar-more"');
    expect(html).not.toContain('data-testid="chat-command-palette"');
    // Identity is authoritative on the composer Send label, never duplicated here.
    expect(html).not.toContain('data-testid="context-identity"');
  });
});

describe("message alignment follows the viewer account", () => {
  const message: Message = {
    authorId: "leijun",
    content: "Breaking through.",
    createdAt: "2026-05-28T00:00:00.000Z",
    displayedAuthorId: "leijun",
    id: "m1",
    roomId: "main",
    worldId: "cultivation",
  };

  test("a role's own message is right-aligned when viewing that role account", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage
          message={message}
          roles={[role]}
          room={room}
          showTimestamp={false}
          viewerIdentity="leijun"
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-author="user"');
    expect(html).toContain("justify-end");
  });

  test("the same message is left-aligned from the owner's perspective", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerMessage
          message={message}
          roles={[role]}
          room={room}
          showTimestamp={false}
          viewerIdentity="owner"
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-author="assistant"');
    expect(html).toContain("justify-start");
  });
});
