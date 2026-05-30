import type { RealmEvent } from "@realm/api-contract";
import { Activity, Braces, Clock3, Database, GitFork, ScrollText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
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
import { cn } from "@/lib/utils.ts";
import { describeTraceEvent, type TraceEvent } from "@/view-models/realm-view-model.ts";
import { humanizeFlatRows } from "@/view-models/state-humanize.ts";
import { WorldAuditTimeline } from "./world-audit-timeline.tsx";
import { WorldSimulationTab } from "./world-simulation-tab.tsx";

type AccessDenial = {
  id: string;
  reason: string;
  recoveryKey: "policy" | "token";
  source: "audit" | "tool";
  target: string;
};

export function WorldInspectorSheet({
  app,
  onOpenChange,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[520px] max-w-[94vw] border-[var(--realm-line)] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
        data-testid="world-inspector-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t("inspector.world")}</SheetTitle>
          <SheetDescription>{t("inspector.worldDescription")}</SheetDescription>
        </SheetHeader>
        <WorldInspectorContent app={app} />
      </SheetContent>
    </Sheet>
  );
}

export function WorldInspectorContent({ app }: { app: RealmAppController }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4 px-4" data-testid="world-inspector-content">
      <section className="grid grid-cols-2 gap-2 text-[12px]">
        <InspectorMetric label={t("common.project")} value={app.state.projectName} />
        <InspectorMetric label={t("common.world")} value={app.selectedWorld?.name ?? "-"} />
        <InspectorMetric label={t("common.room")} value={app.selectedRoom?.name ?? "-"} />
        <InspectorMetric
          label={t("inspector.stateVersion")}
          value={`v${app.state.worldState?.version ?? 0}`}
        />
      </section>
      <Tabs defaultValue="state">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger data-testid="world-inspector-state-tab" value="state">
            <Braces className="size-3.5" />
            {t("inspector.stateTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-events-tab" value="events">
            <Activity className="size-3.5" />
            {t("inspector.eventsTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-audit-tab" value="audit">
            <ScrollText className="size-3.5" />
            {t("inspector.auditTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-access-tab" value="access">
            <ShieldAlert className="size-3.5" />
            {t("inspector.accessTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-simulation-tab" value="simulation">
            <GitFork className="size-3.5" />
            {t("inspector.simulationTab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3" value="state">
          <WorldStateTab app={app} />
        </TabsContent>
        <TabsContent className="mt-3" value="events">
          <WorldEventTimeline app={app} />
        </TabsContent>
        <TabsContent className="mt-3" value="audit">
          <WorldAuditTimeline app={app} />
        </TabsContent>
        <TabsContent className="mt-3" value="access">
          <AccessAuditTimeline events={app.traceEvents} />
        </TabsContent>
        <TabsContent className="mt-3" value="simulation">
          <WorldSimulationTab app={app} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AccessAuditTimeline({ events }: { events: TraceEvent[] }) {
  const { t } = useI18n();
  const denials = accessDenialsForEvents(events);

  return (
    <ScrollArea className="h-[300px] rounded-[6px] bg-[#f7f7f8]">
      <div className="space-y-2 p-3" data-testid="world-access-audit">
        {denials.length === 0 ? (
          <div className="text-[13px] text-[var(--realm-fg-muted)]">
            {t("inspector.noAccessDenials")}
          </div>
        ) : (
          denials.map((denial) => (
            <article
              className="rounded-[6px] bg-white p-3 text-[12px]"
              data-testid="world-access-denial-row"
              key={denial.id}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-3.5 text-[#ff9500]" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {denial.source === "tool"
                    ? t("inspector.toolDenied")
                    : t("inspector.auditDenied")}
                  : {denial.target}
                </span>
                <Badge className="border-transparent bg-[#fff4e5] text-[#7a4a00]">
                  {t("inspector.denied")}
                </Badge>
              </div>
              <div className="mt-2 text-[var(--realm-fg-muted)]">
                <span className="font-medium text-[#1f1f21]">{t("inspector.reason")}: </span>
                {denial.reason}
              </div>
              <div className="mt-2 rounded-[5px] bg-[#f7f7f8] p-2 text-[var(--realm-fg-muted)]">
                <span className="font-medium text-[#1f1f21]">{t("inspector.recovery")}: </span>
                {denial.recoveryKey === "token"
                  ? t("inspector.recoveryToken")
                  : t("inspector.recoveryPolicy")}
              </div>
            </article>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

export function accessDenialsForEvents(events: TraceEvent[]): AccessDenial[] {
  return events.flatMap((event): AccessDenial[] => {
    if (event.type === "tool.called" && event.toolCall.status === "denied") {
      return [
        {
          id: event.eventId,
          reason: event.toolCall.reason ?? "Denied by host/runtime policy",
          recoveryKey: recoveryKeyForReason(event.toolCall.reason),
          source: "tool",
          target: event.toolCall.name,
        },
      ];
    }
    if (event.type === "audit.created" && isDeniedAudit(event.audit.action)) {
      return [
        {
          id: event.eventId,
          reason: event.audit.reason ?? event.audit.action,
          recoveryKey: recoveryKeyForReason(event.audit.reason),
          source: "audit",
          target: event.audit.target ?? event.audit.action,
        },
      ];
    }
    return [];
  });
}

export function WorldEventTimeline({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const traceEvents = app.traceEvents.map((event) => ({
    description: describeTraceEvent(event, t),
    event,
  }));

  return (
    <ScrollArea className="h-[300px] rounded-[6px] bg-[#f7f7f8]">
      <div className="space-y-2 p-3" data-testid="world-event-timeline">
        {traceEvents.length === 0 ? (
          <div className="text-[13px] text-[var(--realm-fg-muted)]">{t("inspector.noEvents")}</div>
        ) : (
          traceEvents.map(({ description, event }) => (
            <article
              className="rounded-[6px] bg-white p-3 text-[12px]"
              data-testid="world-event-row"
              key={event.eventId}
            >
              <div className="flex items-center gap-2">
                <Clock3 className="size-3.5 text-[#087a43]" />
                <span className="min-w-0 flex-1 truncate font-medium">{description.title}</span>
                <Badge className="border-transparent bg-[#f7f7f8] text-[#555]">#{event.seq}</Badge>
              </div>
              <div className="mt-2 line-clamp-2 text-[var(--realm-fg-muted)]">
                {description.body}
              </div>
            </article>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * The State tab uses progressive disclosure across three layers so the inspector
 * stays calm: (1) a human "what/why changed" summary plus an explicit Visible-to
 * chip, (2) a flattened, scannable key -> value table of the world state, and
 * (3) the raw JSON behind a segmented sub-tab for power users. World state is
 * `publicState`, so it is visible to everyone in the world.
 *
 * The table is HUMANIZED through the shared `humanizeFlatRows` primitive — the SAME
 * one the desktop inspect chat card uses — so a role id never leaks raw here while
 * showing its display name there (顾辰风 vs guchenfeng), a boolean reads 禁言：是
 * not `true`, and an empty object never renders `[object Object]`. The raw-JSON
 * sub-tab keeps the unhumanized values for power users.
 */
export function WorldStateTab({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  const [layer, setLayer] = useState<"table" | "raw">("table");
  const state = app.state.worldState?.state;
  const version = app.state.worldState?.version ?? 0;
  const reason = whyStateChanged(app.state.events);
  // Build the id → displayName map exactly as `answerWorldState` does (god-chat-
  // inspect), so both surfaces resolve role-id segments/values identically.
  const roleNames = new Map(app.state.roles.map((role) => [role.id, role.displayName]));
  const rows = humanizeFlatRows(state, roleNames);

  return (
    <div className="space-y-3" data-testid="world-state-tab">
      <section
        className="space-y-2 rounded-[6px] bg-[#f7f7f8] p-3 text-[12px]"
        data-testid="state-layer-summary"
      >
        <div className="flex items-center gap-2">
          <Braces className="size-3.5 text-[#087a43]" />
          <span className="font-medium text-[#1f1f21]">{t("inspector.stateVersion")}</span>
          <Badge className="border-transparent bg-white text-[#555]">v{version}</Badge>
        </div>
        <div className="text-[var(--realm-fg-muted)]">
          <span className="font-medium text-[#1f1f21]">{t("inspector.whyChanged")}: </span>
          {reason ?? "—"}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
          <span className="shrink-0">{t("inspector.visibleTo")}</span>
          <span className="rounded-full bg-[#e8f6ee] px-1.5 py-0.5 text-[#087a43]">
            {t("common.world")}
          </span>
        </div>
      </section>

      <div className="flex items-center gap-1 rounded-[6px] bg-[#f0f0f2] p-0.5 text-[12px]">
        <SubTabButton
          active={layer === "table"}
          label={t("inspector.stateTab")}
          onClick={() => setLayer("table")}
          testId="world-state-subtab-table"
        />
        <SubTabButton
          active={layer === "raw"}
          label={t("inspector.rawJson")}
          onClick={() => setLayer("raw")}
          testId="world-state-subtab-raw"
        />
      </div>

      {layer === "table" ? (
        <ScrollArea className="h-[232px] rounded-[6px] bg-[#f7f7f8]">
          <div className="p-2" data-testid="state-layer-table">
            {rows.length === 0 ? (
              <div className="p-2 text-[13px] text-[var(--realm-fg-muted)]">
                {t("inspector.stateSnapshot")}: {"{}"}
              </div>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  {rows.map((row) => (
                    <tr
                      className="align-top [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-[var(--realm-line)]"
                      data-testid="world-state-row"
                      key={row.key}
                    >
                      <td className="w-2/5 py-1.5 pr-3 font-mono text-[var(--realm-fg-muted)]">
                        {row.key}
                      </td>
                      <td className="break-words py-1.5 font-mono text-[#1f1f21]">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="h-[232px] rounded-[6px] bg-[#f7f7f8]">
          <pre
            className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5"
            data-testid="state-layer-raw"
          >
            {formatStateSnapshot(state)}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}

export function SubTabButton({
  active,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={cn(
        "flex-1 rounded-[5px] px-2 py-1 font-medium transition-colors",
        active ? "bg-white text-[#1f1f21] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6e6e73]",
      )}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

/**
 * Derives the human "why changed" line from the latest state-affecting event in
 * the event log. Prefers a committed state patch (carries an explicit reason and
 * actor), then a triggered world event. Returns undefined when no source exists
 * so the summary renders a neutral em-dash instead of fabricating a cause.
 */
export function whyStateChanged(events: RealmEvent[] = []): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    if (event.type === "state.patch.committed") {
      return `${event.patch.reason} · ${event.patch.actorId}`;
    }
    if (event.type === "world.event.triggered") {
      return `${event.event.title} · ${event.event.kind}`;
    }
  }
  return undefined;
}

export function formatStateSnapshot(state: Record<string, unknown> | undefined): string {
  if (!state) {
    return "{}";
  }
  return JSON.stringify(state, null, 2);
}

function InspectorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] bg-[#f7f7f8] p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--realm-fg-muted)]">
        <Database className="size-3" />
        {label}
      </div>
      <div className="mt-1 truncate font-medium text-[#1f1f21]">{value}</div>
    </div>
  );
}

function isDeniedAudit(action: string): boolean {
  return action.includes("denied");
}

function recoveryKeyForReason(reason: string | undefined): AccessDenial["recoveryKey"] {
  const normalized = reason?.toLowerCase() ?? "";
  if (normalized.includes("bearer token") || normalized.includes("token is scoped")) {
    return "token";
  }
  return "policy";
}
