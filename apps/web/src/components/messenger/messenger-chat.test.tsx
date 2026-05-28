import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ChatHeader, MessengerTimeline } from "./messenger-chat.tsx";

describe("messenger chat header", () => {
  test("keeps project, world, room, identity, and running state visible", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={mockApp({ status: "idle" })}
          onBackToWorlds={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenRail={() => undefined}
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
          onOpenRail={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="context-running-state"');
    expect(html).toContain("Role is running");
  });

  test("exposes a mobile rail open button", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ChatHeader
          app={mockApp({ status: "idle" })}
          onBackToWorlds={() => undefined}
          onOpenCommandPalette={() => undefined}
          onOpenGod={() => undefined}
          onOpenRail={() => undefined}
          onOpenSettings={() => undefined}
          onOpenWorldInspector={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="chat-open-rail"');
  });
});

describe("messenger timeline send states", () => {
  test("renders a pending bubble and a failed bubble from the state layer", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerTimeline
          app={timelineApp({
            pendingMessages: [
              { pendingId: "p1", content: "queued draft", status: "pending" },
              { pendingId: "p2", content: "failed draft", status: "failed" },
            ],
          })}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="pending-message"');
    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-status="failed"');
    expect(html).toContain("queued draft");
  });

  test("renders an inline send error with retry when the state layer reports one", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerTimeline
          app={timelineApp({
            sendError: { message: "read-only project", draft: "kept draft" },
          })}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="send-error"');
    expect(html).toContain('data-testid="send-error-retry"');
    expect(html).toContain('role="alert"');
  });

  test("renders a God adjudication result as an in-timeline notice", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerTimeline app={timelineApp({ godActionResult: { status: "committed" } })} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="god-result-notice"');
  });

  test("renders a recoverable connection error with a reload action", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessengerTimeline app={timelineApp({ status: "error", error: "Failed to fetch" })} />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="connection-error"');
    expect(html).toContain('data-testid="connection-error-reload"');
    expect(html).toContain("Failed to fetch");
  });
});

function timelineApp(overrides: {
  pendingMessages?: Array<{ pendingId: string; content: string; status: "pending" | "failed" }>;
  sendError?: { message: string; draft: string };
  godActionResult?: unknown;
  status?: string;
  error?: string;
}): RealmAppController {
  return {
    state: {
      status: overrides.status ?? "ready",
      messages: [],
      roles: [],
      error: overrides.error,
    },
    selectedRoom: undefined,
    pendingMessages: overrides.pendingMessages ?? [],
    sendError: overrides.sendError,
    godActionResult: overrides.godActionResult,
    reload: () => undefined,
    retrySend: () => undefined,
    dismissSendError: () => undefined,
    sendErrorDetails: () => "{}",
  } as unknown as RealmAppController;
}

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
