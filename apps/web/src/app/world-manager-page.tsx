import {
  AlertCircle,
  ArrowRight,
  Bot,
  CircleDot,
  FolderGit2,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GroupAvatarGrid } from "@/components/messenger/messenger-primitives.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/index.tsx";
import { filterWorldsForManager } from "@/view-models/world-manager-view-model.ts";
import type { RealmAppController } from "./types.ts";

type TrustTier = "read-only" | "run-roles" | "elevated-tools";

/** Local trust state for the World Manager attention banner. */
type TrustState =
  | { status: "loading" }
  | { status: "ready"; tier: TrustTier }
  | { status: "error" };

export function WorldManagerPage({
  app,
  onAskAssistant,
  onCreateWorld,
  onEnterWorld,
  onOpenSettings,
}: {
  app: RealmAppController;
  onAskAssistant: () => void;
  onCreateWorld: () => void;
  onEnterWorld: (worldId: string) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const { client } = app;
  const worldCount = app.state.worlds.length;
  const [worldSearch, setWorldSearch] = useState("");
  const visibleWorlds = filterWorldsForManager(app.state.worlds, app.state.roles, worldSearch);
  const health = app.state.status === "error" ? t("manager.healthAttention") : t("common.ready");

  const [trust, setTrust] = useState<TrustState>({ status: "loading" });
  const [trusting, setTrusting] = useState(false);
  const [trustFailed, setTrustFailed] = useState(false);

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

  const trustLabel =
    trust.status === "ready"
      ? trust.tier === "read-only"
        ? t("manager.trustReadOnly")
        : trust.tier === "run-roles"
          ? t("manager.trustRunRoles")
          : t("manager.trustElevated")
      : t("common.loading");
  const isReadOnly = trust.status === "ready" && trust.tier === "read-only";

  return (
    <main
      className="flex h-screen max-h-screen flex-col overflow-hidden bg-[#f5f5f7]"
      data-testid="world-manager"
    >
      <header className="shrink-0 border-[var(--realm-line)] border-b bg-white/90">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FolderGit2 className="size-4 shrink-0 text-[#6e6e73]" />
            <span className="truncate font-medium text-[#1d1d1f] text-[13px]">
              {app.state.projectName}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="hidden items-center gap-1 text-[#6e6e73] sm:inline-flex">
              <CircleDot className="size-3 text-[#6e6e73]" />
              {health}
            </span>
            <span className="hidden items-center gap-1 text-[#6e6e73] sm:inline-flex">
              {t("manager.trustStatus")}: <span className="text-[#1d1d1f]">{trustLabel}</span>
            </span>
            <Badge className="border-transparent bg-[#f0f0f2] text-[#6e6e73]">
              {t("workspace.worldCountLabel")(worldCount)}
            </Badge>
            <Button
              aria-label={t("common.settings")}
              className="size-8"
              onClick={onOpenSettings}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
        {isReadOnly ? (
          <div
            className="flex shrink-0 flex-col gap-3 rounded-lg bg-[#fff4e5] p-4 sm:flex-row sm:items-center"
            data-testid="trust-banner"
          >
            <ShieldAlert className="size-5 shrink-0 text-[#ff9500]" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[#1d1d1f] text-[14px]">
                {t("manager.trustBannerTitle")}
              </div>
              <p className="mt-0.5 text-[#6e6e73] text-[13px] leading-5">
                {t("manager.trustBannerBody")}
              </p>
              {trustFailed ? (
                <p className="mt-1 text-[#ff3b30] text-[12px]" data-testid="trust-banner-error">
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

        <section className="flex min-h-0 flex-1 flex-col rounded-lg bg-white">
          <div className="shrink-0 border-[var(--realm-line)] border-b p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-semibold text-[#1d1d1f] text-[18px]">
                  {t("common.worlds")}
                </h1>
                <p className="mt-0.5 truncate text-[#6e6e73] text-[13px]">
                  {t("manager.projectHint")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button onClick={onAskAssistant} size="sm" type="button" variant="secondary">
                  <Bot className="size-4" />
                  {t("common.askAssistant")}
                </Button>
                <Button
                  data-testid="create-world-primary"
                  onClick={onCreateWorld}
                  size="sm"
                  type="button"
                >
                  <Plus className="size-4" />
                  {t("manager.createWorld")}
                </Button>
              </div>
            </div>
            <label
              className="flex h-9 items-center gap-2 rounded-md bg-[#f0f0f2] px-3"
              htmlFor="world-search"
            >
              <Search className="size-4 text-[#a1a1a6]" />
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

          <ScrollArea className="min-h-0 flex-1">
            <div>
              {app.state.status === "loading" ? <WorldManagerSkeleton /> : null}
              {app.state.status === "error" ? (
                <div className="flex items-center gap-3 border-[var(--realm-line)] border-b p-4 text-[#6e6e73]">
                  <AlertCircle className="size-5 text-[#ff9500]" />
                  <span className="text-sm">{app.state.error ?? t("common.error")}</span>
                </div>
              ) : null}
              {app.state.status !== "loading" && worldCount === 0 ? (
                <div className="p-10 text-center">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-lg bg-[#f0f0f2]">
                    <FolderGit2 className="size-5 text-[#6e6e73]" />
                  </div>
                  <div className="font-medium">{t("manager.emptyTitle")}</div>
                  <div className="mt-1 text-[#6e6e73] text-sm">{t("manager.emptyBody")}</div>
                  <Button className="mt-5" onClick={onCreateWorld} type="button">
                    <Plus className="size-4" />
                    {t("manager.createWorld")}
                  </Button>
                </div>
              ) : null}
              {app.state.status !== "loading" && worldCount > 0 && visibleWorlds.length === 0 ? (
                <div className="p-10 text-center" data-testid="world-search-empty">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-lg bg-[#f0f0f2]">
                    <Search className="size-5 text-[#6e6e73]" />
                  </div>
                  <div className="font-medium">{t("manager.noSearchResults")}</div>
                </div>
              ) : null}
              {visibleWorlds.map((world) => (
                <button
                  className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-[var(--realm-line)] border-b px-4 py-4 text-left transition hover:bg-[#f5f5f7]"
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
                      <span className="truncate font-medium text-[#1d1d1f] text-[15px]">
                        {world.name}
                      </span>
                      {world.id === app.selectedWorld?.id ? (
                        <Badge className="border-transparent bg-[#f0f0f2] text-[#6e6e73]">
                          {t("common.active")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[#6e6e73] text-xs">
                      <MessageCircle className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {world.mode.type} · {world.roleIds.length} {t("common.roles")} ·{" "}
                        {t("manager.defaultRoom")} {world.defaultRoomId}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[#6e6e73] text-sm">
                    {t("common.enter")} <ArrowRight className="size-4 text-[#a1a1a6]" />
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </section>
      </section>
    </main>
  );
}

function WorldManagerSkeleton() {
  return (
    <div className="space-y-0">
      {["one", "two", "three"].map((item) => (
        <div
          className="grid grid-cols-[44px_minmax(0,1fr)_80px] items-center gap-3 px-3 py-3"
          key={item}
        >
          <Skeleton className="size-11 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
