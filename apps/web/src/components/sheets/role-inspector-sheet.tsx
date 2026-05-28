import type { RoleSummary } from "@realm/api-contract";
import { AlertCircle, CheckCircle2, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { IdentityAvatar } from "@/components/messenger/messenger-primitives.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/index.tsx";

type PolicyMatrix = Awaited<ReturnType<RealmAppController["client"]["getEffectivePolicy"]>>;

type RoleInspectorSheetProps = {
  app: RealmAppController;
  roleId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RoleInspectorSheet({ app, onOpenChange, open, roleId }: RoleInspectorSheetProps) {
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
              <InspectorNotice
                icon={<ScrollText className="size-4" />}
                title={t("inspector.memoryScope")}
              >
                {t("inspector.memoryPortability")}
              </InspectorNotice>
              <pre
                className="max-h-[360px] overflow-auto rounded-[6px] bg-[#f7f7f8] p-3 text-[12px] leading-5"
                data-testid="role-memory-content"
              >
                {loading ? t("common.loading") : memory?.trim() || t("inspector.emptyMemory")}
              </pre>
            </TabsContent>
            <TabsContent className="mt-4 space-y-3" value="capabilities">
              <PolicySummary loading={loading} policy={policy} rolePolicy={rolePolicy} />
            </TabsContent>
            <TabsContent className="mt-4 space-y-3" value="profile">
              <ProfileRows app={app} role={role} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
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

function ProfileRows({ app, role }: { app: RealmAppController; role: RoleSummary }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2" data-testid="role-profile-summary">
      <MetricLine label={t("common.world")} value={app.selectedWorld?.name ?? "-"} />
      <MetricLine label={t("common.room")} value={app.selectedRoom?.name ?? "-"} />
      <MetricLine label={t("inspector.roleId")} value={role.id} />
      <MetricLine label={t("inspector.model")} value={role.model ?? t("common.default")} />
      <Button
        className="mt-2 w-full"
        onClick={() => app.setIdentity(role.id)}
        type="button"
        variant={app.identity === role.id ? "default" : "secondary"}
      >
        {app.identity === role.id ? t("common.active") : t("workspace.takeOver")}
      </Button>
    </div>
  );
}

function InspectorNotice({
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

function MetricLine({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded-[6px] bg-[#f7f7f8] px-3 py-2 text-[13px]">
      <span className="text-[var(--realm-fg-muted)]">{label}</span>
      <span className="truncate pl-4 font-medium text-[#1f1f21]">{value}</span>
    </div>
  );
}

function SkillRow({
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
