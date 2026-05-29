import type { StatePatchResult } from "@realm/api-contract";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/index.tsx";
import type { GodRoleAction } from "@/state/use-realm-app-state.ts";
import {
  firstValidAction,
  godConsequenceText,
  isActionValidForStatus,
  readRoleLifecycleStatus,
  statusLabelParts,
} from "./god-action-status.ts";
import { RoleInspectorSheet } from "./role-inspector-sheet.tsx";
import { SettingsSheet } from "./settings-sheet.tsx";
import { WorldInspectorSheet } from "./world-inspector-sheet.tsx";

export type WorkspaceSheetKind = "settings" | "god" | "role-inspector" | "world-inspector";

type WorkspaceSheetsProps = {
  app: RealmAppController;
  open: WorkspaceSheetKind | undefined;
  roleId?: string;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
  /**
   * Hand off to the shell-owned run-turn preview. The inspector stages the role
   * and closes itself, then calls this so the preview->confirm->running-bubble
   * cycle is driven by the single shared dialog (never a sheet-local copy).
   */
  onRequestRunTurn?: () => void;
};

export function WorkspaceSheets({
  app,
  onOpenChange,
  onRequestRunTurn,
  open,
  roleId,
}: WorkspaceSheetsProps) {
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
        onRequestRunTurn={onRequestRunTurn}
        // "Request adjudication" seeds the God target from this role, then swaps
        // the open sheet from the inspector to the pre-targeted God controller.
        onOpenGod={(seededRoleId) => {
          if (seededRoleId) {
            app.setGodActionRoleId(seededRoleId);
          }
          onOpenChange("god");
        }}
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
  const { locale, t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
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

  async function applyAction() {
    if (!canApply) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setRefreshFailed(false);
    try {
      // Phase 1 throws only when the ruling itself failed (real error banner).
      // Phase 2 (view refresh) resolves to `false` instead of throwing, so a
      // stale view becomes a calm notice rather than a "ruling failed" banner.
      const refreshed = await app.applyGodAction();
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
                <SelectItem disabled={!isActionValidForStatus("mute", targetStatus)} value="mute">
                  {t("sheet.god.action.mute")}
                </SelectItem>
                <SelectItem disabled={!isActionValidForStatus("kill", targetStatus)} value="kill">
                  {t("sheet.god.action.kill")}
                </SelectItem>
                <SelectItem
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
          {app.godActionResult ? <GodResultPanel result={app.godActionResult.result} /> : null}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Post-action panel for an applied God ruling. Surfaces recovery affordances
 * (undo / mark-obsolete) per the interaction spec's "dangerous actions require
 * rollback/mark-obsolete guidance" rule.
 *
 * The Realm app controller and client SDK currently expose no method to reverse
 * or mark-obsolete a committed God ruling (only `applyGodRoleAction` exists; the
 * SDK's `rollbackConfig` is for config history, not world rulings). Per project
 * rules we do NOT invent or fake one: the affordances render but stay disabled
 * with an explanatory tooltip, and the panel makes the real recovery path
 * explicit — every ruling is recorded as an auditable world/state event.
 */
export function GodResultPanel({ result }: { result: StatePatchResult }) {
  const { t } = useI18n();
  const isRejected = result.status === "rejected";
  // Recovery only makes sense for a ruling that actually committed world state.
  const committed = result.status === "committed" || result.status === "duplicate";
  // No controller method exists to reverse/obsolete a ruling, so the affordances
  // are always disabled. Kept visible to teach the recovery model, not to fake it.
  const recoveryUnavailable = true;

  return (
    <div
      className="space-y-3 rounded-lg bg-[#f7f7f8] p-3 text-[12px]"
      data-testid="god-action-result"
    >
      <div className="flex items-center gap-2">
        <Badge
          className="border-transparent bg-[#e6f7ee] text-[#087a43]"
          data-testid="god-result-tag"
        >
          {t("workspace.godTag")}
        </Badge>
        <Badge className="border-transparent bg-white text-[var(--realm-fg-muted)]">
          {isRejected ? result.status : `state v${result.version}`}
        </Badge>
      </div>
      <PatchIdCaption patchId={result.patchId} />
      <p className="text-[11px] leading-relaxed text-[var(--realm-fg-muted)]">
        {t("sheet.god.recoveryReason")}
      </p>
      <TooltipProvider>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrap disabled control so the tooltip still surfaces on hover. */}
              <span className="inline-flex">
                <Button
                  className="h-8"
                  data-testid="god-rollback"
                  disabled={recoveryUnavailable || !committed}
                  type="button"
                  variant="outline"
                >
                  {t("workspace.godRollback")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("sheet.god.recoveryReason")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  className="h-8"
                  data-testid="god-mark-obsolete"
                  disabled={recoveryUnavailable || !committed}
                  type="button"
                  variant="outline"
                >
                  {t("workspace.godMarkObsolete")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("sheet.god.recoveryReason")}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

/**
 * Small monospace caption for the committed ruling's patch id with a copy
 * affordance. Demoted from a full-width readonly input: the patch id is
 * reference metadata, not a primary control, so it reads as a quiet caption
 * and the operator can still copy it for support/audit follow-up.
 */
function PatchIdCaption({ patchId }: { patchId: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(patchId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (permissions / insecure context); the id stays
      // visible and selectable, so failing silently is acceptable here.
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="god-result-patch-id">
      <code className="select-all truncate font-mono text-[11px] text-[var(--realm-fg-muted)]">
        {patchId}
      </code>
      <Button
        aria-label={t("common.copyDetails")}
        className="h-6 w-6 shrink-0 p-0 text-[var(--realm-fg-muted)]"
        data-testid="god-result-patch-id-copy"
        onClick={() => void copy()}
        type="button"
        variant="ghost"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
