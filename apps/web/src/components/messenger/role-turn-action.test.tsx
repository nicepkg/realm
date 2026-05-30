import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import {
  formatElapsedSeconds,
  RoleTurnActionGroup,
  RunTurnPreviewBody,
} from "./role-turn-action.tsx";

describe("role turn action", () => {
  test("formats elapsed runtime for role-turn feedback", () => {
    expect(formatElapsedSeconds("2026-05-28T00:00:00.000Z", Date.UTC(2026, 4, 28, 0, 1, 5))).toBe(
      "1:05",
    );
    expect(formatElapsedSeconds(undefined)).toBe("0:00");
    expect(formatElapsedSeconds("bad-date")).toBe("0:00");
  });

  test("renders retry and error context inside the WeChat plus tray action", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup
          app={mockApp({
            error: "provider rejected request",
            status: "error",
          })}
        />
      </I18nProvider>,
    );

    // zh-CN is the default locale after the rebuild.
    expect(html).toContain("角色运行需要处理");
    expect(html).toContain("provider rejected request");
    expect(html).toContain('data-testid="role-turn-retry"');
    expect(html).toContain('data-testid="role-turn-dismiss"');
    expect(html).not.toContain('data-testid="role-turn-strip"');
  });

  test("read-only disables the run control (MC-2)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup app={mockApp({ status: "idle" })} readOnly variant="row" />
      </I18nProvider>,
    );
    // The run affordance is rendered (discoverable) but disabled, not hidden.
    expect(html).toContain('data-testid="role-turn-run"');
    expect(html).toContain("disabled");
  });

  test("row variant surfaces a labelled, always-visible run control", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup app={mockApp({ status: "idle" })} variant="row" />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="role-turn-run"');
    // zh-CN run label names the bound role on the visible control (DISC-R7-5),
    // not buried behind an icon-only button or sr-only text.
    expect(html).toContain("运行 Lei Jun 的回合");
  });

  test("running turn shows an interruptible cancel control", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup app={mockApp({ status: "running", turnId: "t1" })} variant="row" />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="role-turn-cancel"');
  });

  test("cancel stays enabled with preparing micro-copy before a turnId arrives (EP-R7-6)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup app={mockApp({ status: "running" })} variant="row" />
      </I18nProvider>,
    );
    // No turnId yet: Cancel must NOT be a silent dead control — it stays enabled
    // and names the wait instead of greying out unexplained.
    expect(html).toContain('data-testid="role-turn-cancel"');
    expect(html).toContain("准备中…稍后即可取消");
    // The real disabled/aria-disabled attribute must be absent (the class string
    // contains "disabled:opacity-50" so we assert on the rendered attributes).
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain("disabled=");
  });

  test("a role that is not a member of the room cannot run and surfaces a reason (MC-R4-1)", () => {
    const app = mockApp({ status: "idle" });
    // Re-scope the room so it has a single non-leijun member: leijun is no longer
    // a member, so the run must be gated with a visible reason.
    app.selectedRoom = {
      id: "infirmary",
      memberIds: ["owner", "yunyao"],
      name: "Infirmary",
      type: "dm",
      worldId: "cultivation",
    } as RealmAppController["selectedRoom"];
    app.state.rooms = [app.selectedRoom as Room];
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleTurnActionGroup app={app} variant="row" />
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="role-turn-not-member"');
    expect(html).toContain("该角色不在当前房间");
    // The run control is rendered but disabled, never silently fired.
    expect(html).toContain('data-testid="role-turn-run"');
    expect(html).toContain("disabled");
  });
});

describe("run turn preview body", () => {
  function renderBody(runtime: { adapterKind: string } | undefined): string {
    const app = mockApp({ status: "idle" });
    const second: RoleSummary = {
      displayName: "Yun Yao",
      id: "yunyao",
      model: "default",
      source: "config",
    };
    const room: Room = {
      id: "main",
      memberIds: ["owner", "leijun", "yunyao"],
      name: "All Hands",
      type: "world-main",
      worldId: "cultivation",
    };
    app.selectedRoom = room;
    app.state.rooms = [room];
    app.state.roles = [app.state.roles[0] as RoleSummary, second];
    return renderToStaticMarkup(
      <I18nProvider>
        <RunTurnPreviewBody
          activeRole={{ displayName: "Lei Jun", model: "default" }}
          activeRoom={room}
          activeWorld={{ name: "Cultivation Sim" }}
          app={app}
          runtime={runtime}
        />
      </I18nProvider>,
    );
  }

  test("exposes the run-role chooser so a wrong target is fixable at the gate (DISC-R2-5)", () => {
    // The same multi-member chooser the composer uses is mounted in the gate, so
    // the operator can re-target WHO runs without cancelling + navigating away.
    // The radio options live in a closed Radix menu, so assert the trigger.
    expect(renderBody({ adapterKind: "fake" })).toContain('data-testid="composer-run-role-picker"');
  });

  test("surfaces the runtime row, naming the mock adapter explicitly (DISC-R2-5)", () => {
    const html = renderBody({ adapterKind: "fake" });
    expect(html).toContain('data-testid="run-turn-preview-runtime"');
    // zh-CN default: the fake adapter is named "模拟运行时" so a simulated reply
    // is never mistaken for a real provider one.
    expect(html).toContain("模拟运行时");
    expect(html).toContain("运行时");
  });

  test("names a real provider runtime as-is", () => {
    const html = renderBody({ adapterKind: "openai" });
    expect(html).toContain('data-testid="run-turn-preview-runtime"');
    expect(html).toContain("openai");
    expect(html).not.toContain("模拟运行时");
  });

  test("omits the runtime row until health resolves (no mislabel)", () => {
    const html = renderBody(undefined);
    expect(html).not.toContain('data-testid="run-turn-preview-runtime"');
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
    client: {
      getHealth: async () => ({ ok: true, runtime: { adapterKind: "fake" } }),
    },
    runSelectedRoleTurn: async () => undefined,
    runRoleId: role.id,
    selectedRole: role,
    selectedRoom: room,
    selectedWorld: world,
    setRunRoleId: () => undefined,
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
