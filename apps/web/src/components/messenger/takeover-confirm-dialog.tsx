import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/index.tsx";
import { roomDisplayName } from "@/view-models/labels.ts";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";

/**
 * Single gated takeover-confirmation dialog (Don Norman: error prevention +
 * feedback). Identity takeover is an L2 dangerous action, so EVERY entry point
 * (account switcher, role inspector, command palette) routes through this one
 * component instead of hand-rolling its own confirm — guaranteeing identical
 * who / room / audit copy and that no surface can bypass the gate.
 *
 * Open state is derived from `pendingRoleId`: a defined role id shows the
 * dialog, `undefined` hides it. The caller owns that state so each surface can
 * cancel cleanly (Escape / backdrop / Cancel all funnel through `onCancel`).
 */
export function TakeoverConfirmDialog({
  app,
  pendingRoleId,
  onCancel,
  onConfirm,
}: {
  app: RealmAppController;
  /** Role id awaiting confirmation; `undefined` keeps the dialog closed. */
  pendingRoleId: string | undefined;
  onCancel: () => void;
  onConfirm: (roleId: string) => void;
}) {
  const { t } = useI18n();
  const pendingLabel = pendingRoleId
    ? displayNameForIdentity(pendingRoleId, app.state.roles)
    : undefined;
  // Where the impersonated message will actually land: the world + room the
  // takeover affects. Mirrors the persistent workspace context so the operator
  // confirms the destination, not just the masked author.
  const targetRoomName = app.selectedRoom ? roomDisplayName(t, app.selectedRoom) : undefined;
  const targetLabel = [app.selectedWorld?.name, targetRoomName].filter(Boolean).join(" / ");

  return (
    <Dialog open={Boolean(pendingRoleId)} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md" data-testid="takeover-confirm">
        <DialogHeader>
          <DialogTitle>{t("workspace.confirmTakeoverTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.confirmTakeoverBody")}</DialogDescription>
        </DialogHeader>
        {pendingLabel ? (
          <div className="flex flex-col gap-1.5 rounded-[8px] bg-[var(--realm-impersonate-soft)] px-3 py-2 text-[#7a4a00] text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("workspace.speakingAs")}</span>
              <span>{pendingLabel}</span>
            </div>
            {targetLabel ? (
              <div className="flex items-center gap-2" data-testid="takeover-confirm-target">
                <span className="font-medium">{t("workspace.confirmTakeoverTarget")}</span>
                <span>{targetLabel}</span>
              </div>
            ) : null}
            <p className="text-[12px] opacity-80" data-testid="takeover-confirm-audit">
              {t("workspace.confirmTakeoverAudit")}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          {/* Cancel is the safe default-focused action (Norman: recovery first). */}
          <Button autoFocus onClick={onCancel} type="button" variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            data-testid="takeover-confirm-apply"
            onClick={() => {
              if (pendingRoleId) {
                onConfirm(pendingRoleId);
              }
            }}
            type="button"
          >
            {t("workspace.confirmTakeoverConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
