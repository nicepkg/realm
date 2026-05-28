import { type ReactNode, useEffect, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/index.tsx";
import {
  applySettingsDraft,
  buildProviderRows,
  buildSettingsDraft,
  type SettingsDraft,
  type SettingsSnapshot,
  settingsDraftChanged,
} from "@/view-models/settings-view-model.ts";
import type { WorkspaceSheetKind } from "./workspace-sheets.tsx";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ready"; snapshot: SettingsSnapshot; draft: SettingsDraft }
  | { status: "error"; error: string };

type SaveState = "idle" | "saving" | "saved" | "error";

export function SettingsSheet({
  app,
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: WorkspaceSheetKind | undefined) => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      return;
    }
    let disposed = false;
    setLoadState({ status: "loading" });
    setSaveState("idle");
    setSaveError(undefined);
    void app.client
      .getSettings()
      .then((snapshot) => {
        if (disposed) {
          return;
        }
        setLoadState({
          draft: buildSettingsDraft(snapshot.user),
          snapshot,
          status: "ready",
        });
      })
      .catch((error) => {
        if (!disposed) {
          setLoadState({
            error: error instanceof Error ? error.message : String(error),
            status: "error",
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, [app.client, open]);

  const canSave =
    loadState.status === "ready" &&
    saveState !== "saving" &&
    loadState.draft.defaultProvider.length > 0 &&
    loadState.draft.defaultModel.trim().length > 0 &&
    settingsDraftChanged(loadState.snapshot.user, loadState.draft);

  async function saveUserSettings() {
    if (loadState.status !== "ready" || !canSave) {
      return;
    }
    setSaveState("saving");
    setSaveError(undefined);
    try {
      const user = applySettingsDraft(loadState.snapshot.user, loadState.draft);
      const snapshot = await app.client.updateUserSettings(user);
      setLoadState({
        draft: buildSettingsDraft(snapshot.user),
        snapshot,
        status: "ready",
      });
      setSaveState("saved");
      await app.reload();
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "settings" : undefined)}>
      <SheetContent
        className="w-[520px] max-w-[92vw] overflow-y-auto border-[var(--realm-line)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        data-testid="settings-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t("sheet.settings.title")}</SheetTitle>
          <SheetDescription>{t("sheet.settings.body")}</SheetDescription>
        </SheetHeader>
        {loadState.status === "loading" || loadState.status === "idle" ? <SettingsLoading /> : null}
        {loadState.status === "error" ? (
          <div className="mx-4 rounded-[8px] bg-[#fff4e5] p-3 text-[#7a4a00] text-[13px]">
            <div className="font-medium">{t("sheet.settings.loadFailed")}</div>
            <div>{loadState.error}</div>
          </div>
        ) : null}
        {loadState.status === "ready" ? (
          <div className="space-y-5 px-4 pb-5">
            <SettingsSection title={t("sheet.settings.language")}>
              <div className="flex gap-2">
                <Button
                  onClick={() => setLocale("en")}
                  size="sm"
                  type="button"
                  variant={locale === "en" ? "default" : "secondary"}
                >
                  {t("sheet.settings.english")}
                </Button>
                <Button
                  onClick={() => setLocale("zh-CN")}
                  size="sm"
                  type="button"
                  variant={locale === "zh-CN" ? "default" : "secondary"}
                >
                  {t("sheet.settings.simplifiedChinese")}
                </Button>
              </div>
            </SettingsSection>
            <ProviderDefaults
              draft={loadState.draft}
              onDraftChange={(draft) =>
                setLoadState((current) =>
                  current.status === "ready" ? { ...current, draft } : current,
                )
              }
              onSave={() => void saveUserSettings()}
              providers={buildProviderRows(loadState.snapshot.user)}
              canSave={canSave}
              saveError={saveError}
              saveState={saveState}
            />
            <ProviderList providers={buildProviderRows(loadState.snapshot.user)} />
            <ProjectSettingsSummary app={app} snapshot={loadState.snapshot} />
            <SettingsPaths paths={loadState.snapshot.paths} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SettingsLoading() {
  return (
    <div className="space-y-3 px-4" data-testid="settings-loading">
      <Skeleton className="h-16" />
      <Skeleton className="h-24" />
      <Skeleton className="h-20" />
    </div>
  );
}

function ProviderDefaults({
  canSave,
  draft,
  onDraftChange,
  onSave,
  providers,
  saveError,
  saveState,
}: {
  canSave: boolean;
  draft: SettingsDraft;
  onDraftChange: (draft: SettingsDraft) => void;
  onSave: () => void;
  providers: ReturnType<typeof buildProviderRows>;
  saveError?: string;
  saveState: SaveState;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("sheet.settings.providerDefaults")}>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <span className="text-[12px] text-[var(--realm-fg-muted)]">
            {t("sheet.settings.defaultProvider")}
          </span>
          <Select
            value={draft.defaultProvider}
            onValueChange={(defaultProvider) => onDraftChange({ ...draft, defaultProvider })}
          >
            <SelectTrigger data-testid="settings-default-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="grid gap-1" htmlFor="settings-default-model">
          <span className="text-[12px] text-[var(--realm-fg-muted)]">
            {t("sheet.settings.defaultModel")}
          </span>
          <Input
            data-testid="settings-default-model"
            id="settings-default-model"
            onChange={(event) =>
              onDraftChange({ ...draft, defaultModel: event.currentTarget.value })
            }
            value={draft.defaultModel}
          />
        </label>
        <div className="flex items-center justify-between gap-4 rounded-[8px] bg-[#f7f7f8] px-3 py-2">
          <span className="text-[13px]">{t("sheet.settings.openBrowser")}</span>
          <Switch
            checked={draft.openBrowser}
            data-testid="settings-open-browser"
            onCheckedChange={(openBrowser) => onDraftChange({ ...draft, openBrowser })}
          />
        </div>
        {saveError ? (
          <div className="rounded-[8px] bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]">
            {saveError}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button data-testid="settings-save" disabled={!canSave} onClick={onSave} type="button">
            {saveState === "saving" ? t("sheet.settings.saving") : t("sheet.settings.save")}
          </Button>
          <span
            className="text-[12px] text-[var(--realm-fg-muted)]"
            data-testid="settings-save-status"
          >
            {saveState === "saved"
              ? t("sheet.settings.saved")
              : saveState === "error"
                ? t("sheet.settings.saveFailed")
                : ""}
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}

function ProviderList({ providers }: { providers: ReturnType<typeof buildProviderRows> }) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("sheet.settings.providers")}>
      <div className="divide-y divide-[#ececef]" data-testid="settings-provider-list">
        {providers.map((provider) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"
            data-testid="settings-provider-row"
            key={provider.id}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-[14px]">{provider.label}</span>
                {provider.isDefault ? <Badge>{t("common.default")}</Badge> : null}
              </div>
              <div className="mt-1 truncate text-[12px] text-[var(--realm-fg-muted)]">
                {provider.defaultModel ?? "-"}
              </div>
              <code className="mt-1 block truncate text-[11px] text-[var(--realm-fg-muted)]">
                {provider.apiKeyEnv ?? t("sheet.settings.noKeyEnv")}
              </code>
            </div>
            <Badge
              className={
                provider.enabled
                  ? "border-transparent bg-[#e6f7ee] text-[#087a43]"
                  : "border-transparent bg-[#f1f1f2] text-[#6e6e73]"
              }
            >
              {provider.enabled ? t("common.active") : t("sheet.settings.disabled")}
            </Badge>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function ProjectSettingsSummary({
  app,
  snapshot,
}: {
  app: RealmAppController;
  snapshot: SettingsSnapshot;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("sheet.settings.projectRuntime")}>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <InfoCell label={t("common.project")} value={snapshot.project.project.name} />
        <InfoCell label={t("common.world")} value={app.selectedWorld?.name ?? "-"} />
        <InfoCell label={t("common.room")} value={app.selectedRoom?.name ?? "-"} />
        <InfoCell label={t("common.events")} value={String(app.state.events.length)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <PolicyBadge
          active={snapshot.project.security.allowNetworkByDefault}
          label={t("sheet.settings.network")}
        />
        <PolicyBadge
          active={snapshot.project.security.allowProjectShellByDefault}
          label={t("sheet.settings.projectShell")}
        />
        <PolicyBadge
          active={snapshot.project.security.requireTrust}
          label={t("sheet.settings.trust")}
        />
      </div>
    </SettingsSection>
  );
}

function SettingsPaths({ paths }: { paths: SettingsSnapshot["paths"] }) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("sheet.settings.paths")}>
      <PathRow label={t("sheet.settings.userConfig")} value={paths.userConfigPath} />
      <PathRow label={t("sheet.settings.projectConfig")} value={paths.projectConfigPath} />
      <PathRow
        label={t("sheet.settings.projectLocalConfig")}
        value={paths.projectLocalConfigPath}
      />
    </SettingsSection>
  );
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium text-[13px]">{title}</h3>
      {children}
    </section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[8px] bg-[#f7f7f8] p-3">
      <div className="text-[11px] text-[var(--realm-fg-muted)]">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[8px] bg-[#f7f7f8] p-3" data-testid="settings-path-row">
      <div className="text-[11px] text-[var(--realm-fg-muted)]">{label}</div>
      <code className="mt-1 block truncate text-[11px]">{value}</code>
    </div>
  );
}

function PolicyBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge
      className={
        active
          ? "border-transparent bg-[#e6f7ee] text-[#087a43]"
          : "border-transparent bg-[#f1f1f2] text-[#6e6e73]"
      }
    >
      {label}
    </Badge>
  );
}
