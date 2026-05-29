import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/index.tsx";
import type { SettingsSnapshot } from "@/view-models/settings-view-model.ts";
import {
  affectsHighRiskPolicy,
  computeAffectedPolicySections,
  type ExportBundle,
  type PolicySectionKey,
  parseImportBundle,
} from "./settings-import-diff.ts";

/**
 * Maps each high-risk policy section to the existing i18n label key, so the
 * confirm dialog can name exactly what the pasted bundle overwrites without
 * introducing new dictionary entries.
 */
const SECTION_LABEL_KEYS: Record<
  PolicySectionKey,
  | "sheet.settings.network"
  | "sheet.settings.projectShell"
  | "sheet.settings.trust"
  | "sheet.settings.providers"
> = {
  network: "sheet.settings.network",
  projectShell: "sheet.settings.projectShell",
  requireTrust: "sheet.settings.trust",
  provider: "sheet.settings.providers",
};

type PendingImport = {
  bundle: Pick<ExportBundle, "project" | "user">;
  affected: PolicySectionKey[];
};

/**
 * Export downloads the redacted settings bundle as realm-settings.json. Import
 * is a two-step, recoverable flow: parsing the pasted bundle never applies it.
 * On Import we diff the bundle against the live snapshot, surface a confirm
 * dialog that names the high-risk policy sections it would overwrite
 * (network / project shell / trust / provider), and only call importSettings +
 * reload after explicit confirmation. Cancel preserves the pasted text so a
 * mistaken Enter can never silently flip security policy. Parse and IO failures
 * surface in the sheet's orange error box.
 */
export function SettingsExportImport({
  app,
  onImported,
}: {
  app: RealmAppController;
  onImported: (snapshot: SettingsSnapshot) => void;
}) {
  const { t } = useI18n();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<PendingImport | undefined>();

  async function runExport() {
    setBusy("export");
    setError(undefined);
    try {
      const bundle = await app.client.exportSettings();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "realm-settings.json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  // Step 1: parse + diff. We read the live snapshot via the SDK because the
  // current values aren't passed in as props; the diff drives the confirm
  // warning. Nothing is written here — applying happens only in confirmImport.
  async function prepareImport() {
    if (paste.trim().length === 0) {
      return;
    }
    setBusy("import");
    setError(undefined);
    try {
      const bundle = parseImportBundle(paste);
      const current = await app.client.getSettings();
      const affected = computeAffectedPolicySections(current, bundle);
      setPending({ affected, bundle });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  // Step 2: apply only after explicit confirmation.
  async function confirmImport() {
    if (!pending) {
      return;
    }
    setBusy("import");
    setError(undefined);
    try {
      const snapshot = await app.client.importSettings({
        project: pending.bundle.project,
        user: pending.bundle.user,
      });
      setPending(undefined);
      setPaste("");
      onImported(snapshot);
      await app.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  // Cancel aborts the pending apply and preserves the pasted text so the user
  // can inspect or retry without re-pasting.
  function cancelImport() {
    setPending(undefined);
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-[13px]">{t("settings.exportImportTitle")}</h3>
      <div className="grid gap-3">
        <p className="text-[12px] text-[var(--realm-fg-muted)]">{t("settings.exportNoSecrets")}</p>
        <div>
          <Button
            data-testid="settings-export"
            disabled={busy !== undefined}
            onClick={() => void runExport()}
            type="button"
            variant="secondary"
          >
            {busy === "export" ? <Spinner data-testid="settings-export-spinner" /> : null}
            {busy === "export" ? t("settings.exporting") : t("settings.export")}
          </Button>
        </div>
        <Textarea
          aria-label={t("settings.import")}
          className="min-h-24 font-mono text-[12px]"
          data-testid="settings-import-input"
          onChange={(event) => setPaste(event.currentTarget.value)}
          spellCheck={false}
          value={paste}
        />
        {error ? (
          <div className="rounded-[8px] bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]">{error}</div>
        ) : null}
        <div>
          <Button
            data-testid="settings-import"
            disabled={busy !== undefined || paste.trim().length === 0}
            onClick={() => void prepareImport()}
            type="button"
          >
            {busy === "import" ? <Spinner data-testid="settings-import-spinner" /> : null}
            {busy === "import" ? t("settings.importing") : t("settings.import")}
          </Button>
        </div>
      </div>
      <ImportConfirmDialog
        affected={pending?.affected ?? []}
        busy={busy === "import"}
        onCancel={cancelImport}
        onConfirm={() => void confirmImport()}
        open={pending !== undefined}
      />
    </section>
  );
}

function ImportConfirmDialog({
  affected,
  busy,
  onCancel,
  onConfirm,
  open,
}: {
  affected: PolicySectionKey[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  const { t } = useI18n();
  const sectionNames = affected.map((key) => t(SECTION_LABEL_KEYS[key])).join("、");
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent data-testid="settings-import-confirm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("settings.importConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("settings.importConfirmBody")}</DialogDescription>
        </DialogHeader>
        {affectsHighRiskPolicy(affected) ? (
          <div
            className="rounded-[8px] bg-[#fff4e5] p-3 text-[#7a4a00] text-[12px]"
            data-testid="settings-import-affects-policy"
          >
            <div className="font-medium">{t("settings.importAffectsPolicy")}</div>
            <div className="mt-1" data-testid="settings-import-affected-sections">
              {sectionNames}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button
              data-testid="settings-import-cancel"
              disabled={busy}
              type="button"
              variant="outline"
            >
              {t("settings.importCancel")}
            </Button>
          </DialogClose>
          <Button
            data-testid="settings-import-confirm-apply"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? <Spinner /> : null}
            {t("settings.importConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
