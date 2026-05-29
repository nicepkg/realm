import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { AssistantConfigSheet } from "./assistant-config-sheet.tsx";
import type {
  AppliedConfigPatch,
  ConfigActionSheetKind,
  PatchAppliedHandler,
  RoomType,
} from "./config-action-types.ts";
import { ConfigRollbackNotice } from "./config-rollback-notice.tsx";
import { CreateRoomSheet } from "./create-room-sheet.tsx";
import { CreateWorldSheet } from "./create-world-sheet.tsx";

type ConfigActionSheetsProps = {
  app: RealmAppController;
  onWorldCreated?: (worldId: string) => void;
  /** Preset for the room-creation sheet (新建私聊 → dm, 发起群聊 → group). */
  initialRoomType?: RoomType;
  /** Tab the create-world sheet opens on (Create World → preset, Import → import). */
  createWorldTab?: "import" | "preset";
  open: ConfigActionSheetKind | undefined;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
};

export function ConfigActionSheets({
  app,
  createWorldTab,
  initialRoomType = "group",
  onOpenChange,
  onWorldCreated,
  open,
}: ConfigActionSheetsProps) {
  const [lastAppliedPatch, setLastAppliedPatch] = useState<AppliedConfigPatch | undefined>();

  const handlePatchApplied: PatchAppliedHandler = (proposal, result) => {
    setLastAppliedPatch({
      ...result,
      summary: proposal.summary,
      title: proposal.title,
    });
  };

  async function rollbackLastPatch(historyId: string) {
    const result = await app.client.rollbackConfig(historyId);
    await app.reload();
    return result;
  }

  return (
    <>
      <CreateWorldSheet
        app={app}
        initialTab={createWorldTab}
        open={open === "create-world"}
        onOpenChange={onOpenChange}
        onPatchApplied={handlePatchApplied}
        onWorldCreated={onWorldCreated}
      />
      <AssistantConfigSheet
        app={app}
        open={open === "assistant-config"}
        onOpenChange={onOpenChange}
        onPatchApplied={handlePatchApplied}
      />
      <CreateRoomSheet
        app={app}
        initialType={initialRoomType}
        open={open === "create-room"}
        onOpenChange={onOpenChange}
      />
      <ConfigRollbackNotice
        patch={lastAppliedPatch}
        onDismiss={() => setLastAppliedPatch(undefined)}
        onRollback={rollbackLastPatch}
      />
    </>
  );
}

export type { ConfigActionSheetKind } from "./config-action-types.ts";
