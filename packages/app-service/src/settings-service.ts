import {
  loadSettingsSnapshot,
  type ProjectConfig,
  projectConfigSchema,
  type SettingsSnapshot,
  type UserConfig,
  userConfigSchema,
  writeProjectConfig,
  writeUserConfig,
} from "@realm/config";

export type SettingsExportSnapshot = {
  version: 1;
  exportedAt: string;
  user: UserConfig;
  project: ProjectConfig;
  redactions: string[];
};

export type { SettingsSnapshot };

export class SettingsService {
  constructor(
    private readonly root: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  getSettings(): Promise<SettingsSnapshot> {
    return loadSettingsSnapshot(this.root, this.env);
  }

  async updateUserSettings(input: UserConfig): Promise<SettingsSnapshot> {
    await writeUserConfig(input, this.env);
    return this.getSettings();
  }

  async updateProjectSettings(input: ProjectConfig): Promise<SettingsSnapshot> {
    await writeProjectConfig(this.root, input);
    return this.getSettings();
  }

  async exportSettings(clock: () => Date): Promise<SettingsExportSnapshot> {
    const snapshot = await this.getSettings();
    return {
      version: 1,
      exportedAt: clock().toISOString(),
      user: sanitizeUserConfig(snapshot.user),
      project: snapshot.project,
      redactions: [
        "provider secret values are never exported; keep API keys in environment variables",
      ],
    };
  }

  async importSettings(input: unknown): Promise<SettingsSnapshot> {
    assertNoRawSecrets(input);
    const record = importRecord(input);
    const user = userConfigSchema.parse(record.user);
    const project = projectConfigSchema.parse(record.project);
    await writeUserConfig(user, this.env);
    await writeProjectConfig(this.root, project);
    return this.getSettings();
  }
}

function sanitizeUserConfig(user: UserConfig): UserConfig {
  return {
    ...user,
    providers: user.providers.map((provider) => ({
      id: provider.id,
      ...(provider.displayName ? { displayName: provider.displayName } : {}),
      ...(provider.apiKeyEnv ? { apiKeyEnv: provider.apiKeyEnv } : {}),
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      ...(provider.defaultModel ? { defaultModel: provider.defaultModel } : {}),
      enabled: provider.enabled,
    })),
  };
}

function importRecord(input: unknown): { user: unknown; project: unknown } {
  if (!input || typeof input !== "object") {
    throw new Error("Settings import must be an object");
  }
  const record = input as Record<string, unknown>;
  if (!record.user || !record.project) {
    throw new Error("Settings import requires user and project sections");
  }
  return { user: record.user, project: record.project };
}

function assertNoRawSecrets(value: unknown, path = "settings"): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoRawSecrets(item, `${path}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenSecretKey(key)) {
      throw new Error(`Settings import contains a raw secret field: ${path}.${key}`);
    }
    assertNoRawSecrets(child, `${path}.${key}`);
  }
}

function isForbiddenSecretKey(key: string): boolean {
  if (key === "apiKeyEnv") {
    return false;
  }
  return /^(apiKey|api_key|secret|token|password|credential)$/i.test(key);
}
