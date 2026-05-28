import { skillScopeSchema, skillSourceSchema } from "@realm/config/schemas";
import { capabilitySchema } from "@realm/core";
import { z } from "zod";

/** Identity of a skill as resolved by the policy/visibility layer. */
export const policySkillIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scope: skillScopeSchema,
  source: skillSourceSchema,
  roleId: z.string().min(1).optional(),
  worldId: z.string().min(1).optional(),
  relativePath: z.string().min(1),
  path: z.string().min(1),
  contentHash: z.string().min(1),
});

/** Effective capability + skill policy matrix for the current trust tier. */
export const effectivePolicyResponseSchema = z.object({
  trustTier: z.enum(["read-only", "run-roles", "elevated-tools"]),
  capabilities: z.array(
    z.object({
      capability: capabilitySchema,
      allow: z.boolean(),
      reason: z.string().min(1),
      remediation: z.string().optional(),
      auditLevel: z.enum(["none", "standard", "high"]).optional(),
      highRisk: z.boolean(),
    }),
  ),
  roleWorlds: z.array(
    z.object({
      worldId: z.string().min(1),
      roleId: z.string().min(1),
      allowedSkills: z.array(policySkillIdentitySchema),
      deniedSkills: z.array(
        z.object({
          skill: policySkillIdentitySchema,
          reason: z.string().min(1),
          pattern: z.string().min(1).optional(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string().min(1)),
});
