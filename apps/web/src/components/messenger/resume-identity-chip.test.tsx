import { describe, expect, test } from "bun:test";
import type { RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ResumeIdentityChip } from "./resume-identity-chip.tsx";

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

function chipApp(overrides: Partial<RealmAppController>): RealmAppController {
  return {
    pendingResumeIdentity: undefined,
    resumeIdentity: () => undefined,
    selectedRoom: room,
    selectedWorld: world,
    state: { roles: [role] },
    viewerIdentity: "owner",
    ...overrides,
  } as unknown as RealmAppController;
}

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

describe("resume identity chip", () => {
  test("renders nothing when there is no stashed resume identity", () => {
    expect(render(<ResumeIdentityChip app={chipApp({})} />)).toBe("");
  });

  test("surfaces the stashed role with a green-accented resume action", () => {
    const html = render(<ResumeIdentityChip app={chipApp({ pendingResumeIdentity: "leijun" })} />);
    expect(html).toContain('data-testid="resume-identity-chip"');
    // The role is named via the shared resolver, not the raw id.
    expect(html).toContain("Lei Jun");
    expect(html).not.toContain("leijun 身份");
    // Resume verb is the single green accent; dismiss is muted.
    expect(html).toMatch(
      /class="[^"]*text-\[var\(--realm-green\)\][^"]*"\s+data-testid="resume-identity-confirm"/,
    );
    expect(html).toContain('data-testid="resume-identity-dismiss"');
  });

  test("the resume action routes through the gated takeover dialog, never a bare switch", async () => {
    // Radix's Dialog renders into a portal that static SSR markup never emits,
    // so the gate routing is asserted at the wiring level: Resume must go through
    // the shared TakeoverConfirmDialog + app.resumeIdentity() (itself gated) and
    // must NOT call app.setViewerIdentity directly (the silent-re-impersonation
    // path this item exists to kill).
    const source = await Bun.file(new URL("./resume-identity-chip.tsx", import.meta.url)).text();
    expect(source).toContain("TakeoverConfirmDialog");
    expect(source).toContain("app.resumeIdentity()");
    expect(source).not.toContain("setViewerIdentity");
  });

  test("renders the localized resume sentence under the zh-CN first-paint default", () => {
    // I18nProvider is Chinese-first: with no saved preference it paints zh-CN.
    const html = render(<ResumeIdentityChip app={chipApp({ pendingResumeIdentity: "leijun" })} />);
    expect(html).toContain("上次在此世界以 Lei Jun 身份操作");
    expect(html).toContain("恢复");
  });
});
