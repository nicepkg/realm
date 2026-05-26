import { randomUUID } from "node:crypto";
import type { Capability } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import { CapabilityPolicy, type TrustTier } from "@realm/policy";
import type { EventStore } from "@realm/storage";
import { DEFAULT_ALLOWED_CAPABILITIES, OWNER_ID } from "./support.ts";

export type AppendAuditInput = {
  actorId: string;
  action: string;
  target: string;
  reason: string;
};

export class ServicePolicyGate {
  private readonly policy = new CapabilityPolicy();

  constructor(
    private readonly input: {
      eventStore: EventStore;
      trustTier: TrustTier;
      clock: () => Date;
    },
  ) {}

  appendAudit(input: AppendAuditInput): void {
    const createdAt = nowIso(this.input.clock());
    this.input.eventStore.append({
      eventId: makeId("event:audit", randomUUID()),
      schemaVersion: 1,
      aggregateId: "audit",
      createdAt,
      type: "audit.created",
      audit: {
        id: makeId("audit", randomUUID()),
        actorId: input.actorId,
        action: input.action,
        target: input.target,
        reason: input.reason,
        createdAt,
      },
    });
  }

  assertAllowed(capability: Capability): void {
    const decision = this.policy.decide({
      principal: { id: OWNER_ID, kind: "owner" },
      capability,
      trustTier: this.input.trustTier,
      allowedCapabilities: DEFAULT_ALLOWED_CAPABILITIES,
    });

    if (!decision.allow) {
      this.appendAudit({
        actorId: OWNER_ID,
        action: "policy.denied",
        target: capability,
        reason: decision.reason,
      });
      throw new Error(
        decision.remediation ? `${decision.reason}. ${decision.remediation}` : decision.reason,
      );
    }
  }
}
