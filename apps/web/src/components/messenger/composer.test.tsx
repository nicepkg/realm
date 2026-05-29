import { describe, expect, test } from "bun:test";
import type { Message, RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { Composer } from "./composer.tsx";

/**
 * The composer carries the STANDING run-turn affordance in a populated room
 * (DISC-R7-1). `renderToStaticMarkup` skips effects, so `useProjectTrust`
 * resolves to its non-read-only loading default — exactly the runnable path we
 * want to assert here.
 */
describe("composer run-turn affordance", () => {
  test("a populated, runnable room shows the named idle run control (DISC-R7-1 / DISC-R7-5)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={mockApp({ messages: [message("m1")] })} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="composer-run-turn"');
    expect(html).toContain('data-testid="role-turn-run"');
    // Names the resolved role on the visible control, not an icon-only button.
    expect(html).toContain("运行 Lei Jun 的回合");
  });

  test("an empty room hides the composer run control so it never doubles the empty CTA (item 5)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={mockApp({ messages: [] })} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    // The empty-room CTA lives in the timeline; the composer must stay clean.
    expect(html).not.toContain('data-testid="composer-run-turn"');
    expect(html).not.toContain('data-testid="role-turn-run"');
  });

  test("a non-member role names the constraint instead of hiding silently (DISC-R7-1)", () => {
    const app = mockApp({ messages: [message("m1")] });
    // Re-scope the room so leijun is no longer a member: the run is gated and the
    // reason is surfaced rather than the affordance vanishing.
    const room: Room = {
      id: "infirmary",
      memberIds: ["owner", "yunyao"],
      name: "Infirmary",
      type: "dm",
      worldId: "cultivation",
    };
    app.selectedRoom = room;
    app.state.rooms = [room];
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={app} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="composer-run-turn-block"');
    expect(html).toContain("该角色不在当前房间");
  });
});

/**
 * MC-R4-1: send-as-role obeys the SAME room-membership constraint as run-turn.
 * `renderToStaticMarkup` skips effects, so `useProjectTrust` resolves to its
 * non-read-only default — the runnable/sendable path we want to assert.
 */
describe("composer send-as-role membership gate", () => {
  test("impersonating a role NOT in the room blocks send + names the reason", () => {
    const app = mockApp({ messages: [message("m1")] });
    app.viewerIdentity = "leijun";
    app.draft = "hello";
    // Re-scope the room so leijun is no longer a member: a dm between owner+yunyao.
    const room: Room = {
      id: "infirmary",
      memberIds: ["owner", "yunyao"],
      name: "Infirmary",
      type: "dm",
      worldId: "cultivation",
    };
    app.selectedRoom = room;
    app.state.rooms = [room];
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={app} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    // Reason chip rendered next to a disabled Send button (canSend === false).
    expect(html).toContain('data-testid="composer-send-block"');
    expect(html).toContain("该角色不在当前房间");
    expect(html).toContain('data-testid="composer-send"');
    expect(html).toContain('disabled=""');
  });

  test("impersonating a role that IS in the room allows send (no block chip)", () => {
    const app = mockApp({ messages: [message("m1")] });
    app.viewerIdentity = "leijun";
    app.draft = "hello";
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={app} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    // leijun is a member of the world-main room → Send is enabled, no block chip.
    expect(html).not.toContain('data-testid="composer-send-block"');
    expect(html).toContain('data-testid="composer-send"');
  });

  test("owner identity is never gated by room membership", () => {
    const app = mockApp({ messages: [message("m1")] });
    app.draft = "hello";
    // A room the owner is technically not listed in still sends as owner.
    const room: Room = {
      id: "infirmary",
      memberIds: ["yunyao"],
      name: "Infirmary",
      type: "dm",
      worldId: "cultivation",
    };
    app.selectedRoom = room;
    app.state.rooms = [room];
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Composer app={app} onOpenGod={() => undefined} />
      </I18nProvider>,
    );
    expect(html).not.toContain('data-testid="composer-send-block"');
  });
});

function message(id: string): Message {
  return {
    authorId: "leijun",
    content: "hi",
    createdAt: "2026-05-29T00:00:00.000Z",
    id,
    roomId: "main",
    visibility: { kind: "room" },
    worldId: "cultivation",
  } as unknown as Message;
}

function mockApp(overrides: { messages: Message[] }): RealmAppController {
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
    client: {
      getEffectivePolicy: async () => ({ trustTier: "run-roles" }),
      setTrust: async () => ({ trustTier: "run-roles" }),
    },
    draft: "",
    runSelectedRoleTurn: async () => undefined,
    selectedRole: role,
    selectedRoom: room,
    selectedWorld: world,
    sendMessage: async () => undefined,
    setDraft: () => undefined,
    state: {
      events: [],
      messages: overrides.messages,
      projectName: "Realm",
      roles: [role],
      rooms: [room],
      status: "ready",
      worlds: [world],
    },
    turnRun: { status: "idle" },
    viewerIdentity: "owner",
  } as unknown as RealmAppController;
}
