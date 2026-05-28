import {
  compileCallableSkillPolicy,
  loadProjectConfig,
  loadRoleConfigs,
  loadWorldConfigs,
  type ProjectConfig,
  type SkillIdentity,
} from "@realm/config";
import {
  type Capability,
  capabilitySchema,
  type RoleSummary,
  type WorldSummary,
} from "@realm/core";
import { CapabilityPolicy, isHighRiskCapability, type TrustTier } from "@realm/policy";
import { DEFAULT_ALLOWED_CAPABILITIES, humanizeId } from "./support.ts";

export type EffectivePolicyMatrix = {
  trustTier: TrustTier;
  capabilities: Array<{
    capability: Capability;
    allow: boolean;
    reason: string;
    remediation?: string;
    auditLevel?: "none" | "standard" | "high";
    highRisk: boolean;
  }>;
  roleWorlds: Array<{
    worldId: string;
    roleId: string;
    allowedSkills: SkillIdentity[];
    deniedSkills: Array<{ skill: SkillIdentity; reason: string; pattern?: string }>;
  }>;
  warnings: string[];
};

export class ConfigQueryService {
  constructor(
    private readonly root: string,
    private readonly options: {
      env?: NodeJS.ProcessEnv;
      trustTier: TrustTier;
    },
  ) {}

  async getProject(): Promise<{ root: string; name: string; defaultWorldId: string }> {
    const config = await loadProjectConfig(this.root);
    return {
      root: this.root,
      name: config.project.name,
      defaultWorldId: config.defaults.world,
    };
  }

  async getConfigStatus(): Promise<{ ok: boolean; errors: string[] }> {
    try {
      await loadProjectConfig(this.root);
      await loadWorldConfigs(this.root);
      await loadRoleConfigs(this.root);
      return { ok: true, errors: [] };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async getEffectiveConfig(): Promise<{
    project: Awaited<ReturnType<ConfigQueryService["getProject"]>>;
    worlds: WorldSummary[];
    roles: RoleSummary[];
  }> {
    return {
      project: await this.getProject(),
      worlds: await this.listWorlds(),
      roles: await this.listRoles(),
    };
  }

  async getEffectivePolicy(): Promise<EffectivePolicyMatrix> {
    const [project, worlds] = await Promise.all([
      loadProjectConfig(this.root),
      loadWorldConfigs(this.root),
    ]);
    const allowedCapabilities = effectiveAllowedCapabilities(project);
    const policy = new CapabilityPolicy();
    const capabilities = capabilitySchema.options.map((capability) => {
      const decision = policy.decide({
        principal: { id: "owner", kind: "owner" },
        capability,
        trustTier: this.options.trustTier,
        allowedCapabilities,
      });
      return {
        capability,
        allow: decision.allow,
        reason: decision.reason,
        ...(!decision.allow && decision.remediation ? { remediation: decision.remediation } : {}),
        ...(decision.allow ? { auditLevel: decision.auditLevel } : {}),
        highRisk: isHighRiskCapability(capability),
      };
    });
    const roleWorlds = await Promise.all(
      worlds.flatMap((world) =>
        world.roles.map(async (role) => {
          const compiled = await compileCallableSkillPolicy(this.root, {
            worldId: world.id,
            roleId: role.id,
            env: this.options.env,
          });
          return {
            worldId: world.id,
            roleId: role.id,
            allowedSkills: compiled.allowed.map(toSkillIdentity),
            deniedSkills: compiled.denied.map((denial) => ({
              skill: denial.skill,
              reason: denial.reason,
              ...(denial.pattern ? { pattern: denial.pattern } : {}),
            })),
          };
        }),
      ),
    );
    return {
      trustTier: this.options.trustTier,
      capabilities,
      roleWorlds,
      warnings: buildPolicyWarnings(project, capabilities),
    };
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const worlds = await loadWorldConfigs(this.root);
    return worlds.map((world) => {
      const defaultRoomId =
        Object.entries(world.rooms).find(([, room]) => room.type === "world-main")?.[0] ??
        Object.keys(world.rooms)[0] ??
        "main";
      return {
        id: world.id,
        name: world.name,
        mode: world.mode,
        defaultRoomId,
        roleIds: world.roles.map((role) => role.id),
      };
    });
  }

  async listRoles(): Promise<RoleSummary[]> {
    const roleConfigs = await loadRoleConfigs(this.root);
    const explicitRoles = new Map<string, RoleSummary>(
      roleConfigs.map((role) => [
        role.id,
        {
          id: role.id,
          displayName: role.displayName,
          model: role.model,
          source: "config" as const,
          ...(role.avatar ? { avatar: role.avatar } : {}),
        },
      ]),
    );

    for (const world of await loadWorldConfigs(this.root)) {
      for (const role of world.roles) {
        if (!explicitRoles.has(role.id)) {
          explicitRoles.set(role.id, {
            id: role.id,
            displayName: humanizeId(role.id),
            model: role.model,
            source: "world",
          });
        }
      }
    }

    return [...explicitRoles.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}

export type ProjectSettings = ProjectConfig;

function effectiveAllowedCapabilities(project: ProjectConfig): Capability[] {
  return [
    ...DEFAULT_ALLOWED_CAPABILITIES,
    ...(project.security.allowNetworkByDefault ? ["network.fetch" as const] : []),
    ...(project.security.allowProjectShellByDefault ? ["shell.run" as const] : []),
  ];
}

function buildPolicyWarnings(
  project: ProjectConfig,
  capabilities: EffectivePolicyMatrix["capabilities"],
): string[] {
  const warnings: string[] = [];
  if (!project.security.allowNetworkByDefault) {
    warnings.push("Network fetch is disabled by project policy.");
  }
  if (!project.security.allowProjectShellByDefault) {
    warnings.push("Project shell is disabled by project policy.");
  }
  if (capabilities.some((capability) => capability.highRisk && capability.allow)) {
    warnings.push(
      "High-risk capabilities are enabled; review role/world trust before running turns.",
    );
  }
  return warnings;
}

function toSkillIdentity(skill: SkillIdentity): SkillIdentity {
  return {
    id: skill.id,
    name: skill.name,
    scope: skill.scope,
    source: skill.source,
    ...(skill.roleId ? { roleId: skill.roleId } : {}),
    ...(skill.worldId ? { worldId: skill.worldId } : {}),
    path: skill.path,
    relativePath: skill.relativePath,
    contentHash: skill.contentHash,
  };
}
