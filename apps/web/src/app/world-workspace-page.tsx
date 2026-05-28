import { DesktopMessenger } from "@/components/messenger/desktop-messenger.tsx";
import type { RealmAppController } from "./types.ts";

export function WorldWorkspacePage({
  app,
  onBackToWorlds,
  onCreateRoom,
  onOpenGod,
  onOpenWorldInspector,
  onOpenCommandPalette,
  onInspectRole,
  onOpenSettings,
}: {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onCreateRoom: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenCommandPalette: () => void;
  onInspectRole: (roleId: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <DesktopMessenger
      app={app}
      onBackToWorlds={onBackToWorlds}
      onCreateRoom={onCreateRoom}
      onOpenGod={onOpenGod}
      onOpenWorldInspector={onOpenWorldInspector}
      onOpenCommandPalette={onOpenCommandPalette}
      onInspectRole={onInspectRole}
      onOpenSettings={onOpenSettings}
    />
  );
}
