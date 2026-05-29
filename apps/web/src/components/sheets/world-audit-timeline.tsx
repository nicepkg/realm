import type { AuditEntry } from "@realm/api-contract";
import { Clock3, ShieldAlert, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/index.tsx";

type AuditFilter = "all" | "denials";
const SKELETON_ROWS = [0, 1, 2];

/**
 * Full audit timeline: impersonation, tool calls, state patches, and audits with
 * actor / target / visibility / timestamp. Fetched from the dedicated audits
 * endpoint so it is not capped by the 8-event trace slice. Keeps the denials
 * filter as a sub-view per interaction spec.
 *
 * The fetch runs through three explicit, distinct states — loading / error /
 * loaded — so the empty "暂无审计" message is only shown when the request truly
 * succeeded with zero rows, never as a default before resolution or after a
 * swallowed failure. Mirrors the loading/error pattern in role-inspector-sheet.
 */
export function WorldAuditTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<AuditFilter>("all");
  // Default to loading so the very first paint shows placeholders, not a false
  // empty state, before listAudits resolves.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const worldId = app.selectedWorld?.id;
  const client = app.client;

  // Extracted so the Retry button can re-run the same fetch. The `cancelled`
  // ref is owned by the caller (the effect) so a stale in-flight request never
  // writes state after the world changes or the component unmounts.
  const fetchAudits = useCallback(
    (isCancelled: () => boolean) => {
      if (!worldId) {
        return;
      }
      setLoading(true);
      setError(undefined);
      void client
        .listAudits(worldId)
        .then((response) => {
          if (!isCancelled()) {
            setAudits(response.audits);
            setLoading(false);
          }
        })
        .catch((cause: unknown) => {
          if (!isCancelled()) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setLoading(false);
          }
        });
    },
    [client, worldId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchAudits(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAudits]);

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
          {loading ? (
            <AuditSkeleton />
          ) : error ? (
            <AuditError
              message={error}
              // A manual retry always commits its own result — there is no
              // newer caller to invalidate it, so it is never cancelled.
              onRetry={() => fetchAudits(() => false)}
            />
          ) : visible.length === 0 ? (
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

function AuditSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-2" data-testid="world-audit-loading">
      <span className="sr-only">{t("common.loading")}</span>
      {SKELETON_ROWS.map((row) => (
        <div className="rounded-[6px] bg-white p-3" key={row}>
          <div className="h-3 w-1/2 animate-pulse rounded bg-[#ececef] motion-reduce:animate-none" />
          <div className="mt-2 h-2.5 w-3/4 animate-pulse rounded bg-[#f0f0f2] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function AuditError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="space-y-2 rounded-md bg-[var(--realm-impersonate-soft)] p-3 text-[#7a4a00] text-[13px]"
      data-testid="world-audit-error"
      role="alert"
    >
      <div className="font-medium">{t("common.error")}</div>
      <div className="break-words">{message}</div>
      <Button data-testid="world-audit-retry" onClick={onRetry} size="sm" type="button">
        {t("common.retry")}
      </Button>
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
