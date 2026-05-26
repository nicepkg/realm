import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadRoleConfigs, projectLayout, userConfigDir } from "./layout.ts";
import type { LoadedSkill, RoleConfig, SkillScope, SkillSource } from "./schemas.ts";

export type SkillResolutionContext = {
  roleId?: string;
  worldId?: string;
  env?: NodeJS.ProcessEnv;
};

export async function loadRolePromptSkill(
  root: string,
  role: RoleConfig,
  context: SkillResolutionContext = {},
): Promise<LoadedSkill | undefined> {
  if (!role.rolePrompt) {
    return undefined;
  }
  return loadSkillByReference(root, {
    name: role.rolePrompt.skill,
    source: role.rolePrompt.source,
    scope: "role-prompt",
    roleId: context.roleId ?? role.id,
    worldId: context.worldId,
    env: context.env,
  });
}

export async function loadCallableSkillsForRole(
  root: string,
  context: Required<Pick<SkillResolutionContext, "roleId" | "worldId">> &
    Pick<SkillResolutionContext, "env">,
): Promise<LoadedSkill[]> {
  const layout = projectLayout(root);
  const roleConfig = (await loadRoleConfigs(root)).find((role) => role.id === context.roleId);
  const skillGroups = await Promise.all([
    listSkillsInDirectory(
      path.join(layout.rolesDir, context.roleId, "skills"),
      "role-private",
      "role-private",
    ),
    listSkillsInDirectory(path.join(layout.worldsDir, context.worldId, "skills"), "world", "world"),
  ]);
  return skillGroups
    .flat()
    .filter(
      (skill) =>
        !(
          roleConfig?.rolePrompt?.source === skill.source &&
          roleConfig.rolePrompt.skill === skill.name
        ),
    )
    .sort((left, right) =>
      `${left.scope}:${left.name}`.localeCompare(`${right.scope}:${right.name}`),
    );
}

export async function loadSkillByReference(
  root: string,
  input: {
    name: string;
    source: SkillSource;
    scope: SkillScope;
    roleId?: string;
    worldId?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<LoadedSkill> {
  assertSafeSkillName(input.name);
  const skillDir = resolveSkillDirectory(root, input);
  return loadSkillDirectory({
    name: input.name,
    source: input.source,
    scope: input.scope,
    skillDir,
  });
}

async function listSkillsInDirectory(
  parentDir: string,
  scope: SkillScope,
  source: SkillSource,
): Promise<LoadedSkill[]> {
  if (!(await exists(parentDir))) {
    return [];
  }
  const entries = await readdir(parentDir, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        loadSkillDirectory({
          name: entry.name,
          source,
          scope,
          skillDir: path.join(parentDir, entry.name),
        }).catch(() => undefined),
      ),
  );
  return skills.filter((skill): skill is LoadedSkill => Boolean(skill));
}

async function loadSkillDirectory(input: {
  name: string;
  source: SkillSource;
  scope: SkillScope;
  skillDir: string;
}): Promise<LoadedSkill> {
  const skillFilePath = path.join(input.skillDir, "SKILL.md");
  const content = await readFile(skillFilePath, "utf8");
  return {
    name: input.name,
    source: input.source,
    scope: input.scope,
    path: input.skillDir,
    skillFilePath,
    content,
    contentHash: hashText(content),
  };
}

function resolveSkillDirectory(
  root: string,
  input: {
    name: string;
    source: SkillSource;
    roleId?: string;
    worldId?: string;
    env?: NodeJS.ProcessEnv;
  },
): string {
  const layout = projectLayout(root);
  if (input.source === "project") {
    return path.join(layout.skillsDir, input.name);
  }
  if (input.source === "global") {
    return path.join(userConfigDir(input.env), "skills", input.name);
  }
  if (input.source === "role-private") {
    if (!input.roleId) {
      throw new Error(`role-private skill ${input.name} requires roleId`);
    }
    return path.join(layout.rolesDir, input.roleId, "skills", input.name);
  }
  if (!input.worldId) {
    throw new Error(`world skill ${input.name} requires worldId`);
  }
  return path.join(layout.worldsDir, input.worldId, "skills", input.name);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeSkillName(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Skill name is not safe: ${value}`);
  }
}
