import { describe, expect, test } from "bun:test";
import type { RoleSummary, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { GodEmptyState, GodSheetBody, godEmptyStateCopy } from "./god-sheet.tsx";

/**
 * GodSheetBody is rendered directly (not through the radix Sheet portal, which
 * does not mount under `renderToStaticMarkup`) — this mirrors how WorldInspector
 * tests render `WorldInspectorContent`. The body is what the open sheet shows, so
 * asserting on it proves the operator gets feedback when the sheet opens.
 */
function renderBody(app: RealmAppController): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <GodSheetBody app={app} open={true} />
    </I18nProvider>,
  );
}

const world: WorldSummary = {
  defaultRoomId: "main",
  id: "cultivation",
  mode: { time: { kind: "tick" }, type: "simulation" },
  name: "Cultivation Sim",
  roleIds: [],
};

const role: RoleSummary = {
  displayName: "Rival",
  id: "rival",
} as RoleSummary;

function mockApp(roles: RoleSummary[]): RealmAppController {
  return {
    applyGodAction: async () => true,
    godAction: "kill",
    godActionReason: "",
    godActionResult: undefined,
    godActionRoleId: roles[0]?.id ?? "",
    reload: async () => {},
    selectedRole: roles[0],
    selectedWorld: { ...world, roleIds: roles.map((r) => r.id) },
    setGodAction: () => {},
    setGodActionReason: () => {},
    setGodActionRoleId: () => {},
    state: {
      roles,
      status: "ready",
      worldState: { state: {}, version: 0 },
    },
  } as unknown as RealmAppController;
}

describe("GodSheet empty world", () => {
  test("shows the calm empty-state copy and NO ruling form for a 0-role world", () => {
    const html = renderBody(mockApp([]));

    // The sheet opens to an explicit empty-state — never a silent/blank panel.
    expect(html).toContain('data-testid="god-action-empty-world"');
    expect(html).toContain(godEmptyStateCopy["zh-CN"]);
    // zh-CN is the authoritative default; no English leak in the empty-state.
    expect(html).not.toContain("This world has no roles");

    // The dead form (which the operator could not act on) is absent: no action
    // picker, no role picker, no apply gate.
    expect(html).not.toContain('data-testid="god-action-type"');
    expect(html).not.toContain('data-testid="god-action-role-trigger"');
    expect(html).not.toContain('data-testid="god-action-apply"');
  });

  test("shows the normal ruling controls and NO empty-state when roles exist", () => {
    const html = renderBody(mockApp([role]));

    expect(html).not.toContain('data-testid="god-action-empty-world"');
    expect(html).not.toContain(godEmptyStateCopy["zh-CN"]);

    // The real adjudication form mounts: action type, role target, apply gate.
    expect(html).toContain('data-testid="god-action-type"');
    expect(html).toContain('data-testid="god-action-role-trigger"');
    expect(html).toContain('data-testid="god-action-apply"');
  });
});

describe("GodEmptyState", () => {
  test("renders the locale-specific copy verbatim", () => {
    const zh = renderToStaticMarkup(
      <I18nProvider>
        <GodEmptyState locale="zh-CN" />
      </I18nProvider>,
    );
    expect(zh).toContain(godEmptyStateCopy["zh-CN"]);

    const en = renderToStaticMarkup(
      <I18nProvider>
        <GodEmptyState locale="en" />
      </I18nProvider>,
    );
    expect(en).toContain(godEmptyStateCopy.en);
  });
});
