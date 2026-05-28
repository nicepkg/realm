import { useEffect, useState } from "react";
import { RealmCommandPalette } from "@/components/command/realm-command-palette.tsx";
import {
  type ConfigActionSheetKind,
  ConfigActionSheets,
} from "@/components/sheets/config-action-sheets.tsx";
import { WorkspaceSheets } from "@/components/sheets/workspace-sheets.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRealmAppState } from "@/state/use-realm-app-state.ts";
import { WorldManagerPage } from "./world-manager-page.tsx";
import { WorldWorkspacePage } from "./world-workspace-page.tsx";

type AppMode = "manager" | "workspace";
type WorkspaceSheetKind = "settings" | "god";

export function AppShell() {
  const app = useRealmAppState();
  const [mode, setMode] = useState<AppMode>("manager");
  const [commandOpen, setCommandOpen] = useState(false);
  const [actionSheet, setActionSheet] = useState<ConfigActionSheetKind | undefined>();
  const [workspaceSheet, setWorkspaceSheet] = useState<WorkspaceSheetKind | undefined>();

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
    setMode("workspace");
  };

  const openWorkspaceSheet = (sheet: WorkspaceSheetKind) => {
    enterWorkspace(app.selectedWorld?.id);
    setWorkspaceSheet(sheet);
  };

  return (
    <TooltipProvider>
      {mode === "manager" ? (
        <WorldManagerPage
          app={app}
          onAskAssistant={() => setActionSheet("assistant-config")}
          onCreateWorld={() => setActionSheet("create-world")}
          onEnterWorld={async (worldId) => {
            await app.selectWorld(worldId);
            setMode("workspace");
          }}
          onOpenSettings={() => setWorkspaceSheet("settings")}
        />
      ) : (
        <WorldWorkspacePage
          app={app}
          onBackToWorlds={() => setMode("manager")}
          onCreateRoom={() => setActionSheet("create-room")}
          onOpenGod={() => setWorkspaceSheet("god")}
          onOpenSettings={() => setWorkspaceSheet("settings")}
          onOpenCommandPalette={() => setCommandOpen(true)}
        />
      )}
      <ConfigActionSheets
        app={app}
        open={actionSheet}
        onOpenChange={setActionSheet}
        onWorldCreated={() => setMode("workspace")}
      />
      <WorkspaceSheets app={app} open={workspaceSheet} onOpenChange={setWorkspaceSheet} />
      <RealmCommandPalette
        app={app}
        mode={mode}
        open={commandOpen}
        onAskAssistant={() => setActionSheet("assistant-config")}
        onBackToWorlds={() => setMode("manager")}
        onCreateRoom={() => {
          enterWorkspace(app.selectedWorld?.id);
          setActionSheet("create-room");
        }}
        onCreateWorld={() => setActionSheet("create-world")}
        onEnterWorkspace={enterWorkspace}
        onOpenGod={() => openWorkspaceSheet("god")}
        onOpenChange={setCommandOpen}
        onOpenSettings={() => openWorkspaceSheet("settings")}
      />
    </TooltipProvider>
  );
}
