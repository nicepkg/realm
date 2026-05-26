import type { RealmHttpClient } from "@realm/client-sdk";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PanelTitle } from "./realm-atoms.tsx";

type EffectivePolicy = Awaited<ReturnType<RealmHttpClient["getEffectivePolicy"]>>;

export function PolicyMatrixPanel({ policy }: { policy: EffectivePolicy | undefined }) {
  if (!policy) {
    return null;
  }
  const deniedHighRisk = policy.capabilities.filter((item) => item.highRisk && !item.allow);
  const allowedHighRisk = policy.capabilities.filter((item) => item.highRisk && item.allow);
  return (
    <section className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <PanelTitle icon={<ShieldCheck size={15} aria-hidden="true" />} title="Effective Policy" />
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <Badge tone="neutral">trust: {policy.trustTier}</Badge>
        <Badge tone={allowedHighRisk.length > 0 ? "danger" : "ok"}>
          high risk on: {allowedHighRisk.length}
        </Badge>
        <Badge tone="neutral">high risk blocked: {deniedHighRisk.length}</Badge>
      </div>
      {policy.warnings.length > 0 ? (
        <div className="mt-3 space-y-1">
          {policy.warnings.map((warning) => (
            <div key={warning} className="flex gap-2 text-[11px] text-realm-warning">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        <div className="font-medium text-xs text-zinc-700">Capabilities</div>
        {policy.capabilities.map((item) => (
          <div
            key={item.capability}
            className="flex items-center justify-between gap-2 border-realm-border border-t py-1.5 text-xs"
          >
            <span className={item.highRisk ? "text-realm-warning" : "text-zinc-700"}>
              {item.capability}
            </span>
            <Badge tone={item.allow ? "ok" : "danger"}>{item.allow ? "allowed" : "denied"}</Badge>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <div className="font-medium text-xs text-zinc-700">Role Skills</div>
        {policy.roleWorlds.map((entry) => (
          <div
            key={`${entry.worldId}:${entry.roleId}`}
            className="border-realm-border border-t py-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{entry.roleId}</span>
              <span className="truncate text-zinc-500">{entry.worldId}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {entry.allowedSkills.length} allowed, {entry.deniedSkills.length} denied
            </div>
            {entry.deniedSkills.slice(0, 3).map((denial) => (
              <div key={denial.skill.id} className="mt-1 text-[11px] text-realm-danger">
                {denial.skill.id}: {denial.reason}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "danger" | "neutral" | "ok" }) {
  const className =
    tone === "ok"
      ? "bg-emerald-50 text-realm-primary"
      : tone === "danger"
        ? "bg-red-50 text-realm-danger"
        : "bg-zinc-100 text-zinc-600";
  return <span className={`rounded px-1.5 py-0.5 ${className}`}>{children}</span>;
}
