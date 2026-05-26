import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadProjectConfig, loadRoleConfigs, projectLayout, userConfigDir } from "./layout.ts";
import type {
  LoadedSkill,
  RoleConfig,
  SkillIdentity,
  SkillPolicy,
  SkillScope,
  SkillSource,
} from "./schemas.ts";

export type SkillResolutionContext = {
  roleId?: string;
  worldId?: string;
  env?: NodeJS.ProcessEnv;
};

export type SkillPolicyDenial = {
  skill: SkillIdentity;
  reason: string;
  pattern?: string;
};

export type CompiledCallableSkillPolicy = {
  allowed: LoadedSkill[];
  denied: SkillPolicyDenial[];
  candidates: LoadedSkill[];
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
  return (await compileCallableSkillPolicy(root, context)).allowed;
}

export async function compileCallableSkillPolicy(
  root: string,
  context: Required<Pick<SkillResolutionContext, "roleId" | "worldId">> &
    Pick<SkillResolutionContext, "env">,
): Promise<CompiledCallableSkillPolicy> {
  const layout = projectLayout(root);
  const [projectConfig, roleConfigs] = await Promise.all([
    loadProjectConfig(root),
    loadRoleConfigs(root),
  ]);
  const roleConfig = roleConfigs.find((role) => role.id === context.roleId);
  const skillGroups = await Promise.all([
    listSkillsInDirectory(
      path.join(layout.rolesDir, context.roleId, "skills"),
      "role-private",
      "role-private",
      { root, roleId: context.roleId },
    ),
    listSkillsInDirectory(
      path.join(layout.worldsDir, context.worldId, "skills"),
      "world",
      "world",
      {
        root,
        worldId: context.worldId,
      },
    ),
    listSkillsInDirectory(layout.skillsDir, "project", "project", { root }),
    listSkillsInDirectory(path.join(userConfigDir(context.env), "skills"), "global", "global", {
      root,
    }),
  ]);
  const candidates = sortSkills(skillGroups.flat());
  const decisions = candidates.map((skill) =>
    decideCallableSkill({
      skill,
      roleConfig,
      projectPolicy: projectConfig.skills.project,
      globalPolicy: projectConfig.skills.global,
      env: context.env,
    }),
  );
  return {
    allowed: sortSkills(
      decisions.filter((decision) => decision.allow).map((decision) => decision.skill),
    ),
    denied: decisions
      .filter((decision): decision is SkillPolicyDenial & { allow: false } => !decision.allow)
      .map(({ allow: _allow, ...denial }) => denial),
    candidates,
  };
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
    root,
    roleId: input.roleId,
    worldId: input.worldId,
  });
}

async function listSkillsInDirectory(
  parentDir: string,
  scope: SkillScope,
  source: SkillSource,
  context: {
    root: string;
    roleId?: string;
    worldId?: string;
  },
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
          root: context.root,
          roleId: context.roleId,
          worldId: context.worldId,
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
  root: string;
  roleId?: string;
  worldId?: string;
}): Promise<LoadedSkill> {
  const skillFilePath = path.join(input.skillDir, "SKILL.md");
  const content = await readFile(skillFilePath, "utf8");
  const contentHash = hashText(content);
  return {
    id: skillId(input),
    name: input.name,
    source: input.source,
    scope: input.scope,
    roleId: input.roleId,
    worldId: input.worldId,
    path: input.skillDir,
    relativePath: normalizePath(path.relative(input.root, input.skillDir)),
    skillFilePath,
    content,
    contentHash,
  };
}

type SkillDecision = (SkillPolicyDenial & { allow: false }) | { allow: true; skill: LoadedSkill };

function decideCallableSkill(input: {
  skill: LoadedSkill;
  roleConfig: RoleConfig | undefined;
  projectPolicy: SkillPolicy | undefined;
  globalPolicy: SkillPolicy | undefined;
  env?: NodeJS.ProcessEnv;
}): SkillDecision {
  const promptMatch = isRolePromptSkill(input.skill, input.roleConfig);
  const policy = input.skill.scope === "project" ? input.projectPolicy : input.globalPolicy;
  if (input.skill.scope === "project" || input.skill.scope === "global") {
    const decision = decidePolicyMatch(input.skill, policy, input.env);
    if (!decision.allow) {
      return {
        allow: false,
        skill: input.skill,
        reason: decision.reason,
        pattern: decision.pattern,
      };
    }
    if (promptMatch && !hasExplicitIdentityMatch(input.skill, policy?.include ?? [])) {
      return {
        allow: false,
        skill: input.skill,
        reason: "Role prompt skill is not callable without an explicit identity include",
      };
    }
    return { allow: true, skill: input.skill };
  }

  if (promptMatch) {
    return {
      allow: false,
      skill: input.skill,
      reason: "Role prompt skill is reserved for the role system prompt",
    };
  }
  return { allow: true, skill: input.skill };
}

function decidePolicyMatch(
  skill: LoadedSkill,
  policy: SkillPolicy | undefined,
  env: NodeJS.ProcessEnv | undefined,
): { allow: true } | { allow: false; reason: string; pattern?: string } {
  const current = policy ?? { mode: "blacklist" as const, include: [], exclude: [] };
  const included = findMatchingPattern(skill, current.include, env);
  if (current.mode === "allowlist" && !included) {
    return { allow: false, reason: "Skill is not included by allowlist policy" };
  }
  if (current.mode === "blacklist" && current.include.length > 0 && !included) {
    return { allow: false, reason: "Skill is outside the included skill roots" };
  }

  const excluded = findMatchingPattern(skill, current.exclude, env);
  if (excluded) {
    return { allow: false, reason: "Skill is excluded by policy", pattern: excluded };
  }
  return { allow: true };
}

function isRolePromptSkill(skill: LoadedSkill, roleConfig: RoleConfig | undefined): boolean {
  return Boolean(
    roleConfig?.rolePrompt?.source === skill.source && roleConfig.rolePrompt.skill === skill.name,
  );
}

function hasExplicitIdentityMatch(skill: LoadedSkill, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => explicitIdentityTokens(skill).includes(pattern));
}

function findMatchingPattern(
  skill: LoadedSkill,
  patterns: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
): string | undefined {
  return patterns.find((pattern) => skillPatternMatches(skill, pattern, env));
}

function skillPatternMatches(
  skill: LoadedSkill,
  pattern: string,
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  if (pattern === "*") {
    return true;
  }
  if (explicitIdentityTokens(skill).includes(pattern)) {
    return true;
  }
  if (pattern.startsWith("sha256:") && pattern === `sha256:${skill.contentHash}`) {
    return true;
  }
  const normalizedPattern = normalizePolicyPattern(pattern, env);
  return [skill.path, skill.relativePath, normalizePath(path.join(skill.relativePath, "SKILL.md"))]
    .map(normalizePath)
    .some((candidate) => globMatches(normalizedPattern, candidate));
}

function explicitIdentityTokens(skill: LoadedSkill): string[] {
  return [skill.id, `${skill.scope}:${skill.name}`, `${skill.source}:${skill.name}`];
}

function skillId(input: {
  name: string;
  scope: SkillScope;
  source: SkillSource;
  roleId?: string;
  worldId?: string;
}): string {
  if (input.scope === "role-private") {
    return `role-private:${input.roleId ?? "unknown"}:${input.name}`;
  }
  if (input.scope === "world") {
    return `world:${input.worldId ?? "unknown"}:${input.name}`;
  }
  if (input.scope === "role-prompt") {
    return `role-prompt:${input.roleId ?? "unknown"}:${input.source}:${input.name}`;
  }
  return `${input.scope}:${input.name}`;
}

function sortSkills(skills: LoadedSkill[]): LoadedSkill[] {
  return [...skills].sort((left, right) => left.id.localeCompare(right.id));
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

function normalizePolicyPattern(pattern: string, env: NodeJS.ProcessEnv | undefined): string {
  const userDir = normalizePath(userConfigDir(env));
  return normalizePath(pattern).replace(/^~\/\.realm(?=\/|$)/, userDir);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function globMatches(pattern: string, value: string): boolean {
  return new RegExp(`^${globToRegExpSource(pattern)}$`).test(value);
}

function globToRegExpSource(pattern: string): string {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];
    if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(character);
    }
  }
  return source;
}

function escapeRegExp(value: string | undefined): string {
  return value ? value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") : "";
}

function assertSafeSkillName(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Skill name is not safe: ${value}`);
  }
}
