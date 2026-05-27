import { randomUUID } from "node:crypto";
import type { Capability } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import { hashToken } from "./support.ts";

export type ExtensionAccessInput = {
  token: string | undefined;
  worldId?: string;
  roleId: string;
  capability: Extract<Capability, "state.query" | "memory.read" | "memory.write">;
  toolName: string;
  toolCallId?: string;
};

export type ExtensionAccessDecision =
  | { allow: true; scope: ExtensionSessionScope }
  | { allow: false; status: 401 | 403; reason: string };

export type ExtensionSessionScope = {
  worldId?: string;
  roleId: string;
  expiresAt?: Date;
};

export type ExtensionSessionToken = {
  token: string;
  tokenHash: string;
};

export type ExtensionAccessServiceOptions = {
  eventStore: EventStore;
  clock: () => Date;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class ExtensionAccessService {
  private readonly sessions = new Map<string, ExtensionSessionScope>();

  constructor(private readonly options: ExtensionAccessServiceOptions) {}

  registerStaticToken(scope: ExtensionSessionScope & { token: string }): void {
    this.sessions.set(hashToken(scope.token), {
      worldId: scope.worldId,
      roleId: scope.roleId,
      expiresAt: scope.expiresAt,
    });
  }

  createSession(scope: ExtensionSessionScope): ExtensionSessionToken {
    const token = `realm_ext_${randomUUID()}`;
    const tokenHash = hashToken(token);
    this.sessions.set(tokenHash, scope);
    return { token, tokenHash };
  }

  deleteSession(tokenHash: string): void {
    this.sessions.delete(tokenHash);
  }

  verifyAccess(input: ExtensionAccessInput): ExtensionAccessDecision {
    const deny = (status: 401 | 403, reason: string): ExtensionAccessDecision => {
      this.options.appendAudit({
        actorId: input.roleId,
        action: "extension.denied",
        target: input.toolName,
        reason,
      });
      if (input.toolCallId) {
        this.appendToolDenied(input.toolCallId, input.toolName, reason);
      }
      return { allow: false, status, reason };
    };

    if (!input.token) {
      return deny(401, "Missing Realm extension bearer token");
    }

    const scope = this.sessions.get(hashToken(input.token));
    if (!scope) {
      return deny(401, "Invalid Realm extension bearer token");
    }
    if (scope.expiresAt && scope.expiresAt.getTime() <= this.options.clock().getTime()) {
      return deny(401, "Expired Realm extension bearer token");
    }
    if (scope.roleId !== input.roleId) {
      return deny(403, `Token is scoped to role ${scope.roleId}, not ${input.roleId}`);
    }
    if (scope.worldId && input.worldId && scope.worldId !== input.worldId) {
      return deny(403, `Token is scoped to world ${scope.worldId}, not ${input.worldId}`);
    }

    try {
      this.options.assertAllowed(input.capability);
    } catch (error) {
      return deny(403, error instanceof Error ? error.message : String(error));
    }

    this.options.appendAudit({
      actorId: input.roleId,
      action: "extension.allowed",
      target: input.toolName,
      reason: `${input.capability} allowed`,
    });
    if (input.toolCallId) {
      this.appendToolCalled(input.toolCallId, input.toolName, "allowed");
    }
    return { allow: true, scope };
  }

  private appendToolDenied(toolCallId: string, toolName: string, reason: string): void {
    this.appendToolCalled(toolCallId, toolName, "denied", reason);
  }

  private appendToolCalled(
    toolCallId: string,
    toolName: string,
    status: "allowed" | "denied",
    reason?: string,
  ): void {
    this.options.eventStore.append({
      eventId: makeId("event:tool", randomUUID()),
      schemaVersion: 1,
      aggregateId: makeId("trace", toolCallId),
      correlationId: makeId("corr", toolCallId),
      createdAt: nowIso(this.options.clock()),
      type: "tool.called",
      traceId: makeId("trace", toolCallId),
      toolCall: {
        id: toolCallId,
        name: toolName,
        status,
        ...(reason ? { reason } : {}),
      },
    });
  }
}
