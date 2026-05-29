import { LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/index.tsx";
import { InspectorNotice, MetricLine, ProfileRows, SkillRow } from "./role-inspector-profile.tsx";
import { SubTabButton } from "./world-inspector-sheet.tsx";

type PolicyMatrix = Awaited<ReturnType<RealmAppController["client"]["getEffectivePolicy"]>>;

type RoleInspectorSheetProps = {
  app: RealmAppController;
  roleId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Seed the God controller with a role and open it. Threaded down so the
   * inspector's "Request adjudication" action lands operators on a pre-targeted
   * ruling sheet instead of a blank one.
   */
  onOpenGod?: (roleId?: string) => void;
  /**
   * Hand off to the shell-owned run-turn preview after staging this role. Lets
   * the inspector's "Run turn" reuse the one gated preview->confirm cycle every
   * other surface uses, instead of dead-ending after setRunRoleId.
   */
  onRequestRunTurn?: () => void;
};

export function RoleInspectorSheet({
  app,
  onOpenChange,
  onOpenGod,
  onRequestRunTurn,
  open,
  roleId,
}: RoleInspectorSheetProps) {
  const { t } = useI18n();
  const role = app.state.roles.find((candidate) => candidate.id === roleId);
  const [memory, setMemory] = useState<string | undefined>();
  const [policy, setPolicy] = useState<PolicyMatrix | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const selectedWorldId = app.selectedWorld?.id;
  const rolePolicy = useMemo(
    () =>
      policy?.roleWorlds.find(
        (entry) => entry.roleId === role?.id && entry.worldId === selectedWorldId,
      ),
    [policy?.roleWorlds, role?.id, selectedWorldId],
  );

  useEffect(() => {
    if (!open || !role || !selectedWorldId) {
      return;
    }
    let disposed = false;
    setLoading(true);
    setError(undefined);
    void Promise.all([
      app.client.readRoleMemory(selectedWorldId, role.id),
      app.client.getEffectivePolicy(),
    ])
      .then(([nextMemory, nextPolicy]) => {
        if (disposed) {
          return;
        }
        setMemory(nextMemory.content);
        setPolicy(nextPolicy);
      })
      .catch((error) => {
        if (!disposed) {
          setError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [app.client, open, role, selectedWorldId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[460px] max-w-[94vw] border-[var(--realm-line)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        data-testid="role-inspector-sheet"
      >
        <SheetHeader>
          <div className="flex items-center gap-3">
            {role ? (
              <IdentityAvatar
                identity={role.id}
                label={role.displayName}
                roles={app.state.roles}
                size="lg"
              />
            ) : null}
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {role?.displayName ?? t("workspace.inspect")}
              </SheetTitle>
              <SheetDescription className="truncate">
                {role
                  ? `${role.id} · ${role.model ?? t("common.default")}`
                  : t("workspace.noConversation")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        {!role ? (
          <div className="px-4 text-[13px] text-[var(--realm-fg-muted)]">
            {t("inspector.noRole")}
          </div>
        ) : (
          <Tabs className="px-4" defaultValue="memory">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger data-testid="role-inspector-memory-tab" value="memory">
                {t("inspector.memory")}
              </TabsTrigger>
              <TabsTrigger data-testid="role-inspector-capabilities-tab" value="capabilities">
                {t("inspector.capabilities")}
              </TabsTrigger>
              <TabsTrigger data-testid="role-inspector-profile-tab" value="profile">
                {t("inspector.profile")}
              </TabsTrigger>
            </TabsList>
            {error ? (
              <div className="mt-3 rounded-md bg-[#fff4e5] p-3 text-[#7a4a00] text-[12px]">
                <div className="font-medium">{t("inspector.loadFailed")}</div>
                <div>{error}</div>
              </div>
            ) : null}
            <TabsContent className="mt-4 space-y-3" value="memory">
              <MemoryTab loading={loading} memory={memory} />
            </TabsContent>
            <TabsContent className="mt-4 space-y-3" value="capabilities">
              <PolicySummary loading={loading} policy={policy} rolePolicy={rolePolicy} />
            </TabsContent>
            <TabsContent className="mt-4 space-y-3" value="profile">
              <ProfileRows
                app={app}
                onOpenChange={onOpenChange}
                onOpenGod={onOpenGod}
                onRequestRunTurn={onRequestRunTurn}
                role={role}
              />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Memory tab with progressive disclosure mirroring the world-state tab: a calm
 * summary (size + an explicit green role-private visibility chip) and readable
 * prose by default, with the raw memory text behind a "raw" sub-tab. Replaces
 * the old raw-<pre>-by-default treatment so the primary view stays legible.
 */
function MemoryTab({ loading, memory }: { loading: boolean; memory: string | undefined }) {
  const { t } = useI18n();
  const [layer, setLayer] = useState<"readable" | "raw">("readable");
  const trimmed = memory?.trim() ?? "";
  const size = trimmed.length;

  return (
    <div className="space-y-3" data-testid="role-memory-tab">
      <section
        className="space-y-2 rounded-[6px] bg-[#f7f7f8] p-3 text-[12px]"
        data-testid="role-memory-summary"
      >
        <div className="flex items-center gap-2">
          <ScrollText className="size-3.5 text-[#087a43]" />
          <span className="font-medium text-[#1f1f21]">{t("inspector.memoryScope")}</span>
          <Badge className="border-transparent bg-white text-[#555]" data-testid="role-memory-size">
            {t("inspector.memoryChars")(size)}
          </Badge>
        </div>
        <div className="text-[var(--realm-fg-muted)]">{t("inspector.memoryPortability")}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
          <span className="shrink-0">{t("inspector.visibleTo")}</span>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[#e8f6ee] px-1.5 py-0.5 text-[#087a43]"
            data-testid="role-memory-visibility"
          >
            <LockKeyhole className="size-3" />
            {t("inspector.memoryVisibilityPrivate")}
          </span>
        </div>
      </section>

      <div className="flex items-center gap-1 rounded-[6px] bg-[#f0f0f2] p-0.5 text-[12px]">
        <SubTabButton
          active={layer === "readable"}
          label={t("inspector.memoryReadable")}
          onClick={() => setLayer("readable")}
          testId="role-memory-subtab-readable"
        />
        <SubTabButton
          active={layer === "raw"}
          label={t("inspector.memoryRaw")}
          onClick={() => setLayer("raw")}
          testId="role-memory-subtab-raw"
        />
      </div>

      {layer === "readable" ? (
        <ScrollArea className="h-[300px] rounded-[6px] bg-[#f7f7f8]">
          <div
            className="whitespace-pre-wrap break-words p-3 text-[13px] leading-6 text-[#1f1f21]"
            data-testid="role-memory-content"
          >
            {loading ? (
              <span className="text-[var(--realm-fg-muted)]">{t("common.loading")}</span>
            ) : (
              trimmed || (
                <span className="text-[var(--realm-fg-muted)]">{t("inspector.emptyMemory")}</span>
              )
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="h-[300px] rounded-[6px] bg-[#f7f7f8]">
          <pre
            className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5"
            data-testid="role-memory-raw"
          >
            {loading ? t("common.loading") : trimmed || t("inspector.emptyMemory")}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}

function PolicySummary({
  loading,
  policy,
  rolePolicy,
}: {
  loading: boolean;
  policy: PolicyMatrix | undefined;
  rolePolicy: PolicyMatrix["roleWorlds"][number] | undefined;
}) {
  const { t } = useI18n();
  const deniedCapabilities = policy?.capabilities.filter((capability) => !capability.allow) ?? [];

  if (loading && !policy) {
    return <div className="text-[13px] text-[var(--realm-fg-muted)]">{t("common.loading")}</div>;
  }

  return (
    <>
      <InspectorNotice icon={<ShieldCheck className="size-4" />} title={t("inspector.trustTier")}>
        {policy?.trustTier ?? "-"}
      </InspectorNotice>
      <div className="space-y-2" data-testid="role-capability-summary">
        <MetricLine
          label={t("inspector.allowedSkills")}
          value={rolePolicy?.allowedSkills.length ?? 0}
        />
        <MetricLine
          label={t("inspector.deniedSkills")}
          value={rolePolicy?.deniedSkills.length ?? 0}
        />
        <MetricLine label={t("inspector.deniedCapabilities")} value={deniedCapabilities.length} />
      </div>
      <div className="space-y-2">
        {(rolePolicy?.allowedSkills ?? []).slice(0, 4).map((skill) => (
          <SkillRow key={skill.id} label={skill.name} tone="allow" value={skill.scope} />
        ))}
        {(rolePolicy?.deniedSkills ?? []).slice(0, 3).map((entry) => (
          <SkillRow
            key={entry.skill.id}
            label={entry.skill.name}
            tone="deny"
            value={entry.reason}
          />
        ))}
        {deniedCapabilities.slice(0, 3).map((capability) => (
          <SkillRow
            key={capability.capability}
            label={capability.capability}
            tone="deny"
            value={capability.remediation ?? capability.reason}
          />
        ))}
      </div>
    </>
  );
}
