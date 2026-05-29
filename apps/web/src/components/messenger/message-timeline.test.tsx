import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import type { TurnRunState } from "@/state/realm-app-state-model.ts";
import { MessageTimeline } from "./message-timeline.tsx";

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

function timelineApp(overrides: Partial<RealmAppController>): RealmAppController {
  return {
    cancelActiveTurn: async () => undefined,
    clearTurnError: () => undefined,
    // useProjectTrust only touches client inside effects/callbacks, which do not
    // run under static rendering — a stub keeps the type happy.
    client: { getEffectivePolicy: async () => ({ trustTier: "run-roles" }) },
    godActionResult: undefined,
    pendingMessages: [],
    runSelectedRoleTurn: async () => undefined,
    selectedRole: role,
    selectedRoom: room,
    selectedWorld: world,
    sendError: undefined,
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
    turnRun: { status: "idle" } satisfies TurnRunState,
    viewerIdentity: "owner",
    ...overrides,
  } as unknown as RealmAppController;
}

describe("message timeline run-turn feedback", () => {
  test("a running turn targeting this room paints a placeholder bubble (FB-1)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            turnRun: {
              roleId: "leijun",
              roomId: "main",
              startedAt: "2026-05-29T00:00:00.000Z",
              status: "running",
              turnId: "t1",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="turn-running-bubble"');
    expect(html).toContain('data-testid="turn-running-cancel"');
    expect(html).toContain("思考中");
  });

  test("live streamed tokens render in the running bubble, replacing the shimmer (FB-401)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            turnRun: {
              roleId: "leijun",
              roomId: "main",
              startedAt: "2026-05-29T00:00:00.000Z",
              status: "running",
              streamedText: "道友，这便是我的回答",
              turnId: "t1",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    // The live token text shows in place; the cancel + elapsed controls remain.
    expect(html).toContain('data-testid="turn-streamed-text"');
    expect(html).toContain("道友，这便是我的回答");
    expect(html).toContain('data-testid="turn-running-cancel"');
    // The pre-first-token shimmer is gone once real tokens are streaming.
    expect(html).not.toContain("思考中");
  });

  test("a turn running in a different room never bleeds into this timeline", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            turnRun: {
              roleId: "leijun",
              roomId: "other-room",
              startedAt: "2026-05-29T00:00:00.000Z",
              status: "running",
              turnId: "t1",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).not.toContain('data-testid="turn-running-bubble"');
  });

  test("a turn failure surfaces inline retry at the same position", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            turnRun: {
              error: "provider rejected request",
              roleId: "leijun",
              roomId: "main",
              status: "error",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="turn-error-bubble"');
    expect(html).toContain('data-testid="turn-error-retry"');
    expect(html).toContain("provider rejected request");
  });

  test("a god ruling from another world does not render here (FB-3)", () => {
    const committed = {
      status: "committed" as const,
      patchId: "patch-1",
      version: 3,
      state: {},
    };
    const shown = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            godActionResult: { result: committed, roomId: "main", worldId: "cultivation" },
          })}
        />
      </I18nProvider>,
    );
    expect(shown).toContain('data-testid="god-result-notice"');

    const hidden = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            godActionResult: { result: committed, roomId: "main", worldId: "another-world" },
          })}
        />
      </I18nProvider>,
    );
    expect(hidden).not.toContain('data-testid="god-result-notice"');
  });

  test("a committed ruling shows the green visible/audited treatment (FB-R3-1)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            godActionResult: {
              result: { status: "committed", patchId: "patch-1", version: 3, state: {} },
              roomId: "main",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-status="committed"');
    expect(html).toContain("已记录到世界审计日志。");
  });

  test("a duplicate ruling reports idempotency without a success/audit line (FB-R3-1)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            godActionResult: {
              result: { status: "duplicate", patchId: "patch-1", version: 3, state: {} },
              roomId: "main",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-status="duplicate"');
    expect(html).toContain("世界状态未发生变化");
    expect(html).not.toContain("已记录到世界审计日志。");
  });

  test("a rejected ruling shows amber failure + reason + recovery pointer (FB-R3-1)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline
          app={timelineApp({
            godActionResult: {
              result: {
                status: "rejected",
                patchId: "patch-1",
                reason: "version conflict",
                currentVersion: 4,
              },
              roomId: "main",
              worldId: "cultivation",
            },
          })}
        />
      </I18nProvider>,
    );
    expect(html).toContain('data-status="rejected"');
    expect(html).toContain("裁决未生效");
    expect(html).toContain("version conflict");
    expect(html).toContain("请回到上帝控制器");
    // Never a false success for a rejected ruling.
    expect(html).not.toContain("已记录到世界审计日志。");
  });

  test("an empty room offers the run-turn CTA naming the role (DISC-1)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MessageTimeline app={timelineApp({})} />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="empty-run-turn"');
    expect(html).toContain("Lei Jun");
  });
});
