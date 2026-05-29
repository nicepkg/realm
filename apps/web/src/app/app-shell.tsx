import { useEffect, useState } from "react";
import { RealmCommandPalette } from "@/components/command/realm-command-palette.tsx";
import { RunTurnPreviewDialog } from "@/components/messenger/role-turn-action.tsx";
import {
  type ConfigActionSheetKind,
  ConfigActionSheets,
} from "@/components/sheets/config-action-sheets.tsx";
import type { RoomType } from "@/components/sheets/config-action-types.ts";
import { type WorkspaceSheetKind, WorkspaceSheets } from "@/components/sheets/workspace-sheets.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { withViewTransition } from "@/lib/view-transition.ts";
import { useRealmAppState } from "@/state/use-realm-app-state.ts";
import { WorldManagerPage } from "./world-manager-page.tsx";
import { WorldWorkspacePage } from "./world-workspace-page.tsx";

type AppMode = "manager" | "workspace";

export function AppShell() {
  const app = useRealmAppState();
  const [mode, setMode] = useState<AppMode>("manager");
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

  return (
    <TooltipProvider>
      <div className="realm-mode-root">
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
      </div>
      <ConfigActionSheets
        app={app}
        createWorldTab={createWorldTab}
        initialRoomType={roomTypePreset}
        open={actionSheet}
        onOpenChange={setActionSheet}
        onWorldCreated={() => withViewTransition(() => setMode("workspace"))}
      />
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
        <RealmCommandPalette
          app={app}
          mode={mode}
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
      ) : null}
      {app.selectedRole && app.selectedRoom && app.selectedWorld ? (
        <RunTurnPreviewDialog
          activeRole={app.selectedRole}
          activeRoom={app.selectedRoom}
          activeWorld={app.selectedWorld}
          onConfirm={() => void app.runSelectedRoleTurn()}
          onOpenChange={setRunPreviewOpen}
          open={runPreviewOpen}
        />
      ) : null}
    </TooltipProvider>
  );
}
