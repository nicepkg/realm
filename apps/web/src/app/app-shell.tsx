import { MessageCircleIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ConfigActionSheetKind } from "@/components/sheets/config-action-sheets.tsx";
import type { RoomType } from "@/components/sheets/config-action-types.ts";
import { type WorkspaceSheetKind, WorkspaceSheets } from "@/components/sheets/workspace-sheets.tsx";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { withViewTransition } from "@/lib/view-transition.ts";
import { useGodChat } from "@/state/use-god-chat.ts";
import { useRealmAppState } from "@/state/use-realm-app-state.ts";
import { GodChatShell } from "./god-chat-shell.tsx";

/**
 * Code-splitting boundary (nl-first-vision F3): only the chat home — GodChatShell
 * and its god-chat state — must live in the initial synchronous chunk so the home
 * screen renders instantly on first load. Every surface below is a demoted
 * "高级 / 命令面板 / 设置 / 精细调整" control reached ONLY via an explicit gesture,
 * never the chat timeline/composer, so each is split into its own lazily-loaded
 * chunk via React.lazy + dynamic import(). Splitting the two advanced pages also
 * pulls the entire legacy messenger graph (message-timeline / composer /
 * role-turn-action) out of the entry bundle, since the chat home never imports it.
 */
const WorldManagerPage = lazy(() =>
  import("./world-manager-page.tsx").then((m) => ({ default: m.WorldManagerPage })),
);
const WorldWorkspacePage = lazy(() =>
  import("./world-workspace-page.tsx").then((m) => ({ default: m.WorldWorkspacePage })),
);
const RealmCommandPalette = lazy(() =>
  import("@/components/command/realm-command-palette.tsx").then((m) => ({
    default: m.RealmCommandPalette,
  })),
);
const ConfigActionSheets = lazy(() =>
  import("@/components/sheets/config-action-sheets.tsx").then((m) => ({
    default: m.ConfigActionSheets,
  })),
);
const RunTurnPreviewDialog = lazy(() =>
  import("@/components/messenger/role-turn-action.tsx").then((m) => ({
    default: m.RunTurnPreviewDialog,
  })),
);

/**
 * Full-bleed Apple-flat lazy fallback for the advanced PAGE route (manager /
 * workspace). It reuses the shared `realm-skeleton` shimmer — never a spinner —
 * so the brief moment between leaving chat and the page chunk arriving reads as a
 * quiet wash, not a flash. Only ever seen on first navigation to that surface.
 */
function AdvancedPageFallback() {
  return (
    <div
      aria-hidden
      className="realm-skeleton fixed inset-0 z-0"
      data-testid="advanced-page-fallback"
    />
  );
}

/**
 * Apple-flat fallback for an OVERLAY chunk (config sheets / command palette). It is
 * a quiet centered skeleton card over a dim scrim, matching the shared
 * `realm-skeleton` shimmer — seen only for the brief first-open of a control before
 * its chunk lands, then replaced by the real overlay (never a spinner-flash).
 */
function OverlayChunkFallback() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50 grid place-items-center bg-black/20"
      data-testid="overlay-chunk-fallback"
    >
      <div className="realm-skeleton h-40 w-full max-w-md rounded-2xl" />
    </div>
  );
}

// The config sheets dock to the right edge like the workspace sheets; reuse the
// overlay scrim wash so the first-open transition reads consistently.
const ConfigSheetFallback = OverlayChunkFallback;

/**
 * AppShell owns ALL routing / mode state for the web app and nothing else: it
 * threads the single shared `useRealmAppState()` controller into whichever
 * surface is mounted and keeps the overlays (command palette, run-turn preview,
 * config + workspace sheets) at the top level so they survive surface swaps.
 *
 * Per the natural-language-first vision (nl-first-vision.md), the home surface
 * is the GodChatShell — one chat window where the operator talks to "天道" to
 * create worlds, set rules, control roles, run turns, adjudicate, and inspect.
 * The legacy control-heavy messenger / world-manager is NOT deleted (its backend
 * wiring is real and reused) but is NO LONGER one tap away: the chat shell's 高级
 * button now opens a minimal inline context sheet, NOT these pages. The pages stay
 * reachable only for power users through the command palette (an explicit,
 * non-default route). Conversation is the rule; controls are the rare exception.
 */
type AppMode = "chat" | "manager" | "workspace";

/** zh-CN default for the app-shell-owned "return to chat" affordance. Kept local
 * (not in the i18n dict) to match GodChatShell's self-contained string pattern. */
const BACK_TO_CHAT_LABEL = "返回对话";

export function AppShell() {
  const app = useRealmAppState();
  // The god-chat controller is owned HERE, not inside GodChatShell, so the
  // conversation (turns, pending proposal, streaming run-turn) outlives a swap
  // to the advanced manager/workspace surface (F7). GodChatShell unmounts while
  // the operator inspects "高级"; if it also held the chat state, "返回对话" would
  // land on an empty timeline. Lifting it keeps the hook mounted across every
  // mode, so its live SSE / role-message effects also keep folding results in
  // even while the chat window is not on screen.
  const chat = useGodChat(app);
  // Chat is the home surface (nl-first-vision); manager/workspace are the
  // demoted advanced route reached via the chat shell's 高级 button.
  const [mode, setMode] = useState<AppMode>("chat");
  const [commandOpen, setCommandOpen] = useState(false);
  // The run-turn preview is owned here, ABOVE the command palette: the palette
  // unmounts while closed, so a preview owned inside it would be destroyed
  // before it could render. Keeping it at the shell lets the palette's gated
  // Run-Role action close the palette and still surface a single focused
  // confirmation (MC3-1 + Don Norman: error prevention).
  const [runPreviewOpen, setRunPreviewOpen] = useState(false);
  const [actionSheet, setActionSheet] = useState<ConfigActionSheetKind | undefined>();
  const [workspaceSheet, setWorkspaceSheet] = useState<WorkspaceSheetKind | undefined>();
  const [inspectedRoleId, setInspectedRoleId] = useState<string | undefined>();
  const [roomTypePreset, setRoomTypePreset] = useState<RoomType>("group");
  const [createWorldTab, setCreateWorldTab] = useState<"import" | "preset">("preset");

  // Open the create-world sheet on the tab the caller intends. Preset (default)
  // and Import land on distinct tabs so the two Manager buttons map 1:1 to a
  // distinct outcome rather than the same sheet under two labels.
  const openCreateWorld = (tab: "import" | "preset" = "preset") => {
    setCreateWorldTab(tab);
    setActionSheet("create-world");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const enterWorkspace = (worldId?: string) => {
    if (worldId && worldId !== app.selectedWorld?.id) {
      void app.selectWorld(worldId);
    }
    withViewTransition(() => setMode("workspace"));
  };

  const backToManager = () => withViewTransition(() => setMode("manager"));

  // Return to the natural-language home from anywhere in the advanced route.
  const backToChat = () => withViewTransition(() => setMode("chat"));

  const openWorkspaceSheet = (sheet: WorkspaceSheetKind) => {
    enterWorkspace(app.selectedWorld?.id);
    setWorkspaceSheet(sheet);
  };

  const openCreateRoom = (type: RoomType) => {
    enterWorkspace(app.selectedWorld?.id);
    setRoomTypePreset(type);
    setActionSheet("create-room");
  };

  const inspectRole = (roleId: string) => {
    app.setRunRoleId(roleId);
    app.setActiveSection("roles");
    setInspectedRoleId(roleId);
    openWorkspaceSheet("role-inspector");
  };

  // The command palette models only the two advanced surfaces; while on the chat
  // home it has no surface-specific commands, so present it as the manager.
  const paletteMode = mode === "workspace" ? "workspace" : "manager";
  const isAdvanced = mode !== "chat";

  // Keep the lazy ConfigActionSheets wrapper mounted once its first sheet has been
  // requested, so it can animate the sheet CLOSED and keep showing the post-apply
  // rollback toast (both owned inside it) after `actionSheet` clears. Ref-derived so
  // it latches true permanently without an extra render; read in the same render's
  // JSX below.
  const configSheetsTouchedRef = useRef(false);
  if (actionSheet) {
    configSheetsTouchedRef.current = true;
  }
  const configSheetsTouched = configSheetsTouchedRef.current;

  // Same latch for the lazy run-turn preview: fetch its chunk on first open, then
  // keep it mountable so Radix can animate it closed.
  const runPreviewTouchedRef = useRef(false);
  if (runPreviewOpen) {
    runPreviewTouchedRef.current = true;
  }
  const runPreviewTouched = runPreviewTouchedRef.current;

  return (
    <TooltipProvider>
      <div className="realm-mode-root">
        {mode === "chat" ? (
          <GodChatShell
            app={app}
            chat={chat}
            // The 高级 sheet's two precise-tweak edges. Both open AppShell-owned
            // overlays OVER the chat home; neither swaps to the legacy pages.
            // The command palette is the gated, explicit route to manager/workspace
            // for power users; settings opens directly over chat (no surface swap).
            onOpenCommandPalette={() => setCommandOpen(true)}
            onOpenSettings={() => setWorkspaceSheet("settings")}
          />
        ) : (
          // The advanced page route is lazy: one Suspense boundary covers both the
          // manager and workspace chunks (and the messenger graph they pull in),
          // so the chat home never ships their JS.
          <Suspense fallback={<AdvancedPageFallback />}>
            {mode === "manager" ? (
              <WorldManagerPage
                app={app}
                onAskAssistant={() => setActionSheet("assistant-config")}
                onCreateWorld={openCreateWorld}
                onEnterWorld={async (worldId) => {
                  await app.selectWorld(worldId);
                  enterWorkspace(worldId);
                }}
                onOpenCommandPalette={() => setCommandOpen(true)}
                onOpenSettings={() => setWorkspaceSheet("settings")}
              />
            ) : (
              <WorldWorkspacePage
                app={app}
                onCreateWorld={() => openCreateWorld()}
                onInspectRole={inspectRole}
                onNewDm={() => openCreateRoom("dm")}
                onNewGroup={() => openCreateRoom("group")}
                onOpenCommandPalette={() => setCommandOpen(true)}
                onOpenGod={() => setWorkspaceSheet("god")}
                onOpenSettings={() => setWorkspaceSheet("settings")}
                onOpenWorldInspector={() => setWorkspaceSheet("world-inspector")}
              />
            )}
          </Suspense>
        )}
      </div>
      {/*
       * The chat home is the center of gravity, so the demoted advanced route
       * keeps a single quiet, app-shell-owned way back to it. Manager/workspace
       * are owned files we don't edit, so the affordance lives here rather than
       * inside them. Hidden on the chat surface itself.
       */}
      {isAdvanced ? (
        <Button
          className="realm-press fixed top-3 right-3 z-50 h-9 gap-1.5 rounded-full px-3.5 text-[13px] shadow-sm pt-[env(safe-area-inset-top)]"
          data-testid="back-to-chat"
          onClick={backToChat}
          size="sm"
          variant="secondary"
        >
          <MessageCircleIcon className="size-3.5" />
          {BACK_TO_CHAT_LABEL}
        </Button>
      ) : null}
      {/*
       * The create/import/assistant/patch-preview config sheets lazy-load on first
       * use, then stay mounted (`configSheetsTouched`) so two behaviours survive a
       * close: Radix can animate the sheet OUT on `open`, and the post-apply rollback
       * toast (owned inside ConfigActionSheets) lingers after `actionSheet` clears.
       * Until first use their chunk is never fetched, so the chat home pays nothing.
       */}
      {configSheetsTouched ? (
        <Suspense fallback={<ConfigSheetFallback />}>
          <ConfigActionSheets
            app={app}
            createWorldTab={createWorldTab}
            initialRoomType={roomTypePreset}
            open={actionSheet}
            onOpenChange={setActionSheet}
            onWorldCreated={() => withViewTransition(() => setMode("workspace"))}
          />
        </Suspense>
      ) : null}
      <WorkspaceSheets
        app={app}
        roleId={inspectedRoleId}
        open={workspaceSheet}
        onOpenChange={setWorkspaceSheet}
        // The inspector's gated "Run Turn" stages the role, closes the sheet,
        // and hands off to the SAME shell-owned preview the command palette
        // uses, so the run-turn confirm cycle has exactly one implementation.
        onRequestRunTurn={() => setRunPreviewOpen(true)}
      />
      {/*
       * Mount the command palette only while open so its dialog content (and the
       * full command list) is absent from the accessibility tree / DOM snapshot
       * when closed, instead of relying on a hidden-but-present Radix portal.
       */}
      {commandOpen ? (
        <Suspense fallback={<OverlayChunkFallback />}>
          <RealmCommandPalette
            app={app}
            mode={paletteMode}
            open={commandOpen}
            onAskAssistant={() => setActionSheet("assistant-config")}
            onBackToWorlds={backToManager}
            onCreateRoom={() => {
              enterWorkspace(app.selectedWorld?.id);
              setActionSheet("create-room");
            }}
            onCreateWorld={() => openCreateWorld()}
            onEnterWorkspace={enterWorkspace}
            onOpenGod={() => openWorkspaceSheet("god")}
            onOpenWorldInspector={() => openWorkspaceSheet("world-inspector")}
            onOpenChange={setCommandOpen}
            onInspectRole={inspectRole}
            onOpenSettings={() => openWorkspaceSheet("settings")}
            onRequestRunTurn={() => setRunPreviewOpen(true)}
          />
        </Suspense>
      ) : null}
      {/*
       * The run-turn preview is a gated, rare confirmation: lazy-load its chunk only
       * once it has actually been opened (`runPreviewTouched`), then keep it mounted
       * so Radix animates it closed on `open`. A null Suspense fallback avoids a
       * scrim flash before the chunk lands (the dialog is invisible until `open`).
       */}
      {runPreviewTouched && app.selectedRole && app.selectedRoom && app.selectedWorld ? (
        <Suspense fallback={null}>
          <RunTurnPreviewDialog
            activeRole={app.selectedRole}
            activeRoom={app.selectedRoom}
            activeWorld={app.selectedWorld}
            app={app}
            onConfirm={() => void app.runSelectedRoleTurn()}
            onOpenChange={setRunPreviewOpen}
            open={runPreviewOpen}
          />
        </Suspense>
      ) : null}
    </TooltipProvider>
  );
}
