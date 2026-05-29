import type { ConfigPatchProposal } from "@realm/api-contract";
import { ChevronDown, FileText } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n/index.tsx";
import type {
  PatchAppliedHandler,
  PatchApplyResult,
  PatchRevisionInput,
} from "./config-action-types.ts";
import { PatchPreview } from "./patch-preview.tsx";

/**
 * Structured Role Builder. Mirrors CreateWorldSheet: a form proposes a config
 * patch via `client.proposeRole`, then routes the proposal through the SAME
 * reviewed PatchPreview (semantic → files → raw, typed confirm, rollback) so a
 * role file is never written without an auditable, reversible preview (Don
 * Norman: error prevention + recovery).
 *
 * The role id is auto-slugified from the display name but stays editable, and is
 * validated for non-emptiness and uniqueness against the loaded roles before the
 * preview button enables (constraints). Advanced (summary + role prompt) is
 * progressively disclosed so the primary flow is just "name it" (cognitive load).
 *
 * Open state is owned by the caller (a boolean), because this sheet is mounted
 * locally by both the World Manager quick-start and the command palette rather
 * than going through the shared ConfigActionSheetKind switch.
 */
export function CreateRoleSheet({
  app,
  onOpenChange,
  onPatchApplied,
  onRoleCreated,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatchApplied: PatchAppliedHandler;
  onRoleCreated?: (roleId: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  // The id is auto-derived from the name until the operator types their own; we
  // track a manual override so a hand-edited slug is not clobbered on every
  // keystroke (Don Norman: respect user intent).
  const [idOverride, setIdOverride] = useState<string | undefined>();
  const [model, setModel] = useState("default");
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [proposal, setProposal] = useState<ConfigPatchProposal | undefined>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const roleId = (idOverride ?? slugify(name)).trim();
  const idTaken = Boolean(roleId) && app.state.roles.some((role) => role.id === roleId);
  const canPreview = Boolean(name.trim() && roleId && !idTaken);

  function resetDraft() {
    setName("");
    setIdOverride(undefined);
    setModel("default");
    setSummary("");
    setPrompt("");
    setAdvancedOpen(false);
    setProposal(undefined);
    setError(undefined);
  }

  function changeOpen(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetDraft();
    }
  }

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPreview) {
      return;
    }
    setBusy(true);
    setPending(true);
    setError(undefined);
    try {
      const response = await app.client.proposeRole({
        id: roleId,
        displayName: name.trim(),
        model: model.trim() || "default",
        // The backend stores one behavioral field (profile.summary). Combine the
        // short summary and the longer role prompt into it, keeping both when
        // present so neither is silently dropped.
        summary: composeSummary(summary, prompt),
      });
      setProposal(response.patch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setPending(false);
    }
  }

  async function applyProposal(confirmation?: string): Promise<PatchApplyResult> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    setError(undefined);
    try {
      return await app.client.applyConfigPatch(proposal.id, { confirmation });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function reviseProposal(input: PatchRevisionInput): Promise<ConfigPatchProposal> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await app.client.reviseConfigPatch(proposal.id, input);
      setProposal(response.patch);
      return response.patch;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function finishRoleCreation(
    appliedProposal: ConfigPatchProposal,
    result: PatchApplyResult,
  ) {
    const createdId = roleId;
    onPatchApplied(appliedProposal, result);
    await app.reload();
    onRoleCreated?.(createdId);
    onOpenChange(false);
    resetDraft();
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent className="max-h-screen w-[480px] max-w-[94vw] overflow-y-auto border-[var(--realm-line)] bg-white">
        <SheetHeader>
          <SheetTitle>{t("sheet.createRole.title")}</SheetTitle>
          <SheetDescription>{t("sheet.createWorld.description")}</SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4 pt-3" onSubmit={preview}>
          <label className="block space-y-1" htmlFor="create-role-name">
            <span className="text-[12px] text-[var(--realm-fg-muted)]">
              {t("sheet.createRole.nameLabel")}
            </span>
            <Input
              id="create-role-name"
              autoComplete="off"
              data-testid="create-role-name"
              onChange={(event) => {
                setName(event.currentTarget.value);
                setProposal(undefined);
              }}
              value={name}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1" htmlFor="create-role-id">
              <span className="text-[12px] text-[var(--realm-fg-muted)]">
                {t("sheet.createRole.idLabel")}
              </span>
              <Input
                id="create-role-id"
                autoComplete="off"
                data-testid="create-role-id"
                onChange={(event) => {
                  setIdOverride(slugify(event.currentTarget.value));
                  setProposal(undefined);
                }}
                value={roleId}
              />
            </label>
            <label className="block space-y-1" htmlFor="create-role-model">
              <span className="text-[12px] text-[var(--realm-fg-muted)]">
                {t("sheet.createRole.modelLabel")}
              </span>
              <Input
                id="create-role-model"
                autoComplete="off"
                data-testid="create-role-model"
                onChange={(event) => {
                  setModel(event.currentTarget.value);
                  setProposal(undefined);
                }}
                value={model}
              />
            </label>
          </div>
          {idTaken ? (
            <p
              className="text-[12px] text-[var(--realm-warning)]"
              data-testid="create-role-id-taken"
            >
              {t("sheet.createRole.idTaken")}
            </p>
          ) : null}
          <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
            <CollapsibleTrigger
              className="flex w-full items-center justify-between rounded-[6px] bg-[#f7f7f8] px-3 py-2 text-[12px] text-[var(--realm-fg-muted)] transition hover:bg-[#eeeeef]"
              data-testid="create-role-advanced-toggle"
              type="button"
            >
              <span>{t("sheet.createRole.advanced")}</span>
              <ChevronDown
                className={`size-4 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <label className="block space-y-1" htmlFor="create-role-summary">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createRole.summaryLabel")}
                </span>
                <Input
                  id="create-role-summary"
                  autoComplete="off"
                  data-testid="create-role-summary"
                  onChange={(event) => {
                    setSummary(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  value={summary}
                />
              </label>
              <label className="block space-y-1" htmlFor="create-role-prompt">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createRole.promptLabel")}
                </span>
                <textarea
                  id="create-role-prompt"
                  className="min-h-32 w-full resize-y rounded-[6px] border border-[var(--realm-line)] bg-[#fbfbfc] p-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#07c160]"
                  data-testid="create-role-prompt"
                  onChange={(event) => {
                    setPrompt(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  value={prompt}
                />
              </label>
            </CollapsibleContent>
          </Collapsible>
          <Button data-testid="create-role-preview" disabled={!canPreview || busy} type="submit">
            {pending ? (
              <Spinner data-testid="create-role-preview-spinner" />
            ) : (
              <FileText className="size-4" />
            )}
            {pending ? t("sheet.createWorld.previewing") : t("sheet.createRole.submit")}
          </Button>
        </form>
        {error ? (
          <div
            className="mx-4 mt-3 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
            data-testid="create-role-error"
          >
            <div className="font-medium">{t("sheet.createRole.title")}</div>
            <div>{error}</div>
          </div>
        ) : null}
        <PatchPreview
          busy={busy}
          proposal={proposal}
          onApplied={finishRoleCreation}
          onApply={applyProposal}
          onReject={() => setProposal(undefined)}
          onRevise={reviseProposal}
          onRollback={(historyId) => app.client.rollbackConfig(historyId)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** Slugify a display name into a safe `.agents/roles/<id>` directory segment. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The backend role config has a single behavioral field (`profile.summary`).
 * Keep both the one-line summary and the longer prompt when present, joining
 * them with a blank line so neither input is silently lost.
 */
function composeSummary(summary: string, prompt: string): string {
  return [summary.trim(), prompt.trim()].filter(Boolean).join("\n\n");
}
