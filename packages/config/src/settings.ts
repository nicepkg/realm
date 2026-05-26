import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { loadProjectConfig, projectLayout, userConfigDir } from "./layout.ts";
import { parseUserConfig } from "./migrations.ts";
import {
  defaultUserConfig,
  type ProjectConfig,
  projectConfigSchema,
  type UserConfig,
  userConfigSchema,
} from "./schemas.ts";
import { writeYamlFile } from "./yaml-write.ts";

export type SettingsPaths = {
  userConfigPath: string;
  projectConfigPath: string;
  projectLocalConfigPath: string;
};

export type SettingsSnapshot = {
  user: UserConfig;
  project: ProjectConfig;
  paths: SettingsPaths;
};

export function userConfigPath(env = process.env): string {
  return path.join(userConfigDir(env), "config.yaml");
}

export async function loadUserConfig(env = process.env): Promise<UserConfig> {
  const filePath = userConfigPath(env);
  if (!(await exists(filePath))) {
    return defaultUserConfig();
  }
  const raw = await readFile(filePath, "utf8");
  return parseUserConfig(YAML.parse(raw));
}

export async function writeUserConfig(config: UserConfig, env = process.env): Promise<void> {
  const parsed = userConfigSchema.parse(config);
  const filePath = userConfigPath(env);
  await writeYamlFile(filePath, parsed);
}

export async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const parsed = projectConfigSchema.parse(config);
  await writeYamlFile(projectLayout(root).configPath, parsed);
}

export async function loadSettingsSnapshot(
  root: string,
  env = process.env,
): Promise<SettingsSnapshot> {
  const layout = projectLayout(root);
  return {
    user: await loadUserConfig(env),
    project: await loadProjectConfig(root),
    paths: {
      userConfigPath: userConfigPath(env),
      projectConfigPath: layout.configPath,
      projectLocalConfigPath: layout.localConfigPath,
    },
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
