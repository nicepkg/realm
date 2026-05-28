import { Activity, Braces, Clock3, Database, ShieldAlert } from "lucide-react";
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
import { describeTraceEvent, type TraceEvent } from "@/view-models/realm-view-model.ts";

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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger data-testid="world-inspector-state-tab" value="state">
            <Braces className="size-3.5" />
            {t("inspector.stateTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-events-tab" value="events">
            <Activity className="size-3.5" />
            {t("inspector.eventsTab")}
          </TabsTrigger>
          <TabsTrigger data-testid="world-inspector-access-tab" value="access">
            <ShieldAlert className="size-3.5" />
            {t("inspector.accessTab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3" value="state">
          <ScrollArea className="h-[300px] rounded-[6px] bg-[#f7f7f8]">
            <pre
              className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5"
              data-testid="world-state-json"
            >
              {formatStateSnapshot(app.state.worldState?.state)}
            </pre>
          </ScrollArea>
        </TabsContent>
        <TabsContent className="mt-3" value="events">
          <WorldEventTimeline app={app} />
        </TabsContent>
        <TabsContent className="mt-3" value="access">
          <AccessAuditTimeline events={app.traceEvents} />
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
    description: describeTraceEvent(event),
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
