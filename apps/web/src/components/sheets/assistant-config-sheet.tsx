import type { ConfigPatchProposal } from "@realm/api-contract";
import { Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/index.tsx";
import type {
  ConfigActionSheetKind,
  PatchAppliedHandler,
  PatchApplyResult,
} from "./config-action-types.ts";
import { PatchPreview } from "./patch-preview.tsx";

export function AssistantConfigSheet({
  app,
  onOpenChange,
  onPatchApplied,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
  onPatchApplied: PatchAppliedHandler;
}) {
  const { t } = useI18n();
  const [goal, setGoal] = useState("");
  const [proposal, setProposal] = useState<ConfigPatchProposal | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal.trim()) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await app.client.proposeAssistantConfig({ goal: goal.trim() });
      setProposal(response.patch);
    } catch (error) {
      setProposal(undefined);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyProposal(confirmation?: string): Promise<PatchApplyResult> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    try {
      const result = await app.client.applyConfigPatch(proposal.id, { confirmation });
      await app.reload();
      return result;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "assistant-config" : undefined)}
    >
      <SheetContent className="max-h-screen w-[520px] max-w-[94vw] overflow-y-auto border-[var(--realm-line)] bg-white">
        <SheetHeader>
          <SheetTitle>{t("sheet.assistant.title")}</SheetTitle>
          <SheetDescription>{t("sheet.assistant.description")}</SheetDescription>
        </SheetHeader>
        <form className="space-y-3 px-4" id="assistant-config-form" onSubmit={preview}>
          <Textarea
            className="min-h-28"
            data-testid="assistant-config-goal"
            onChange={(event) => {
              setGoal(event.currentTarget.value);
              setProposal(undefined);
              setError(undefined);
            }}
            placeholder={t("sheet.assistant.placeholder")}
            value={goal}
          />
          <Button
            data-testid="assistant-config-preview"
            disabled={!goal.trim() || busy}
            type="submit"
          >
            <Sparkles className="size-4" />
            {busy ? t("sheet.assistant.previewing") : t("sheet.config.preview")}
          </Button>
        </form>
        {error ? (
          <div
            className="mx-4 mt-3 space-y-2 rounded-md bg-[#fff4e5] p-3 text-[#7a4a00] text-[12px]"
            data-testid="assistant-config-error"
          >
            <div className="font-medium">{t("sheet.assistant.failed")}</div>
            <div>{error}</div>
            <Button
              className="h-7 bg-white px-2 text-[#7a4a00] hover:bg-[#ffe8bf]"
              data-testid="assistant-config-retry"
              disabled={busy}
              form="assistant-config-form"
              size="sm"
              type="submit"
              variant="secondary"
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <PatchPreview
          busy={busy}
          proposal={proposal}
          onApplied={onPatchApplied}
          onApply={applyProposal}
          onRollback={(historyId) => app.client.rollbackConfig(historyId)}
        />
      </SheetContent>
    </Sheet>
  );
}
