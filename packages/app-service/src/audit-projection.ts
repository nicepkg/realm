import type { RealmEvent } from "@realm/core";

/**
 * Normalized audit timeline entry. Mirrors `auditEntrySchema` in
 * `@realm/api-contract` by structure; defined locally so app-service stays a
 * lower layer than the contract package (no upward dependency / cycle).
 */
export type AuditEntry = {
  id: string;
  kind: "audit" | "tool" | "state-patch" | "impersonation";
  actorId: string;
  action: string;
  target?: string;
  reason?: string;
  visibility?: string;
  denied: boolean;
  seq: number;
  createdAt: string;
};

/**
 * Project the raw event log into a normalized audit timeline. Surfaces the four
 * audit-relevant event kinds the inspector renders: identity impersonation,
 * tool calls, state patches, and generic audit records. Keeping this projection
 * in the service (not the UI) means a single source of truth for what counts as
 * "audited" and how visibility/denial are derived.
 */
export function projectAuditTimeline(events: readonly RealmEvent[]): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const event of events) {
    const entry = toAuditEntry(event);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

function toAuditEntry(event: RealmEvent): AuditEntry | undefined {
  if (event.type === "audit.created") {
    const isImpersonation = event.audit.action === "role.impersonate";
    return {
      id: event.eventId,
      kind: isImpersonation ? "impersonation" : "audit",
      actorId: event.audit.actorId,
      action: event.audit.action,
      target: event.audit.target,
      reason: event.audit.reason,
      visibility: isImpersonation ? event.audit.target : undefined,
      denied: event.audit.action.includes("denied"),
      seq: event.seq,
      createdAt: event.createdAt,
    };
  }
  if (event.type === "tool.called") {
    return {
      id: event.eventId,
      kind: "tool",
      actorId: event.traceId,
      action: `tool.${event.toolCall.status}`,
      target: event.toolCall.name,
      reason: event.toolCall.reason,
      denied: event.toolCall.status === "denied",
      seq: event.seq,
      createdAt: event.createdAt,
    };
  }
  if (event.type === "state.patch.committed") {
    return {
      id: event.eventId,
      kind: "state-patch",
      actorId: event.patch.actorId,
      action: "state.patch.committed",
      target: event.patch.worldId,
      reason: event.patch.reason,
      denied: false,
      seq: event.seq,
      createdAt: event.createdAt,
    };
  }
  return undefined;
}
