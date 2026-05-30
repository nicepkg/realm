import type { StatePatchResult } from "@realm/api-contract";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index.tsx";
import type { GodRoleAction } from "@/state/use-realm-app-state.ts";

/**
 * Post-action panel for an applied God ruling. The runtime DOES support reversal
 * via the inverse `revive` action, so a committed kill/mute is recoverable: the
 * panel offers a LIVE "Undo this ruling" that pre-seeds a revive against the same
 * target and routes it back through the same typed-confirmation gate (so the
 * reversal is itself an audited ruling — never a silent one-click rollback).
 *
 * Rulings themselves are immutable, auditable world events; there is no edit or
 * "mark obsolete" backend, so instead of rendering a dead disabled button we
 * state that real model plainly: reverse a ruling by issuing a new God action.
 */
export function GodResultPanel({
  appliedAction,
  onUndo,
  result,
  targetRoleId,
}: {
  result: StatePatchResult;
  /** The action that committed (captured at apply time; result omits it). */
  appliedAction?: GodRoleAction;
  /** The target role id captured at apply time (result omits it). */
  targetRoleId?: string;
  /** Seed a revive against {@link targetRoleId} and re-open the gate. */
  onUndo?: () => void;
}) {
  const { t } = useI18n();
  const isRejected = result.status === "rejected";
  // Recovery only makes sense for a ruling that actually committed world state.
  const committed = result.status === "committed" || result.status === "duplicate";
  // The undo affordance is only meaningful for a committed kill/mute that we can
  // re-target with a revive. Reviving a revive is a no-op, so it is excluded.
  const canUndo =
    committed &&
    Boolean(targetRoleId) &&
    Boolean(onUndo) &&
    (appliedAction === "kill" || appliedAction === "mute");

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
      {canUndo ? (
        <div className="space-y-2">
          <Button
            className="h-8"
            data-testid="god-rollback"
            onClick={onUndo}
            type="button"
            variant="outline"
          >
            {t("workspace.godRollback")}
          </Button>
          <p className="text-[11px] leading-relaxed text-[var(--realm-fg-muted)]">
            {t("sheet.god.undoSeeded")}
          </p>
        </div>
      ) : null}
      {/*
       * No edit / "mark obsolete" backend exists. Rather than a dead disabled
       * button, state the real model: rulings are immutable auditable events,
       * reversed only by issuing a new (compensating) God action.
       */}
      <p
        className="text-[11px] leading-relaxed text-[var(--realm-fg-muted)]"
        data-testid="god-obsolete-note"
      >
        {t("sheet.god.obsoleteNote")}
      </p>
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
