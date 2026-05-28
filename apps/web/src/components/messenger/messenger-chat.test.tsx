import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ChatHeader } from "./messenger-chat.tsx";

describe("messenger chat header", () => {
  test("keeps project, world, room, identity, and running state visible", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={mockApp({ status: "idle" })}
          onBackToWorlds={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="chat-title"');
    expect(html).toContain("All Hands (2)");
    expect(html).toContain('data-testid="workspace-context-line"');
    expect(html).toContain("Realm Project");
    expect(html).toContain("Cultivation Sim");
    expect(html).toContain("Boss");
    expect(html).toContain("Ready");
  });

  test("renders a visible running-state label while a role turn is active", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={mockApp({ status: "running" })}
          onBackToWorlds={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="context-running-state"');
    expect(html).toContain("Role is running");
  });
});

function mockApp(turnRun: RealmAppController["turnRun"]): RealmAppController {
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

  return {
    identity: "owner",
    selectedRoom: room,
    selectedWorld: world,
    state: {
      projectName: "Realm Project",
      roles: [role],
    },
    turnRun,
  } as unknown as RealmAppController;
}
