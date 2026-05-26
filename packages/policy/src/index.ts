import type { Capability, Principal } from "@realm/core";
import { capabilitySchema } from "@realm/core";

export type TrustTier = "read-only" | "run-roles" | "elevated-tools";

export type PolicyContext = {
  principal: Principal;
  capability: Capability;
  trustTier: TrustTier;
  allowedCapabilities: readonly Capability[];
  deniedCapabilities?: readonly Capability[];
};

export type PolicyDecision =
  | { allow: true; reason: string; auditLevel: "none" | "standard" | "high" }
  | { allow: false; reason: string; remediation?: string };

export const HIGH_RISK_CAPABILITIES = new Set<Capability>([
  "fs.project.write",
  "shell.run",
  "network.fetch",
  "model.configure",
  "config.write",
]);

export function isHighRiskCapability(capability: Capability): boolean {
  return HIGH_RISK_CAPABILITIES.has(capability);
}

const RUN_ROLE_CAPABILITIES = new Set<Capability>([
  "message.send",
  "room.create",
  "turn.run",
  "state.query",
  "state.patch.propose",
  "state.patch.admin",
  "memory.read",
  "memory.write",
  "fs.project.read",
  "trace.read",
  "config.read",
  "role.impersonate",
  "role.create",
  "world.create",
  "god.admin",
]);

export class CapabilityPolicy {
  decide(context: PolicyContext): PolicyDecision {
    capabilitySchema.parse(context.capability);

    if (context.deniedCapabilities?.includes(context.capability)) {
      return {
        allow: false,
        reason: `${context.capability} is explicitly denied`,
        remediation: "Remove the deny rule or choose a safer action.",
      };
    }

    if (!context.allowedCapabilities.includes(context.capability)) {
      return {
        allow: false,
        reason: `${context.capability} is not in the allowlist`,
        remediation: "Add the capability to the role or world allowlist.",
      };
    }

    if (context.trustTier === "read-only" && context.capability !== "config.read") {
      return {
        allow: false,
        reason: "Project is trusted for read-only inspection only",
        remediation: "Raise the project trust tier to run roles or elevated tools.",
      };
    }

    if (context.trustTier === "run-roles" && HIGH_RISK_CAPABILITIES.has(context.capability)) {
      return {
        allow: false,
        reason: `${context.capability} requires elevated tool trust`,
        remediation: "Raise the trust tier and enable the capability explicitly.",
      };
    }

    if (context.trustTier === "run-roles" && !RUN_ROLE_CAPABILITIES.has(context.capability)) {
      return {
        allow: false,
        reason: `${context.capability} is not available in run-roles trust tier`,
        remediation: "Use an elevated trust tier or a lower-risk capability.",
      };
    }

    return {
      allow: true,
      reason: `${context.capability} allowed`,
      auditLevel: HIGH_RISK_CAPABILITIES.has(context.capability) ? "high" : "standard",
    };
  }
}
