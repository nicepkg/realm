import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/index.tsx";
import type { GodRoleAction } from "@/state/use-realm-app-state.ts";
import { RoleInspectorSheet } from "./role-inspector-sheet.tsx";
import { SettingsSheet } from "./settings-sheet.tsx";
import { WorldInspectorSheet } from "./world-inspector-sheet.tsx";

export type WorkspaceSheetKind = "settings" | "god" | "role-inspector" | "world-inspector";

type WorkspaceSheetsProps = {
  app: RealmAppController;
  open: WorkspaceSheetKind | undefined;
  roleId?: string;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
};

export function WorkspaceSheets({ app, onOpenChange, open, roleId }: WorkspaceSheetsProps) {
  return (
    <>
      <SettingsSheet app={app} open={open === "settings"} onOpenChange={onOpenChange} />
      <GodSheet app={app} open={open === "god"} onOpenChange={onOpenChange} />
      <WorldInspectorSheet
        app={app}
        open={open === "world-inspector"}
        onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "world-inspector" : undefined)}
      />
      <RoleInspectorSheet
        app={app}
        roleId={roleId}
        open={open === "role-inspector"}
        onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "role-inspector" : undefined)}
      />
    </>
  );
}

function GodSheet({
  app,
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
}) {
  const { t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const targetRole = app.state.roles.find((role) => role.id === app.godActionRoleId);
  const canApply =
    !busy &&
    Boolean(app.selectedWorld && app.godActionRoleId && app.godActionReason.trim()) &&
    confirmation === app.godActionRoleId;

  async function applyAction() {
    if (!canApply) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await app.applyGodAction();
      setConfirmation("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "god" : undefined)}>
      <SheetContent className="w-[440px] max-w-[92vw] border-[var(--realm-line)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <SheetHeader>
          <SheetTitle>{t("sheet.god.title")}</SheetTitle>
          <SheetDescription>{t("sheet.god.description")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="rounded-lg bg-[#fff4e5] p-3 text-[#7a4a00] text-[12px]">
            <Badge className="mb-2 border-transparent bg-white text-[#9a5a00]">
              {t("sheet.god.risk")}
            </Badge>
            <div>
              {t("sheet.god.expectedVersion")}: v{app.state.worldState?.version ?? 0}
            </div>
          </div>
          <div className="block space-y-1">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">{t("sheet.god.type")}</span>
            <Select
              value={app.godAction}
              onValueChange={(value) => app.setGodAction(value as GodRoleAction)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mute">{t("sheet.god.action.mute")}</SelectItem>
                <SelectItem value="kill">{t("sheet.god.action.kill")}</SelectItem>
                <SelectItem value="revive">{t("sheet.god.action.revive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="block space-y-1">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">{t("sheet.god.role")}</span>
            <Select value={app.godActionRoleId} onValueChange={app.setGodActionRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {app.state.roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="sr-only" data-testid="god-action-target-role-id">
              {app.godActionRoleId}
            </span>
          </div>
          <label className="block space-y-1" htmlFor="god-action-reason">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">
              {t("sheet.god.reason")}
            </span>
            <Textarea
              id="god-action-reason"
              className="min-h-24"
              data-testid="god-action-reason"
              onChange={(event) => {
                setError(undefined);
                app.setGodActionReason(event.currentTarget.value);
              }}
              placeholder={t("sheet.god.placeholder")}
              value={app.godActionReason}
            />
          </label>
          <label className="block space-y-1" htmlFor="god-action-confirmation">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">
              {t("sheet.god.confirmLabel")}
            </span>
            <Input
              id="god-action-confirmation"
              data-testid="god-action-confirmation"
              onChange={(event) => {
                setError(undefined);
                setConfirmation(event.currentTarget.value);
              }}
              placeholder={`${t("sheet.god.confirmPlaceholder")}: ${targetRole?.id ?? "-"}`}
              value={confirmation}
            />
            <span className="block text-[11px] text-[var(--realm-fg-muted)]">
              {t("sheet.god.confirmHelp")}
            </span>
          </label>
          {error ? (
            <div
              className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
              data-testid="god-action-error"
            >
              <div className="font-medium">{t("sheet.god.failed")}</div>
              <div>{error}</div>
            </div>
          ) : null}
          {app.godActionResult ? (
            <div
              className="rounded-lg bg-[#f7f7f8] p-3 text-[12px]"
              data-testid="god-action-result"
            >
              <Badge className="mb-2 border-transparent bg-[#e6f7ee] text-[#087a43]">
                {app.godActionResult.status === "rejected"
                  ? app.godActionResult.status
                  : `state v${app.godActionResult.version}`}
              </Badge>
              <Input readOnly value={app.godActionResult.patchId} />
            </div>
          ) : null}
          <Button
            data-testid="god-action-apply"
            disabled={!canApply}
            onClick={() => void applyAction()}
            type="button"
          >
            {busy ? t("sheet.god.applying") : t("sheet.god.apply")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
