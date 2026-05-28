import { DesktopMessenger } from "@/components/messenger/desktop-messenger.tsx";
import type { RealmAppController } from "./types.ts";

export function WorldWorkspacePage({
  app,
  onBackToWorlds,
  onCreateRoom,
  onOpenGod,
  onOpenCommandPalette,
  onOpenSettings,
}: {
  app: RealmAppController;
  onBackToWorlds: () => void;
  onCreateRoom: () => void;
  onOpenGod: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <DesktopMessenger
      app={app}
      onBackToWorlds={onBackToWorlds}
      onCreateRoom={onCreateRoom}
      onOpenGod={onOpenGod}
      onOpenCommandPalette={onOpenCommandPalette}
      onOpenSettings={onOpenSettings}
    />
  );
}
