import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { AssistantConfigSheet } from "./assistant-config-sheet.tsx";
import type {
  AppliedConfigPatch,
  ConfigActionSheetKind,
  PatchAppliedHandler,
} from "./config-action-types.ts";
import { ConfigRollbackNotice } from "./config-rollback-notice.tsx";
import { CreateRoomSheet } from "./create-room-sheet.tsx";
import { CreateWorldSheet } from "./create-world-sheet.tsx";

type ConfigActionSheetsProps = {
  app: RealmAppController;
  onWorldCreated?: (worldId: string) => void;
  open: ConfigActionSheetKind | undefined;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
};

export function ConfigActionSheets({
  app,
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
      <CreateRoomSheet app={app} open={open === "create-room"} onOpenChange={onOpenChange} />
      <ConfigRollbackNotice
        patch={lastAppliedPatch}
        onDismiss={() => setLastAppliedPatch(undefined)}
        onRollback={rollbackLastPatch}
      />
    </>
  );
}

export type { ConfigActionSheetKind } from "./config-action-types.ts";
