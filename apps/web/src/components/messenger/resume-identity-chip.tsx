import { X } from "lucide-react";
import { useState } from "react";
import { TakeoverConfirmDialog } from "@/components/messenger/takeover-confirm-dialog.tsx";
import { useI18n } from "@/i18n/index.tsx";
import { displayNameForIdentity } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";

/**
 * Recovery affordance for the gated identity-takeover flow (Don Norman:
 * recovery + discoverability). When an operator re-enters a world they last
 * acted in as a role, `selectWorld` drops them safely to Boss and stashes the
 * prior role as `pendingResumeIdentity` (error prevention). This chip surfaces
 * that stash so the path is no longer dead: a returning operator can SEE that
 * they were previously a role and resume it — instead of being silently dropped
 * to Boss with no way back.
 *
 * Resuming is an L2 dangerous action, so the Resume verb routes through the same
 * shared {@link TakeoverConfirmDialog} every other takeover entry point uses; it
 * never re-impersonates on a bare click. Dismiss clears the suggestion locally
 * (the stash itself is owned by the state hook and is cleared on any identity
 * switch), keeping the calm chat surface free of a nagging banner.
 */
export function ResumeIdentityChip({ app }: { app: RealmAppController }) {
  const { t, locale } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [armed, setArmed] = useState(false);

  const pendingId = app.pendingResumeIdentity;
  if (!pendingId || dismissed) {
    return null;
  }

  // Reuse the canonical identity resolution (and localized pseudo-identity
  // labels) so the chip names the role exactly like every other surface.
  const labels = { god: t("common.god"), owner: t("common.boss") };
  const roleName = displayNameForIdentity(pendingId, app.state.roles, labels);

  // A dedicated sentence is unavoidable here (no single existing key carries it)
  // and we must not add i18n dict keys, so the zh/en copy is selected from the
  // active locale. The role name is interpolated from the shared resolver above.
  const lead =
    locale === "zh-CN"
      ? `上次在此世界以 ${roleName} 身份操作`
      : `You last acted as ${roleName} in this world`;
  const resumeVerb = locale === "zh-CN" ? "恢复" : "Resume";

  return (
    <>
      <div
        className="realm-rise flex items-center gap-2 border-[var(--realm-line)] border-b bg-[var(--realm-bg)] px-4 py-2 text-[13px] text-[var(--realm-fg-muted)]"
        data-testid="resume-identity-chip"
      >
        <span className="min-w-0 flex-1 truncate">{lead}</span>
        <span aria-hidden="true" className="opacity-50">
          ·
        </span>
        <button
          className="realm-press shrink-0 rounded-[6px] px-1.5 py-0.5 font-medium text-[var(--realm-green)] transition hover:bg-[var(--realm-hover)]"
          data-testid="resume-identity-confirm"
          onClick={() => setArmed(true)}
          type="button"
        >
          {resumeVerb}
        </button>
        <button
          aria-label={t("common.dismiss")}
          className="realm-press shrink-0 rounded-[6px] p-1 text-[var(--realm-fg-muted)] transition hover:bg-[var(--realm-hover)]"
          data-testid="resume-identity-dismiss"
          onClick={() => setDismissed(true)}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <TakeoverConfirmDialog
        app={app}
        onCancel={() => setArmed(false)}
        onConfirm={() => {
          // resumeIdentity() performs the actual viewer switch; gating it behind
          // this dialog is what closes the "silent re-impersonation" gap.
          app.resumeIdentity();
          setArmed(false);
        }}
        pendingRoleId={armed ? pendingId : undefined}
      />
    </>
  );
}
