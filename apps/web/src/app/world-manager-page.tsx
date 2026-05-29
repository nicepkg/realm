import {
  AlertCircle,
  ArrowRight,
  Bot,
  Command,
  DownloadCloud,
  FolderGit2,
  PlugZap,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GroupAvatarGrid } from "@/components/messenger/messenger-primitives.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/index.tsx";
import { worldModeLabel } from "@/view-models/labels.ts";
import { filterWorldsForManager } from "@/view-models/world-manager-view-model.ts";
import type { RealmAppController } from "./types.ts";
import type { OperatorInfo } from "./world-manager-parts.tsx";
import { QuickStart, WorldManagerHeader, WorldManagerSkeleton } from "./world-manager-parts.tsx";

type TrustTier = "read-only" | "run-roles" | "elevated-tools";

/**
 * The command-palette shortcut hint, rendered next to the affordance so the
 * Cmd/Ctrl+K shortcut is discoverable instead of hidden (discoverability).
 * Prefers the modern `userAgentData.platform`, falling back to `navigator.platform`.
 */
function commandShortcutLabel(): string {
  if (typeof navigator === "undefined") {
    return "Ctrl K";
  }
  const platform = (
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ""
  ).toLowerCase();
  return platform.includes("mac") ? "⌘K" : "Ctrl K";
}

type TrustState =
  | { status: "loading" }
  | { status: "ready"; tier: TrustTier }
  | { status: "error" };

export function WorldManagerPage({
  app,
  onAskAssistant,
  onCreateWorld,
  onEnterWorld,
  onOpenCommandPalette,
  onOpenSettings,
}: {
  app: RealmAppController;
  onAskAssistant: () => void;
  /** Opens the create-world sheet; `tab` selects preset vs import landing. */
  onCreateWorld: (tab?: "import" | "preset") => void;
  onEnterWorld: (worldId: string) => Promise<void>;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const { client } = app;
  const worldCount = app.state.worlds.length;
  // Platform-aware shortcut hint for the command-palette affordance: ⌘K on mac,
  // Ctrl K elsewhere. Computed once — the platform never changes mid-session.
  const commandShortcutHint = useMemo(() => commandShortcutLabel(), []);
  const [worldSearch, setWorldSearch] = useState("");
  const visibleWorlds = filterWorldsForManager(app.state.worlds, app.state.roles, worldSearch);
  const health = app.state.status === "error" ? t("manager.healthAttention") : t("common.ready");

  const [trust, setTrust] = useState<TrustState>({ status: "loading" });
  const [trusting, setTrusting] = useState(false);
  const [trustFailed, setTrustFailed] = useState(false);
  const [operator, setOperator] = useState<OperatorInfo>({ isMockRuntime: false });
  const [copied, setCopied] = useState(false);

  const refreshTrust = useCallback(async () => {
    try {
      const policy = await client.getEffectivePolicy();
      setTrust({ status: "ready", tier: policy.trustTier });
    } catch {
      setTrust({ status: "error" });
    }
  }, [client]);

  useEffect(() => {
    void refreshTrust();
  }, [refreshTrust]);

  // Resolve operator context (project path / provider / runtime) for the strip.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [config, settings, healthRes] = await Promise.allSettled([
        client.getEffectiveConfig(),
        client.getSettings(),
        client.getHealth(),
      ]);
      if (cancelled) {
        return;
      }
      setOperator({
        rootPath: config.status === "fulfilled" ? config.value.project.root : undefined,
        provider: settings.status === "fulfilled" ? settings.value.user.defaultProvider : undefined,
        model: settings.status === "fulfilled" ? settings.value.user.defaultModel : undefined,
        isMockRuntime:
          healthRes.status === "fulfilled" && healthRes.value.runtime.adapterKind === "fake",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleTrustProject = useCallback(async () => {
    setTrusting(true);
    setTrustFailed(false);
    try {
      const response = await client.setTrust("run-roles");
      setTrust({ status: "ready", tier: response.trustTier });
    } catch {
      setTrustFailed(true);
    } finally {
      setTrusting(false);
    }
  }, [client]);

  const copyRootPath = useCallback(() => {
    if (!operator.rootPath) {
      return;
    }
    void navigator.clipboard?.writeText(operator.rootPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [operator.rootPath]);

  const trustLabel =
    trust.status === "ready"
      ? trust.tier === "read-only"
        ? t("manager.trustReadOnly")
        : trust.tier === "run-roles"
          ? t("manager.trustRunRoles")
          : t("manager.trustElevated")
      : t("common.loading");
  const isReadOnly = trust.status === "ready" && trust.tier === "read-only";

  // QuickStart's enter-room step is only actionable when worlds exist (it is
  // disabled at zero), so this always enters the first world at its call site.
  const enterFirstWorld = () => {
    const first = app.state.worlds[0];
    if (first) {
      void onEnterWorld(first.id);
    }
  };

  // Whether role turns would fall back to the fake runtime: no provider chosen
  // or the live runtime is the mock adapter. Inspection stays unblocked (DISC-4).
  const providerMissing = !operator.provider || operator.isMockRuntime;

  return (
    <main
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--realm-bg)]"
      data-testid="world-manager"
    >
      <WorldManagerHeader
        copied={copied}
        health={health}
        isError={app.state.status === "error"}
        onCopyRootPath={copyRootPath}
        onOpenSettings={onOpenSettings}
        operator={operator}
        projectName={app.state.projectName}
        trustLabel={trustLabel}
        worldCountLabel={t("workspace.worldCountLabel")(worldCount)}
      />

      <ScrollArea className="min-h-0 flex-1">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
          {isReadOnly ? (
            <div
              className="realm-rise flex flex-col gap-3 rounded-xl bg-[var(--realm-impersonate-soft)] p-4 sm:flex-row sm:items-center"
              data-testid="trust-banner"
            >
              <ShieldAlert className="size-5 shrink-0 text-[var(--realm-warning)]" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[14px] text-[var(--realm-fg)]">
                  {t("manager.trustBannerTitle")}
                </div>
                <p className="mt-0.5 text-[13px] text-[var(--realm-fg-muted)] leading-5">
                  {t("manager.trustBannerBody")}
                </p>
                {trustFailed ? (
                  <p
                    className="mt-1 text-[12px] text-[var(--realm-danger)]"
                    data-testid="trust-banner-error"
                  >
                    {t("manager.trustBannerError")}
                  </p>
                ) : null}
              </div>
              <Button
                className="h-9 shrink-0 rounded-lg px-4 text-[14px]"
                data-testid="trust-project"
                disabled={trusting}
                onClick={() => void handleTrustProject()}
                type="button"
              >
                {trusting ? t("manager.trustBannerPending") : t("manager.trustBannerAction")}
              </Button>
            </div>
          ) : null}

          {/* DISC-4: when no provider is configured (or the live runtime is the
           * mock adapter) role turns silently use the fake runtime. Surface a
           * calm attention row — same shape as the trust banner — with a direct
           * path to Settings. Project/world inspection stays fully unblocked. */}
          {providerMissing ? (
            <div
              className="realm-rise flex flex-col gap-3 rounded-xl bg-[var(--realm-impersonate-soft)] p-4 sm:flex-row sm:items-center"
              data-testid="provider-attention"
            >
              <PlugZap className="size-5 shrink-0 text-[var(--realm-warning)]" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[14px] text-[var(--realm-fg)]">
                  {t("manager.attentionTitle")}
                </div>
                <p className="mt-0.5 text-[13px] text-[var(--realm-fg-muted)] leading-5">
                  {t("manager.attentionProviderMissing")}
                </p>
              </div>
              <Button
                className="h-9 shrink-0 rounded-lg px-4 text-[14px]"
                data-testid="provider-attention-setup"
                onClick={onOpenSettings}
                type="button"
              >
                <PlugZap className="size-4" />
                {t("common.settings")}
              </Button>
            </div>
          ) : null}

          <section className="realm-rise flex flex-col rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="shrink-0 border-[var(--realm-line)] border-b p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate font-semibold text-[18px] text-[var(--realm-fg)]">
                    {t("common.worlds")}
                  </h1>
                  <p className="mt-0.5 truncate text-[13px] text-[var(--realm-fg-muted)]">
                    {t("manager.projectHint")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {/* Always-visible command-palette affordance with the platform
                   * shortcut hint, so the ⌘K/Ctrl K entry point is discoverable
                   * without docs (discoverability). */}
                  <Button
                    aria-keyshortcuts="Meta+K Control+K"
                    data-testid="manager-command-palette"
                    onClick={onOpenCommandPalette}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Command className="size-4" />
                    {t("common.command")}
                    <kbd className="ml-1 rounded bg-[var(--realm-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--realm-fg-muted)]">
                      {commandShortcutHint}
                    </kbd>
                  </Button>
                  <Button onClick={onAskAssistant} size="sm" type="button" variant="secondary">
                    <Bot className="size-4" />
                    {t("common.askAssistant")}
                  </Button>
                  {/* Import lands on the sheet's Import tab; Create World lands on
                   * the preset tab. Each label maps 1:1 to a distinct outcome —
                   * no two buttons fire the identical handler (mapping). */}
                  <Button
                    data-testid="import-existing-header"
                    onClick={() => onCreateWorld("import")}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <DownloadCloud className="size-4" />
                    {t("sheet.createWorld.tabImport")}
                  </Button>
                  <Button
                    data-testid="create-world-primary"
                    onClick={() => onCreateWorld("preset")}
                    size="sm"
                    type="button"
                  >
                    <Plus className="size-4" />
                    {t("manager.createWorld")}
                  </Button>
                </div>
              </div>
              <label
                className="flex h-9 items-center gap-2 rounded-md bg-[var(--realm-hover)] px-3"
                htmlFor="world-search"
              >
                <Search className="size-4 text-[var(--realm-fg-faint)]" />
                <span className="sr-only">{t("manager.searchWorlds")}</span>
                <Input
                  aria-label={t("manager.searchWorlds")}
                  className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  data-testid="world-search"
                  id="world-search"
                  name="world-search"
                  onChange={(event) => setWorldSearch(event.currentTarget.value)}
                  placeholder={t("manager.searchWorlds")}
                  value={worldSearch}
                />
              </label>
            </div>

            <div>
              {app.state.status === "loading" ? <WorldManagerSkeleton /> : null}
              {/* First-screen load failure. A transient boot-time blip must not
               * trap the user with no way out, so pair the message with an
               * in-app Reload. Any previously-loaded world rows still render
               * below, so a flaky reconnect does not blank the whole list. */}
              {app.state.status === "error" ? (
                <div
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  data-testid="world-manager-error"
                  role="alert"
                >
                  <AlertCircle className="size-5 shrink-0 text-[var(--realm-warning)]" />
                  <span className="min-w-0 flex-1 text-[var(--realm-fg-muted)] text-sm">
                    {app.state.error ?? t("common.error")}
                  </span>
                  <Button
                    className="h-9 shrink-0 rounded-lg px-4 text-[14px]"
                    data-testid="world-manager-error-reload"
                    onClick={() => void app.reload()}
                    type="button"
                    variant="secondary"
                  >
                    {t("common.reload")}
                  </Button>
                </div>
              ) : null}
              {app.state.status !== "loading" &&
              app.state.status !== "error" &&
              worldCount === 0 ? (
                <div className="p-10 text-center">
                  <div className="realm-breathe mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--realm-hover)]">
                    <FolderGit2 className="size-5 text-[var(--realm-fg-muted)]" />
                  </div>
                  <div className="font-medium">{t("manager.emptyTitle")}</div>
                  <div className="mt-1 text-[var(--realm-fg-muted)] text-sm">
                    {t("manager.emptyBody")}
                  </div>
                  {/* Empty-state copy promises "initialize OR import"; honor it
                   * with one primary (Create World → preset tab) and one
                   * secondary (Import → import tab) — each a distinct outcome
                   * (interaction.md: one primary + one secondary). */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      data-testid="create-world-empty"
                      onClick={() => onCreateWorld("preset")}
                      type="button"
                    >
                      <Plus className="size-4" />
                      {t("manager.createWorld")}
                    </Button>
                    <Button
                      data-testid="import-existing-empty"
                      onClick={() => onCreateWorld("import")}
                      type="button"
                      variant="secondary"
                    >
                      <DownloadCloud className="size-4" />
                      {t("sheet.createWorld.tabImport")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {app.state.status !== "loading" && worldCount > 0 && visibleWorlds.length === 0 ? (
                <div className="p-10 text-center" data-testid="world-search-empty">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--realm-hover)]">
                    <Search className="size-5 text-[var(--realm-fg-muted)]" />
                  </div>
                  <div className="font-medium">{t("manager.noSearchResults")}</div>
                </div>
              ) : null}
              {visibleWorlds.map((world) => (
                <button
                  className="realm-press grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-[var(--realm-line)] border-b px-4 py-4 text-left transition last:border-b-0 hover:bg-[var(--realm-hover)]"
                  data-testid={`world-row-${world.id}`}
                  key={world.id}
                  onClick={() => void onEnterWorld(world.id)}
                  type="button"
                >
                  <GroupAvatarGrid
                    label={world.name}
                    members={[
                      { id: "owner", label: t("common.boss") },
                      ...world.roleIds.map((roleId) => ({
                        id: roleId,
                        label:
                          app.state.roles.find((role) => role.id === roleId)?.displayName ?? roleId,
                      })),
                    ]}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-[15px] text-[var(--realm-fg)]">
                        {world.name}
                      </span>
                      {world.id === app.selectedWorld?.id ? (
                        <Badge className="border-transparent bg-[var(--realm-green-soft)] text-[var(--realm-green-text)]">
                          {t("common.active")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[var(--realm-fg-muted)] text-xs">
                      <Badge className="border-transparent bg-[var(--realm-hover)] px-1.5 py-0 font-normal text-[var(--realm-fg-muted)]">
                        {worldModeLabel(t, world.mode.type)}
                      </Badge>
                      <span className="truncate">
                        {world.roleIds.length} {t("common.roles")} · {t("workspace.allHands")}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[var(--realm-fg-muted)] text-sm">
                    <span className="hidden sm:inline">{t("common.enter")}</span>
                    <ArrowRight className="size-4 text-[var(--realm-fg-faint)]" />
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Quick-start gives the lower region purpose so a short world list
           * never leaves a dead white void (Boss: "远远不够"). */}
          <QuickStart
            onAddRole={onAskAssistant}
            onCreateWorld={() => onCreateWorld("preset")}
            onEnterRoom={enterFirstWorld}
            worldCount={worldCount}
          />
        </section>
      </ScrollArea>
    </main>
  );
}
