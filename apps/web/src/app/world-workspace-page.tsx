import { MessengerShell } from "@/components/messenger/messenger-shell.tsx";
import type { RealmAppController } from "./types.ts";

export function WorldWorkspacePage({
  app,
  onCreateWorld,
  onNewDm,
  onNewGroup,
  onOpenGod,
  onOpenWorldInspector,
  onOpenCommandPalette,
  onInspectRole,
  onOpenSettings,
}: {
  app: RealmAppController;
  onCreateWorld: () => void;
  onNewDm: () => void;
  onNewGroup: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onOpenCommandPalette: () => void;
  onInspectRole: (roleId: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <MessengerShell
      app={app}
      onCreateWorld={onCreateWorld}
      onInspectRole={onInspectRole}
      onNewDm={onNewDm}
      onNewGroup={onNewGroup}
      onOpenCommandPalette={onOpenCommandPalette}
      onOpenGod={onOpenGod}
      onOpenSettings={onOpenSettings}
      onOpenWorldInspector={onOpenWorldInspector}
    />
  );
}
