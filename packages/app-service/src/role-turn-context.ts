import {
  type LoadedSkill,
  loadCallableSkillsForRole,
  loadRoleConfigs,
  loadRolePromptSkill,
  loadWorldConfigs,
  type RoleConfig,
  type WorldConfig,
} from "@realm/config";
import {
  ContextBudgetBroker,
  type ContextBudgetPolicy,
  type ContextItem,
  defaultContextBudgetPolicy,
  formatContextPack,
} from "@realm/context";
import type { RoleSummary } from "@realm/core";

export type RoleTurnPromptContext = {
  role: RoleSummary | undefined;
  roleConfig: RoleConfig | undefined;
  world: WorldConfig | undefined;
  promptSkill: LoadedSkill | undefined;
  callableSkills: LoadedSkill[];
};

export async function loadRoleTurnContext(input: {
  root: string;
  worldId: string;
  roleId: string;
  roles: RoleSummary[];
}): Promise<RoleTurnPromptContext> {
  const [roleConfigs, worldConfigs] = await Promise.all([
    loadRoleConfigs(input.root),
    loadWorldConfigs(input.root),
  ]);
  const roleConfig = roleConfigs.find((candidate) => candidate.id === input.roleId);
  const role = input.roles.find((candidate) => candidate.id === input.roleId);
  const world = worldConfigs.find((candidate) => candidate.id === input.worldId);
  const promptSkill = roleConfig
    ? await loadRolePromptSkill(input.root, roleConfig, {
        roleId: input.roleId,
        worldId: input.worldId,
      })
    : undefined;
  const callableSkills = await loadCallableSkillsForRole(input.root, {
    roleId: input.roleId,
    worldId: input.worldId,
  });

  return {
    role,
    roleConfig,
    world,
    promptSkill,
    callableSkills,
  };
}

export function toPiAllowedSkills(skills: LoadedSkill[]) {
  return skills.map((skill) => ({
    id: `${skill.scope}:${skill.name}`,
    name: skill.name,
    scope: skill.scope,
    path: skill.path,
    contentHash: skill.contentHash,
  }));
}

export function compileRoleSystemPrompt(
  context: RoleTurnPromptContext,
  policy: ContextBudgetPolicy = defaultContextBudgetPolicy,
): string {
  if (!context.role) {
    throw new Error("Cannot compile a role prompt without a role summary");
  }
  const identityLines = [
    "You are a Realm role running inside a project-scoped world.",
    `Role id: ${context.role.id}`,
    `Display name: ${context.role.displayName}`,
    `Model profile: ${context.role.model}`,
    context.world
      ? `World: ${context.world.name} (${context.world.id}, ${context.world.mode.type})`
      : "World: unknown",
    context.roleConfig?.profile.summary
      ? `Role summary: ${context.roleConfig.profile.summary}`
      : undefined,
  ].filter((line): line is string => typeof line === "string" && line.length > 0);

  const contextItems: ContextItem[] = [
    {
      id: "role-identity",
      bucket: "system",
      title: "Role Identity",
      text: identityLines.join("\n"),
      priority: 100,
    },
    {
      id: "runtime-rules",
      bucket: "system",
      title: "Runtime Rules",
      text: "Stay in character, respect the room context, and do not claim tool access you were not given.",
      priority: 80,
    },
  ];

  if (context.promptSkill) {
    contextItems.push({
      id: `role-prompt:${context.promptSkill.name}`,
      bucket: "system",
      title: "Role Prompt Skill",
      text: [
        `Skill: ${context.promptSkill.name}`,
        `Source: ${context.promptSkill.source}`,
        `Content hash: ${context.promptSkill.contentHash}`,
        context.promptSkill.content.trim(),
      ].join("\n"),
      priority: 90,
    });
  }

  if (context.callableSkills.length > 0) {
    contextItems.push({
      id: "callable-skills",
      bucket: "toolManifest",
      title: "Callable Skills",
      text: context.callableSkills
        .map((skill) => `- ${skill.scope}:${skill.name} (${skill.contentHash})`)
        .concat(["Use `realm_skill_read` with the scoped skill id shown above when needed."])
        .join("\n"),
      priority: 60,
    });
  }

  const pack = new ContextBudgetBroker().compile({
    items: contextItems,
    policy,
  });

  return formatContextPack(pack);
}
