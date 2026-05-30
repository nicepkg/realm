import { AlertTriangle, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { useRef } from "react";
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
import type { useWorldManagerTrust } from "./use-world-manager-trust.ts";

/**
 * Capabilities that the project's security config unlocks alongside run-roles,
 * so the confirmation can name the concrete blast radius instead of an abstract
 * "trust" (Don Norman: error prevention — the operator confirms WHAT changes).
 */
export type TrustCapabilities = {
  /** `security.allowProjectShellByDefault`: roles may run project shell commands. */
  shell: boolean;
  /** `security.allowNetworkByDefault`: roles may make network/fetch calls. */
  network: boolean;
};

/**
 * Single gated trust-elevation dialog (EP-R2-2). Elevating read-only → run-roles
 * is the most security-sensitive write in the product — it lets AI roles execute
 * real LLM turns plus (per project.security) project shell / network — so it must
 * NOT fire on a single reflex click the way it did before. This mirrors
 * SimulationConfirmDialog: Cancel is the auto-focused Enter/Escape target
 * (onOpenAutoFocus preventDefault + cancelRef.focus), so an accidental Enter can
 * never commit the elevation.
 *
 * Open state is derived from `open`; the caller owns it so Escape / backdrop /
 * Cancel all funnel through `onCancel`, and the actual setTrust('run-roles')
 * only fires on explicit `onConfirm`.
 */
export function TrustElevationConfirmDialog({
  open,
  rootPath,
  capabilities,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Absolute project root being trusted, named verbatim in the body. */
  rootPath: string | undefined;
  capabilities: TrustCapabilities;
  /** True while the confirmed setTrust call is in flight (feedback). */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog onOpenChange={(next) => (next ? undefined : onCancel())} open={open}>
      <DialogContent
        className="max-w-md"
        data-testid="trust-confirm"
        onOpenAutoFocus={(event) => {
          // Move focus to Cancel instead of the Accept button so Enter cannot
          // commit the most security-sensitive write by reflex (error prevention).
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("manager.trustConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("manager.trustConfirmBody")(rootPath)}</DialogDescription>
        </DialogHeader>
        {/* Name the concrete capabilities being unlocked so the consequence is
         * legible without reading the YAML security block (cognitive load). */}
        <ul
          className="flex flex-col gap-1.5 rounded-[8px] bg-[var(--realm-impersonate-soft)] px-3 py-2.5 text-[#7a4a00] text-[13px]"
          data-testid="trust-confirm-capabilities"
        >
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("manager.trustConfirmCapRoles")}</span>
          </li>
          {capabilities.shell ? (
            <li className="flex items-start gap-2" data-testid="trust-confirm-cap-shell">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t("manager.trustConfirmCapShell")}</span>
            </li>
          ) : null}
          {capabilities.network ? (
            <li className="flex items-start gap-2" data-testid="trust-confirm-cap-network">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t("manager.trustConfirmCapNetwork")}</span>
            </li>
          ) : null}
        </ul>
        <DialogFooter>
          {/* Cancel is the safe, default-focused action (Norman: recovery first). */}
          <Button
            data-testid="trust-confirm-cancel"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
            variant="secondary"
          >
            {t("common.cancel")}
          </Button>
          <Button
            data-testid="trust-confirm-accept"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? t("manager.trustBannerPending") : t("manager.trustConfirmAccept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The World Manager trust surface: the read-only elevation banner (which only
 * opens the gated confirmation), the non-read-only trust-status row carrying the
 * always-safe revert control (MC-R2-3), and the shared confirmation dialog.
 * Placed beside the trust label it affects (mapping). Co-located with the dialog
 * so the whole trust concern reads as one unit and the page stays under budget.
 */
export function WorldManagerTrustSection({
  trust,
  trustLabel,
  rootPath,
}: {
  trust: ReturnType<typeof useWorldManagerTrust>;
  trustLabel: string;
  rootPath: string | undefined;
}) {
  const { t } = useI18n();
  return (
    <>
      {trust.isReadOnly ? (
        <div
          className="realm-rise flex flex-col gap-3 rounded-xl bg-[var(--realm-impersonate-soft)] p-4 sm:flex-row sm:items-center"
          data-testid="trust-banner"
        >
          <ShieldAlert className="size-5 shrink-0 text-[var(--realm-warning)]" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[14px] text-[var(--realm-fg)]">
              {t("manager.trustBannerTitle")}
            </div>
            <p className="mt-0.5 text-[13px] text-[var(--realm-fg-muted)] leading-5">
              {t("manager.trustBannerBody")}
            </p>
            {trust.failed ? (
              <p
                className="mt-1 text-[12px] text-[var(--realm-danger)]"
                data-testid="trust-banner-error"
              >
                {t("manager.trustBannerError")}
              </p>
            ) : null}
          </div>
          <Button
            className="h-9 shrink-0 rounded-lg px-4 text-[14px]"
            data-testid="trust-project"
            disabled={trust.elevating}
            onClick={trust.openConfirm}
            type="button"
          >
            {trust.elevating ? t("manager.trustBannerPending") : t("manager.trustBannerAction")}
          </Button>
        </div>
      ) : null}

      {trust.isReady && !trust.isReadOnly ? (
        <div
          className="realm-rise flex flex-col gap-2 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center"
          data-testid="trust-status"
        >
          <ShieldCheck className="size-5 shrink-0 text-[var(--realm-green-text)]" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[14px] text-[var(--realm-fg)]">
              {t("manager.trustStatus")}: {trustLabel}
            </div>
            {trust.failed ? (
              <p
                className="mt-0.5 text-[12px] text-[var(--realm-danger)]"
                data-testid="trust-status-error"
              >
                {t("manager.trustBannerError")}
              </p>
            ) : null}
          </div>
          <Button
            className="h-9 shrink-0 rounded-lg px-4 text-[14px]"
            data-testid="trust-revert"
            disabled={trust.reverting}
            onClick={() => void trust.revertTrust()}
            type="button"
            variant="secondary"
          >
            <Undo2 className="size-4" />
            {trust.reverting ? t("manager.trustReverting") : t("manager.trustRevert")}
          </Button>
        </div>
      ) : null}

      <TrustElevationConfirmDialog
        capabilities={trust.capabilities}
        onCancel={trust.cancelConfirm}
        onConfirm={() => void trust.confirmTrust()}
        open={trust.confirmOpen}
        pending={trust.elevating}
        rootPath={rootPath}
      />
    </>
  );
}
