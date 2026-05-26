import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { parseProjectConfig } from "./migrations.ts";
import {
  defaultProjectConfig,
  type ProjectConfig,
  type RoleConfig,
  roleConfigSchema,
  type WorldConfig,
  worldConfigSchema,
} from "./schemas.ts";
import { writeYamlFile } from "./yaml-write.ts";

export type ProjectLayout = {
  root: string;
  agentsDir: string;
  configPath: string;
  localConfigPath: string;
  rolesDir: string;
  skillsDir: string;
  worldsDir: string;
  stateDir: string;
  logsDir: string;
};

export function userConfigDir(env = process.env): string {
  return env.REALM_HOME ?? path.join(os.homedir(), ".realm");
}

export function projectLayout(root: string): ProjectLayout {
  const agentsDir = path.join(root, ".agents");
  return {
    root,
    agentsDir,
    configPath: path.join(agentsDir, "config.yaml"),
    localConfigPath: path.join(agentsDir, "config.local.yaml"),
    rolesDir: path.join(agentsDir, "roles"),
    skillsDir: path.join(agentsDir, "skills"),
    worldsDir: path.join(agentsDir, "worlds"),
    stateDir: path.join(agentsDir, "state"),
    logsDir: path.join(agentsDir, "logs"),
  };
}

export async function resolveProjectRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);

  while (true) {
    if (await exists(path.join(current, ".git"))) {
      return current;
    }
    if (await exists(path.join(current, "AGENTS.md"))) {
      return current;
    }
    if (await exists(path.join(current, ".agents"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(cwd);
    }
    current = parent;
  }
}

export async function initProject(
  root: string,
  name = path.basename(root),
): Promise<ProjectLayout> {
  const layout = projectLayout(root);
  await mkdir(layout.rolesDir, { recursive: true });
  await mkdir(layout.skillsDir, { recursive: true });
  await mkdir(layout.worldsDir, { recursive: true });
  await mkdir(layout.stateDir, { recursive: true });
  await mkdir(layout.logsDir, { recursive: true });

  if (!(await exists(layout.configPath))) {
    await writeYamlFile(layout.configPath, defaultProjectConfig(name));
  }

  await ensureGitignore(root);
  return layout;
}

export async function loadProjectConfig(root: string): Promise<ProjectConfig> {
  const layout = projectLayout(root);
  const raw = await readFile(layout.configPath, "utf8");
  return parseProjectConfig(YAML.parse(raw), path.basename(root));
}

export async function loadWorldConfigs(root: string): Promise<WorldConfig[]> {
  const layout = projectLayout(root);
  if (!(await exists(layout.worldsDir))) {
    return [];
  }

  const entries = await readdir(layout.worldsDir, { withFileTypes: true });
  const configs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = path.join(layout.worldsDir, entry.name, "world.yaml");
        if (!(await exists(filePath))) {
          return undefined;
        }
        const raw = await readFile(filePath, "utf8");
        return worldConfigSchema.parse(YAML.parse(raw));
      }),
  );

  return configs.filter((config): config is WorldConfig => Boolean(config));
}

export async function loadRoleConfigs(root: string): Promise<RoleConfig[]> {
  const layout = projectLayout(root);
  if (!(await exists(layout.rolesDir))) {
    return [];
  }

  const entries = await readdir(layout.rolesDir, { withFileTypes: true });
  const configs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = path.join(layout.rolesDir, entry.name, "role.yaml");
        if (!(await exists(filePath))) {
          return undefined;
        }
        const raw = await readFile(filePath, "utf8");
        return roleConfigSchema.parse(YAML.parse(raw));
      }),
  );

  return configs.filter((config): config is RoleConfig => Boolean(config));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  const required = [".agents/config.local.yaml", ".agents/state/", ".agents/logs/"];
  const current = (await exists(gitignorePath)) ? await readFile(gitignorePath, "utf8") : "";
  const missing = required.filter((entry) => !current.split(/\r?\n/).includes(entry));

  if (missing.length === 0) {
    return;
  }

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, `${current}${prefix}${missing.join("\n")}\n`, "utf8");
}
