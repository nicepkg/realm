import type { RoleSummary } from "@realm/api-contract";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Gavel,
  LockKeyhole,
  MessageCirclePlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { canRunRoleTurn, runTurnBlockReason } from "@/components/messenger/role-turn-action.tsx";
import { TakeoverConfirmDialog } from "@/components/messenger/takeover-confirm-dialog.tsx";
import { useProjectTrust } from "@/components/messenger/use-project-trust.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import { openChatWithRole } from "./role-inspector-actions.ts";

/**
 * Profile tab of the role inspector: identity facts plus the role-scoped action
 * stack (open chat, run turn, request adjudication, take over). Extracted to a
 * co-located file so the sheet stays under the 500-line ceiling. The shared
 * presentational rows live here too and are re-imported by the sheet's policy
 * tab, so the inspector keeps one row grammar.
 */
export function ProfileRows({
  app,
  onOpenChange,
  onOpenGod,
  onRequestRunTurn,
  role,
}: {
  app: RealmAppController;
  onOpenChange: (open: boolean) => void;
  onOpenGod?: (roleId?: string) => void;
  onRequestRunTurn?: () => void;
  role: RoleSummary;
}) {
  const { locale, t } = useI18n();
  const [pendingRoleId, setPendingRoleId] = useState<string | undefined>();
  const [openingChat, setOpeningChat] = useState(false);
  const [openChatError, setOpenChatError] = useState<string | undefined>();
  const isActiveIdentity = app.viewerIdentity === role.id;
  // Same gate the composer + command palette enforce: the inspected role is the
  // resolved run target (the inspector stages runRoleId on open), so this reads
  // "can THIS role run a turn right now?". Read-only or non-membership disables
  // the button and names the blocking constraint beneath it.
  const trust = useProjectTrust(app);
  const canRunTurn = canRunRoleTurn(app, trust.isReadOnly);
  const runBlockReason = runTurnBlockReason(app, trust.isReadOnly, locale);

  // Stage this role for the shell-owned preview, then close the sheet and hand
  // off so the same gated preview->confirm->running-bubble cycle fires. We never
  // stage when the run cannot proceed (no silent dead-end runRoleId), and never
  // call runSelectedRoleTurn directly — the preview owns the confirm gate.
  function requestRunTurn() {
    if (!canRunTurn) {
      return;
    }
    app.setRunRoleId(role.id);
    onOpenChange(false);
    onRequestRunTurn?.();
  }

  // Resolve-or-create this role's DM and land the messenger in it. On success
  // close the inspector; on failure keep it open and surface a recoverable
  // error so the operator can retry without losing context.
  async function openChat() {
    setOpeningChat(true);
    setOpenChatError(undefined);
    try {
      await openChatWithRole(app, role);
      onOpenChange(false);
    } catch (error) {
      setOpenChatError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningChat(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="role-profile-summary">
      <MetricLine label={t("common.world")} value={app.selectedWorld?.name ?? "-"} />
      <MetricLine label={t("common.room")} value={app.selectedRoom?.name ?? "-"} />
      <MetricLine label={t("inspector.roleId")} value={role.id} />
      <MetricLine label={t("inspector.model")} value={role.model ?? t("common.default")} />
      {/* PRIMARY contact action: open (resolve-or-create) this role's direct
          chat and switch to it. Sits above Run Turn so "talk to this role" is
          the most discoverable next step from the inspector. */}
      <Button
        className="mt-2 w-full"
        data-testid="role-inspector-open-chat"
        disabled={openingChat || !app.selectedWorld}
        onClick={() => void openChat()}
        type="button"
      >
        <MessageCirclePlus className="size-4" />
        {openingChat ? t("inspector.openingChat") : t("inspector.openChat")}
      </Button>
      {openChatError ? (
        <div
          className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid="role-inspector-open-chat-error"
        >
          {t("inspector.openChatFailed")}
        </div>
      ) : null}
      {/* Secondary action: stage this role and hand off to the shell-owned
          run-turn preview so the gated preview->confirm cycle actually fires
          (no silent dead-end). Disabled with a named reason when the role is not
          a member of the current room or the project is read-only. */}
      <Button
        className="w-full"
        data-testid="role-inspector-run-turn"
        disabled={!canRunTurn}
        onClick={requestRunTurn}
        type="button"
        variant="secondary"
      >
        <Bot className="size-4" />
        {t("workspace.runTurn")}
      </Button>
      {!canRunTurn && runBlockReason ? (
        <p
          className="px-1 text-[11px] text-[var(--realm-fg-muted)]"
          data-testid="role-inspector-run-turn-block"
          role="note"
        >
          {runBlockReason}
        </p>
      ) : null}
      {/* Secondary action: seed the God controller with this role, then hand off
          to the pre-targeted ruling sheet. Hidden when no handler is wired. */}
      {onOpenGod ? (
        <Button
          className="w-full"
          data-testid="role-inspector-request-adjudication"
          onClick={() => onOpenGod(role.id)}
          type="button"
          variant="secondary"
        >
          <Gavel className="size-4" />
          {t("inspector.requestAdjudication")}
        </Button>
      ) : null}
      {/* Takeover is an L2 dangerous action: route through the shared gated
          dialog instead of mutating identity on click. */}
      <Button
        className="w-full"
        data-testid="role-inspector-takeover"
        disabled={isActiveIdentity}
        onClick={() => setPendingRoleId(role.id)}
        type="button"
        variant={isActiveIdentity ? "default" : "secondary"}
      >
        {isActiveIdentity ? t("common.active") : t("workspace.takeOver")}
      </Button>
      <TakeoverConfirmDialog
        app={app}
        onCancel={() => setPendingRoleId(undefined)}
        onConfirm={(id) => {
          app.setViewerIdentity(id);
          setPendingRoleId(undefined);
        }}
        pendingRoleId={pendingRoleId}
      />
    </div>
  );
}

export function InspectorNotice({
  children,
  icon,
  title,
}: {
  children: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex gap-2 rounded-[6px] bg-[#f7f7f8] p-3 text-[12px]">
      <span className="mt-0.5 shrink-0 text-[#087a43]">{icon}</span>
      <div>
        <div className="font-medium text-[#1f1f21]">{title}</div>
        <div className="mt-1 text-[var(--realm-fg-muted)]">{children}</div>
      </div>
    </div>
  );
}

export function MetricLine({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-[6px] bg-[#f7f7f8] px-3 py-2 text-[13px]">
      <span className="text-[var(--realm-fg-muted)]">{label}</span>
      <span className="truncate pl-4 font-medium text-[#1f1f21]">{value}</span>
    </div>
  );
}

export function SkillRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "allow" | "deny";
  value: string;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-[6px] border border-[var(--realm-line)] p-3 text-[12px]">
      <div className="flex items-center gap-2">
        {tone === "allow" ? (
          <CheckCircle2 className="size-4 text-[#087a43]" />
        ) : (
          <AlertCircle className="size-4 text-[#b45309]" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <Badge className="border-transparent bg-[#f7f7f8] text-[#555]">
          {tone === "allow" ? t("inspector.allowed") : t("inspector.denied")}
        </Badge>
      </div>
      <div className="mt-1 flex gap-1 text-[var(--realm-fg-muted)]">
        {tone === "deny" ? <LockKeyhole className="mt-0.5 size-3 shrink-0" /> : null}
        <span className="line-clamp-2">{value}</span>
      </div>
    </div>
  );
}
