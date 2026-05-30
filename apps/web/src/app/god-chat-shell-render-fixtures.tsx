import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/i18n/index.tsx";
import type { UseGodChat } from "@/state/use-god-chat.ts";
import { GodChatShell } from "./god-chat-shell.tsx";

/**
 * Shared render fixtures for the GodChatShell test suites.
 *
 * The shell tests split across two files (the pure/wiring suite in
 * `god-chat-shell.test.tsx` and the empty-state/rail-scoping suite in
 * `god-chat-shell-empty-state.test.tsx`) to stay under the 500-line file-size
 * guard. Both suites need the same static-markup render harness, so the
 * controller fakes + `renderShell` live here as the single source of truth. This
 * is a fixtures module (no `*.test.*` segment), so the Bun test runner never
 * picks it up as a suite.
 */

/**
 * Build a minimal render-time controller fake. Effects (SDK reads) do not fire
 * under static markup, so the client methods are never invoked — but they must
 * exist so the render-time `app.client.*` references are defined.
 *
 * `overrides` lets a test inject world/role scope (selectedWorld + worlds + the
 * project-wide roles pool) so the world-scoping fed to the rail/sheet can be
 * asserted from the rendered markup.
 */
export function fakeApp(
  overrides: {
    selectedWorld?: { id: string; roleIds: string[]; mode?: { type: string } };
    worlds?: { id: string; name: string }[];
    roles?: { id: string; displayName: string }[];
    worldState?: { version: number; state: Record<string, unknown> };
  } = {},
) {
  return {
    client: {
      getHealth: async () => ({ runtime: { adapterKind: "fake" } }),
      getSettings: async () => ({ user: {} }),
    },
    selectedRoom: undefined,
    // A selected world needs a `mode.type` for the identity strip's mode label.
    selectedWorld: overrides.selectedWorld
      ? { mode: { type: "sandbox" }, ...overrides.selectedWorld }
      : undefined,
    state: {
      roles: overrides.roles ?? [],
      rooms: [],
      worldState: overrides.worldState,
      worlds: overrides.worlds ?? [],
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal cast fake controller for static render.
  } as any;
}

/**
 * A world with real substance: several state fields AND members. Used where a
 * test needs the rail to be in its NON-sparse, top-aligned state (the rail
 * self-centers a near-empty world, so an assertion that the rail reverts to
 * top-alignment must feed it a world the operator would read as "developed").
 */
export function substantialApp(overrides: Parameters<typeof fakeApp>[0] = {}) {
  return fakeApp({
    roles: [
      { displayName: "顾辰风", id: "gu-chenfeng" },
      { displayName: "云遥", id: "yun-yao" },
    ],
    selectedWorld: { id: "sect-world", roleIds: ["gu-chenfeng", "yun-yao"] },
    worlds: [{ id: "sect-world", name: "宗门世界" }],
    worldState: {
      state: { day: 12, qi: 80, rivals: ["a", "b"], sect: "天剑宗", weather: "灵雨" },
      version: 4,
    },
    ...overrides,
  });
}

export function fakeChat(turns: unknown[]): UseGodChat {
  return {
    busy: false,
    cancelProposal: () => {},
    confirmProposal: async () => {},
    draft: "",
    pendingProposal: undefined,
    setDraft: () => {},
    submit: async () => {},
    turns,
  } as unknown as UseGodChat;
}

export function renderShell(turns: unknown[], app = fakeApp()): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <GodChatShell
        app={app}
        chat={fakeChat(turns)}
        onOpenCommandPalette={() => {}}
        onOpenSettings={() => {}}
      />
    </I18nProvider>,
  );
}
