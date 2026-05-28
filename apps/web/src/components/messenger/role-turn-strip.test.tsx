import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { formatElapsedSeconds, RoleTurnStrip } from "./role-turn-strip.tsx";

describe("role turn strip", () => {
  test("formats elapsed runtime for visible role-turn feedback", () => {
    expect(formatElapsedSeconds("2026-05-28T00:00:00.000Z", Date.UTC(2026, 4, 28, 0, 1, 5))).toBe(
      "1:05",
    );
    expect(formatElapsedSeconds(undefined)).toBe("0:00");
    expect(formatElapsedSeconds("bad-date")).toBe("0:00");
  });

  test("renders retry and error context after a failed role turn", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnStrip
          app={mockApp({
            error: "provider rejected request",
            status: "error",
          })}
          onOpenGod={() => undefined}
          onOpenSettings={() => undefined}
        />
      </I18nProvider>,
    );

    expect(html).toContain('data-testid="role-turn-strip"');
    expect(html).toContain("Role run needs attention");
    expect(html).toContain("provider rejected request");
    expect(html).toContain('data-testid="role-turn-retry"');
    expect(html).toContain('data-testid="topbar-settings"');
    expect(html).toContain('data-testid="topbar-god"');
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
    cancelActiveTurn: async () => undefined,
    clearTurnError: () => undefined,
    runSelectedRoleTurn: async () => undefined,
    runRoleId: role.id,
    selectedRole: role,
    selectedRoom: room,
    selectedWorld: world,
    state: {
      conversationMessages: [],
      events: [],
      messages: [],
      projectName: "Realm",
      roles: [role],
      rooms: [room],
      status: "ready",
      worlds: [world],
    },
    turnRun,
  } as unknown as RealmAppController;
}
