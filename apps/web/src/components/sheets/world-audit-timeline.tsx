import type { AuditEntry } from "@realm/api-contract";
import { Clock3, ShieldAlert, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/index.tsx";

type AuditFilter = "all" | "denials";

/**
 * Full audit timeline: impersonation, tool calls, state patches, and audits with
 * actor / target / visibility / timestamp. Fetched from the dedicated audits
 * endpoint so it is not capped by the 8-event trace slice. Keeps the denials
 * filter as a sub-view per interaction spec.
 */
export function WorldAuditTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<AuditFilter>("all");
  const worldId = app.selectedWorld?.id;

  useEffect(() => {
    if (!worldId) {
      return;
    }
    let cancelled = false;
    void app.client.listAudits(worldId).then((response) => {
      if (!cancelled) {
        setAudits(response.audits);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app.client, worldId]);

  const visible = filter === "denials" ? audits.filter((entry) => entry.denied) : audits;

  return (
    <div className="space-y-2" data-testid="world-audit-timeline">
      <div className="flex gap-2">
        <FilterButton
          active={filter === "all"}
          onClick={() => setFilter("all")}
          testId="audit-filter-all"
        >
          {t("inspector.auditAll")}
        </FilterButton>
        <FilterButton
          active={filter === "denials"}
          onClick={() => setFilter("denials")}
          testId="audit-filter-denials"
        >
          {t("inspector.auditDenialsOnly")}
        </FilterButton>
      </div>
      <ScrollArea className="h-[268px] rounded-[6px] bg-[#f7f7f8]">
        <div className="space-y-2 p-3">
          {visible.length === 0 ? (
            <div className="text-[13px] text-[var(--realm-fg-muted)]">
              {t("inspector.noAudits")}
            </div>
          ) : (
            visible.map((entry) => <AuditRow entry={entry} key={entry.id} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t } = useI18n();
  return (
    <article className="rounded-[6px] bg-white p-3 text-[12px]" data-testid="world-audit-row">
      <div className="flex items-center gap-2">
        <AuditIcon denied={entry.denied} kind={entry.kind} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {auditKindLabel(entry.kind, t)}: {entry.action}
        </span>
        <Badge className="border-transparent bg-[#f7f7f8] text-[#555]">#{entry.seq}</Badge>
      </div>
      <div className="mt-2 space-y-1 text-[var(--realm-fg-muted)]">
        <div>
          <span className="font-medium text-[#1f1f21]">{t("inspector.auditActor")}: </span>
          {entry.actorId}
        </div>
        {entry.target ? (
          <div>
            <span className="font-medium text-[#1f1f21]">{t("inspector.auditTarget")}: </span>
            {entry.target}
          </div>
        ) : null}
        {entry.visibility ? (
          <div>
            <span className="font-medium text-[#1f1f21]">{t("inspector.auditVisibility")}: </span>
            {entry.visibility}
          </div>
        ) : null}
        {entry.reason ? <div>{entry.reason}</div> : null}
      </div>
    </article>
  );
}

function AuditIcon({ denied, kind }: { denied: boolean; kind: AuditEntry["kind"] }) {
  if (denied) {
    return <ShieldAlert className="size-3.5 text-[#ff9500]" />;
  }
  if (kind === "impersonation") {
    return <UserCog className="size-3.5 text-[#087a43]" />;
  }
  return <Clock3 className="size-3.5 text-[#087a43]" />;
}

function FilterButton({
  active,
  children,
  onClick,
  testId,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={
        active
          ? "rounded-full bg-[#1f1f21] px-3 py-1 text-[12px] text-white"
          : "rounded-full bg-[#f0f0f2] px-3 py-1 text-[12px] text-[var(--realm-fg-muted)]"
      }
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function auditKindLabel(
  kind: AuditEntry["kind"],
  t: (
    key:
      | "inspector.auditKindImpersonation"
      | "inspector.auditKindTool"
      | "inspector.auditKindStatePatch"
      | "inspector.auditKindAudit",
  ) => string,
): string {
  if (kind === "impersonation") {
    return t("inspector.auditKindImpersonation");
  }
  if (kind === "tool") {
    return t("inspector.auditKindTool");
  }
  if (kind === "state-patch") {
    return t("inspector.auditKindStatePatch");
  }
  return t("inspector.auditKindAudit");
}
