import type { RoleSummary } from "@realm/api-contract";
import { useEffect, useRef, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
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
import { type Locale, useI18n } from "@/i18n/index.tsx";
import type { GodRoleAction } from "@/state/use-realm-app-state.ts";
import {
  firstValidAction,
  godConsequenceText,
  isActionValidForStatus,
  readRoleLifecycleStatus,
  statusLabelParts,
} from "./god-action-status.ts";
import { GodResultPanel } from "./god-result-panel.tsx";
import type { WorkspaceSheetKind } from "./workspace-sheets.tsx";

// Re-exported so the GodResultPanel test keeps importing it from here even though
// the panel now lives in its own co-located module to keep this file in budget.
export { GodResultPanel } from "./god-result-panel.tsx";

/**
 * File-local empty-state copy for the God controller — mirrors the file-local
 * `godConsequenceCopy` pattern (kept beside the gate's logic, not in the shared
 * i18n dict). The God controller only ever adjudicates ROLES (and the turns they
 * take); in a freshly-created world with zero roles there is literally nothing to
 * rule on, so the sheet must still OPEN and explain that calmly rather than show a
 * dead form or — worse — silently mount nothing. zh-CN is authoritative.
 */
export const godEmptyStateCopy: Record<Locale, string> = {
  "zh-CN": "该世界还没有角色或回合可裁决，先创建角色或运行一回合。",
  en: "This world has no roles or turns to adjudicate yet — create a role or run a turn first.",
};

/**
 * Calm empty-state shown inside the God sheet when the active world has no roles
 * to adjudicate. Rendered in place of the ruling form so the operator always gets
 * feedback (the sheet opens) instead of a silent no-op. Extracted + exported so
 * the open-with-empty-world behaviour is unit-testable without the radix portal.
 */
export function GodEmptyState({ locale }: { locale: Locale }) {
  return (
    <div
      className="rounded-lg bg-[#f7f7f8] p-4 text-[13px] text-[var(--realm-fg-muted)] leading-relaxed"
      data-testid="god-action-empty-world"
    >
      {godEmptyStateCopy[locale]}
    </div>
  );
}

/**
 * Thin radix shell for the God controller. Owns ONLY the portal + header so the
 * adjudication body ({@link GodSheetBody}) can be rendered (and unit-tested)
 * without the radix portal, which does not mount under SSR `renderToStaticMarkup`.
 * The sheet ALWAYS opens when `open` is true — even with zero roles — so the
 * operator gets feedback instead of a silent no-op.
 */
export function GodSheet({
  app,
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "god" : undefined)}>
      <SheetContent className="w-[440px] max-w-[92vw] border-[var(--realm-line)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <SheetHeader>
          <SheetTitle>{t("sheet.god.title")}</SheetTitle>
          <SheetDescription>{t("sheet.god.description")}</SheetDescription>
        </SheetHeader>
        <GodSheetBody app={app} open={open} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Adjudication body for the God controller — the entire scrollable form plus its
 * local apply/undo/reload state. Exported so {@link GodSheet}'s open-with-empty
 * behaviour is testable without the radix portal. When the active world has zero
 * roles it renders {@link GodEmptyState} in place of the form so there is always
 * visible feedback (never a blank panel or silent no-op).
 */
export function GodSheetBody({ app, open }: { app: RealmAppController; open: boolean }) {
  const { locale, t } = useI18n();
  // The God controller adjudicates the world's roles (and their turns). With zero
  // roles there is nothing to rule on, so we render a calm empty-state instead of
  // a dead form. `state.roles` is already world-scoped (loadRealm narrows it to
  // the selected world), so its emptiness is the authoritative signal.
  const hasNoRoles = app.state.roles.length === 0;
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Ref to the scrollable sheet body so "Undo this ruling" can scroll the
  // operator back up to the seeded action + confirmation gate after re-seeding.
  const bodyRef = useRef<HTMLDivElement>(null);
  // The target + action captured AT APPLY TIME. `StatePatchResult` does not carry
  // the target role id, so we remember it (and which action committed) here so the
  // result panel can offer a precise "undo" that re-targets the SAME role even
  // after the role set reconciles. Cleared whenever a fresh ruling is applied.
  const [appliedTarget, setAppliedTarget] = useState<{
    roleId: string;
    action: GodRoleAction;
  } | null>(null);
  // Stale-view notice, kept entirely separate from `error` so the green result
  // panel and the amber ruling-failure banner can NEVER render together. This
  // flips on only when a ruling committed but the follow-up realm refresh failed
  // (the ruling DID take effect — only the view is stale).
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const targetRole = app.state.roles.find((role) => role.id === app.godActionRoleId);
  // A committed ruling result coexisting with a realm-load error means the ruling
  // landed but the view could not refresh — surface the reload notice, not the
  // ruling-failure banner. `loadRealm` swallows its own errors into
  // `state.status`, so this derived signal is the authoritative stale-view cue.
  const realmLoadError = app.state.status === "error";
  useEffect(() => {
    if (app.godActionResult && realmLoadError) {
      setRefreshFailed(true);
    }
  }, [app.godActionResult, realmLoadError]);
  // Lifecycle status of the selected target, read from the simulation world
  // state. Unknown (non-simulation worlds) leaves every action enabled.
  const targetStatus = readRoleLifecycleStatus(app.state.worldState?.state, app.godActionRoleId);
  const statusLine = statusLabelParts(targetStatus, t);
  const selectedActionValid = isActionValidForStatus(app.godAction, targetStatus);
  const hasValidAction = firstValidAction(targetStatus) !== undefined;
  // One-line, localized statement of what the chosen action will DO to the named
  // role in the named world, shown next to where the operator types to confirm.
  // Only rendered when a target is selected AND the action is valid for the
  // current status, so it never describes an impossible ruling.
  const consequence =
    app.godActionRoleId && selectedActionValid
      ? godConsequenceText(
          app.godAction,
          targetRole?.displayName ?? app.godActionRoleId,
          app.selectedWorld?.name ?? "-",
          locale,
        )
      : undefined;
  const canApply =
    !busy &&
    Boolean(app.selectedWorld && app.godActionRoleId && app.godActionReason.trim()) &&
    selectedActionValid &&
    confirmation === app.godActionRoleId;

  // If the selected action is impossible for the (new) target's status, snap to
  // the first valid action so the operator never stares at a stuck Apply gate or
  // commits a contradictory ruling. Runs after render to avoid setting state
  // during render. No-op when status is unknown (every action stays valid).
  const { godAction, setGodAction } = app;
  useEffect(() => {
    if (selectedActionValid) {
      return;
    }
    const next = firstValidAction(targetStatus);
    if (next && next !== godAction) {
      setGodAction(next);
    }
  }, [selectedActionValid, targetStatus, godAction, setGodAction]);

  // Cold-open targeting: when the sheet opens, point the target at the role the
  // operator was just looking at (the selected room's role / last-inspected
  // role) instead of an arbitrary first role. Only fires on the closed->open
  // transition and only when the current target is empty OR still pointing at
  // the reconciler's arbitrary first-role default, so an explicit choice (e.g.
  // seeded from the inspector's "Request adjudication") is never overwritten.
  const { godActionRoleId, selectedRole, setGodActionRoleId } = app;
  const wasOpen = useRef(false);
  const candidateRoleId = selectedRole?.id;
  const firstRoleId = app.state.roles[0]?.id;
  useEffect(() => {
    if (open && !wasOpen.current) {
      const isArbitrary = !godActionRoleId || godActionRoleId === firstRoleId;
      if (candidateRoleId && isArbitrary && candidateRoleId !== godActionRoleId) {
        setGodActionRoleId(candidateRoleId);
      }
    }
    wasOpen.current = open;
  }, [open, godActionRoleId, candidateRoleId, firstRoleId, setGodActionRoleId]);

  async function applyAction() {
    if (!canApply) {
      return;
    }
    // Capture the target + action NOW, before the role set reconciles, so the
    // result panel's "undo" re-targets exactly this role even after a kill.
    const targetAtApply = app.godActionRoleId;
    const actionAtApply = app.godAction;
    setBusy(true);
    setError(undefined);
    setRefreshFailed(false);
    try {
      // Phase 1 throws only when the ruling itself failed (real error banner).
      // Phase 2 (view refresh) resolves to `false` instead of throwing, so a
      // stale view becomes a calm notice rather than a "ruling failed" banner.
      const refreshed = await app.applyGodAction();
      setAppliedTarget({ action: actionAtApply, roleId: targetAtApply });
      setConfirmation("");
      if (!refreshed) {
        setRefreshFailed(true);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  // Manual recovery for the stale-view case: re-run the realm load and clear the
  // notice on success. `reload` resolves even on failure (errors land in
  // `state.status`), so the derived effect keeps the notice up if it fails again.
  async function reloadView() {
    setReloading(true);
    try {
      await app.reload();
      if (app.state.status !== "error") {
        setRefreshFailed(false);
      }
    } finally {
      setReloading(false);
    }
  }

  // Live recovery for a committed kill/mute: pre-seed a REVIVE against the same
  // target and route it through the same typed-confirmation gate, so the
  // reversal is itself an audited ruling. The result panel still shows the prior
  // ruling until the operator re-confirms; clearing the form gate (reset
  // confirmation) forces a deliberate re-type rather than a one-click reversal.
  function seedUndo(targetRoleId: string) {
    app.setGodAction("revive");
    app.setGodActionRoleId(targetRoleId);
    app.setGodActionReason(t("sheet.god.undoReason"));
    setConfirmation("");
    setError(undefined);
    // Scroll back up to the seeded action + confirmation gate.
    bodyRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }

  return (
    <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-4">
      {hasNoRoles ? <GodEmptyState locale={locale} /> : null}
      {hasNoRoles ? null : (
        <>
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
              <SelectTrigger data-testid="god-action-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  data-testid="god-action-type-mute"
                  disabled={!isActionValidForStatus("mute", targetStatus)}
                  value="mute"
                >
                  {t("sheet.god.action.mute")}
                </SelectItem>
                <SelectItem
                  data-testid="god-action-type-kill"
                  disabled={!isActionValidForStatus("kill", targetStatus)}
                  value="kill"
                >
                  {t("sheet.god.action.kill")}
                </SelectItem>
                <SelectItem
                  data-testid="god-action-type-revive"
                  disabled={!isActionValidForStatus("revive", targetStatus)}
                  value="revive"
                >
                  {t("sheet.god.action.revive")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="block space-y-1">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">{t("sheet.god.role")}</span>
            <Select value={app.godActionRoleId} onValueChange={app.setGodActionRoleId}>
              <SelectTrigger data-testid="god-action-role-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {app.state.roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    <GodRoleOptionRow
                      role={role}
                      roles={app.state.roles}
                      status={statusLabelParts(
                        readRoleLifecycleStatus(app.state.worldState?.state, role.id),
                        t,
                      )}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="sr-only" data-testid="god-action-target-role-id">
              {app.godActionRoleId}
            </span>
            {statusLine ? (
              <span
                className="block text-[11px] text-[var(--realm-fg-muted)]"
                data-testid="god-action-status"
              >
                {t("sheet.god.statusLabel")}: {statusLine}
              </span>
            ) : null}
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
          {consequence ? (
            <div
              className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px] leading-snug"
              data-testid="god-action-consequence"
            >
              {consequence}
            </div>
          ) : null}
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
          {error && !refreshFailed ? (
            <div
              className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
              data-testid="god-action-error"
            >
              <div className="font-medium">{t("sheet.god.failed")}</div>
              <div>{error}</div>
            </div>
          ) : null}
          {app.godActionResult ? (
            <GodResultPanel
              result={app.godActionResult.result}
              appliedAction={appliedTarget?.action}
              targetRoleId={appliedTarget?.roleId}
              onUndo={appliedTarget ? () => seedUndo(appliedTarget.roleId) : undefined}
            />
          ) : null}
          {refreshFailed ? (
            <div
              className="flex items-center justify-between gap-3 rounded-md bg-[#f7f7f8] p-2 text-[12px] text-[var(--realm-fg-muted)]"
              data-testid="god-action-refresh-failed"
            >
              <span className="min-w-0">{t("sheet.god.refreshFailed")}</span>
              <Button
                className="h-7 shrink-0"
                data-testid="god-action-reload"
                disabled={reloading}
                onClick={() => void reloadView()}
                type="button"
                variant="outline"
              >
                {reloading ? t("common.loading") : t("sheet.god.reload")}
              </Button>
            </div>
          ) : null}
          {hasValidAction ? null : (
            <div
              className="rounded-md bg-[#f7f7f8] p-2 text-[11px] text-[var(--realm-fg-muted)]"
              data-testid="god-action-no-valid"
            >
              {t("sheet.god.noValidAction")}
            </div>
          )}
          <Button
            data-testid="god-action-apply"
            disabled={!canApply}
            onClick={() => void applyAction()}
            type="button"
          >
            {busy ? t("sheet.god.applying") : t("sheet.god.apply")}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Single row inside the God target-role Select: avatar + display name + id, with
 * the role's live lifecycle status badge appended so the operator can see, at the
 * point of choice, which roles are already dead/muted vs. active. Mirrors the
 * role-row identity treatment used by the inspector / account switcher.
 */
function GodRoleOptionRow({
  role,
  roles,
  status,
}: {
  role: RoleSummary;
  roles: RoleSummary[];
  status: string | undefined;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="god-role-option">
      <IdentityAvatar identity={role.id} label={role.displayName} roles={roles} size="sm" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">{role.displayName}</span>
        <span className="truncate font-mono text-[10px] text-[var(--realm-fg-muted)]">
          {role.id}
        </span>
      </span>
      {status ? (
        <Badge
          className="ml-auto border-transparent bg-white text-[10px] text-[var(--realm-fg-muted)]"
          data-testid="god-role-option-status"
        >
          {status}
        </Badge>
      ) : null}
    </span>
  );
}
