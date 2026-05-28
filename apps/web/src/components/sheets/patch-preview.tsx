import type { ConfigPatchProposal } from "@realm/api-contract";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/index.tsx";
import type { PatchApplyResult } from "./config-action-types.ts";
import {
  buildRawPatchText,
  isConflictError,
  summarizePatchOperations,
} from "./patch-preview-model.ts";

export function PatchPreview({
  busy,
  onApplied,
  onApply,
  onReject,
  onRollback,
  proposal,
}: {
  busy: boolean;
  proposal?: ConfigPatchProposal;
  onApply: (confirmation?: string) => Promise<PatchApplyResult>;
  onReject?: () => void;
  onRollback: (historyId: string) => Promise<{ historyId: string; restoredPaths: string[] }>;
  onApplied?: (proposal: ConfigPatchProposal, result: PatchApplyResult) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [applyResult, setApplyResult] = useState<PatchApplyResult | undefined>();
  const [rollbackResult, setRollbackResult] = useState<string[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!proposal) {
    return null;
  }

  const activeProposal = proposal;
  const summary = summarizePatchOperations(proposal.operations);
  const rawPatch = buildRawPatchText(proposal);
  const requiresConfirmation = Boolean(proposal.typedConfirmation);
  const canApply =
    !busy && (!proposal.typedConfirmation || confirmation === proposal.typedConfirmation);

  async function applyPatch() {
    setError(undefined);
    setRollbackResult(undefined);
    try {
      const result = await onApply(confirmation || undefined);
      setApplyResult(result);
      await onApplied?.(activeProposal, result);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function rollbackPatch() {
    if (!applyResult) {
      return;
    }
    setError(undefined);
    try {
      const result = await onRollback(applyResult.historyId);
      setRollbackResult(result.restoredPaths);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section
      className="mx-4 mt-4 space-y-3 rounded-lg bg-[#f7f7f8] p-3"
      data-testid="patch-preview"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[14px]">{proposal.title}</h3>
          <p className="mt-1 text-[12px] text-[var(--realm-fg-muted)]">{proposal.summary}</p>
        </div>
        <Badge className={riskBadgeClass(proposal.riskLevel)}>
          {riskLabel(proposal.riskLevel, t)}
        </Badge>
      </div>
      <div className="space-y-1 rounded-md bg-white p-2 text-[12px] text-[var(--realm-fg-muted)]">
        <div className="flex items-center gap-1.5 font-medium text-[var(--realm-fg)]">
          <AlertTriangle className="size-3.5" />
          {t("sheet.config.riskReasons")}
        </div>
        <ul className="list-disc space-y-1 pl-5">
          {proposal.riskReasons.map((reason) => (
            <li key={reason}>{riskReasonLabel(reason, t)}</li>
          ))}
        </ul>
      </div>
      {requiresConfirmation ? (
        <label className="block space-y-1" htmlFor={`confirm-${proposal.id}`}>
          <span className="text-[12px] text-[var(--realm-fg-muted)]">
            {t("sheet.config.confirmHelp")}{" "}
            <code className="font-semibold text-[var(--realm-fg)]">
              {proposal.typedConfirmation}
            </code>
          </span>
          <Input
            autoComplete="off"
            data-testid="config-patch-confirmation"
            id={`confirm-${proposal.id}`}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            value={confirmation}
          />
        </label>
      ) : null}
      {error ? (
        <div
          className="rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
          data-testid={isConflictError(error) ? "patch-conflict-error" : "patch-error"}
        >
          <div className="font-medium">
            {isConflictError(error)
              ? t("sheet.config.conflictDetected")
              : t("sheet.config.applyFailed")}
          </div>
          {error}
        </div>
      ) : null}
      {applyResult ? (
        <div
          className="rounded-md bg-white p-2 text-[12px] text-[var(--realm-fg-muted)]"
          data-testid="patch-apply-result"
        >
          <div className="font-medium text-[var(--realm-fg)]">{t("sheet.config.applied")}</div>
          <div className="mt-1">
            {t("sheet.config.historyId")}: {applyResult.historyId}
          </div>
          <div className="mt-1">
            {t("sheet.config.changedPaths")}: {applyResult.changedPaths.join(", ")}
          </div>
        </div>
      ) : null}
      {rollbackResult ? (
        <div
          className="rounded-md bg-[#e6f7ee] p-2 text-[#087a43] text-[12px]"
          data-testid="patch-rollback-result"
        >
          {t("sheet.config.rollbackDone")}: {rollbackResult.join(", ")}
        </div>
      ) : null}
      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-[var(--realm-line)] border-t bg-[#f7f7f8] py-2">
        <Button
          data-testid="config-patch-apply"
          disabled={!canApply || Boolean(applyResult)}
          onClick={() => void applyPatch()}
          type="button"
        >
          {t("sheet.config.apply")}
        </Button>
        {applyResult ? (
          <Button
            disabled={busy || Boolean(rollbackResult)}
            onClick={() => void rollbackPatch()}
            type="button"
            variant="secondary"
          >
            <RotateCcw className="size-4" />
            {t("sheet.config.rollback")}
          </Button>
        ) : null}
        {!applyResult && onReject ? (
          <Button
            data-testid="config-patch-reject"
            onClick={onReject}
            type="button"
            variant="ghost"
          >
            {t("sheet.config.reject")}
          </Button>
        ) : null}
      </div>
      <Separator />
      <Tabs defaultValue="semantic" className="space-y-2" data-testid="config-patch-tabs">
        <TabsList className="bg-white" variant="line">
          <TabsTrigger data-testid="config-patch-tab-semantic" value="semantic">
            {t("sheet.config.semantic")}
          </TabsTrigger>
          <TabsTrigger data-testid="config-patch-tab-files" value="files">
            {t("sheet.config.files")}
          </TabsTrigger>
          <TabsTrigger data-testid="config-patch-tab-raw" value="raw">
            {t("sheet.config.rawDiff")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-2" value="semantic">
          <div
            className="grid grid-cols-2 gap-2 rounded-md bg-white p-2 text-[12px]"
            data-testid="config-patch-semantic"
          >
            <InfoMetric label={t("sheet.config.filesChanged")} value={String(summary.total)} />
            <InfoMetric
              label={t("sheet.config.validation")}
              value={t("sheet.config.validationReady")}
            />
            <InfoMetric label={t("sheet.config.creates")} value={String(summary.create)} />
            <InfoMetric label={t("sheet.config.updates")} value={String(summary.update)} />
            <InfoMetric label={t("sheet.config.deletes")} value={String(summary.delete)} />
            <InfoMetric
              label={t("sheet.config.conflictStatus")}
              value={t("sheet.config.conflictCheckedAtApply")}
            />
          </div>
          <section className="rounded-md bg-white p-2 text-[12px]">
            <div className="font-medium">{t("sheet.config.requiredCapabilities")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {proposal.requiredCapabilities.length > 0 ? (
                proposal.requiredCapabilities.map((capability) => (
                  <Badge
                    className="border-transparent bg-[#f0f0f2] text-[var(--realm-fg-muted)]"
                    key={capability}
                  >
                    {capability}
                  </Badge>
                ))
              ) : (
                <span className="text-[var(--realm-fg-muted)]">
                  {t("sheet.config.noCapabilities")}
                </span>
              )}
            </div>
          </section>
        </TabsContent>
        <TabsContent className="space-y-2" value="files">
          {proposal.operations.map((operation) => (
            <div className="rounded-md bg-white p-2 text-[12px]" key={operation.path}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{operation.path}</span>
                <Badge className="border-transparent bg-[#f0f0f2] text-[var(--realm-fg-muted)]">
                  {operation.action}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-[var(--realm-fg-faint)]">
                {operation.previousHash
                  ? `${t("sheet.config.previousHash")}: ${operation.previousHash.slice(0, 10)}`
                  : t("sheet.config.newFile")}{" "}
                {operation.nextHash ? `-> ${operation.nextHash.slice(0, 10)}` : ""}
              </div>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--realm-fg-muted)]">
                {operation.nextContent ?? ""}
              </pre>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="raw">
          <pre
            className="max-h-72 overflow-auto rounded-md bg-[#1f1f21] p-3 text-[11px] text-white"
            data-testid="config-patch-raw-diff"
          >
            {rawPatch}
          </pre>
          <div className="mt-2 text-[11px] text-[var(--realm-fg-muted)]">
            {t("sheet.config.rawDiffHelp")}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[6px] bg-[#f7f7f8] px-2 py-1.5">
      <div className="truncate text-[11px] text-[var(--realm-fg-muted)]">{label}</div>
      <div className="truncate font-medium text-[var(--realm-fg)]">{value}</div>
    </div>
  );
}

function riskBadgeClass(riskLevel: ConfigPatchProposal["riskLevel"]): string {
  if (riskLevel === "high") {
    return "border-transparent bg-[#fff4e5] text-[#7a4a00]";
  }
  if (riskLevel === "medium") {
    return "border-transparent bg-[#fff8d6] text-[#725b00]";
  }
  return "border-transparent bg-white text-[var(--realm-green-text)]";
}

function riskLabel(
  riskLevel: ConfigPatchProposal["riskLevel"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (riskLevel === "high") {
    return t("sheet.config.risk.high");
  }
  if (riskLevel === "medium") {
    return t("sheet.config.risk.medium");
  }
  return t("sheet.config.risk.low");
}

function riskReasonLabel(reason: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (reason === "Deletes config files.") {
    return t("sheet.config.reason.delete");
  }
  if (reason === "Modifies existing config.") {
    return t("sheet.config.reason.update");
  }
  if (reason === "Changes project, provider, or machine-local settings.") {
    return t("sheet.config.reason.settings");
  }
  if (reason === "Changes visibility, tool policy, or God permissions.") {
    return t("sheet.config.reason.policy");
  }
  if (reason === "Changes an existing world definition or state seed.") {
    return t("sheet.config.reason.worldUpdate");
  }
  if (reason === "Creates new config files only.") {
    return t("sheet.config.reason.createOnly");
  }
  return reason;
}
