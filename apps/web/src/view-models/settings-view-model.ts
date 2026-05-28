import type { ProjectConfig, UserConfig } from "@realm/api-contract";

export type SettingsSnapshot = {
  user: UserConfig;
  project: ProjectConfig;
  paths: {
    userConfigPath: string;
    projectConfigPath: string;
    projectLocalConfigPath: string;
  };
};

export type SettingsDraft = {
  defaultProvider: string;
  defaultModel: string;
  openBrowser: boolean;
};

export type ProviderSettingsRow = {
  id: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  apiKeyEnv?: string;
  defaultModel?: string;
  baseUrl?: string;
};

export function buildSettingsDraft(user: UserConfig): SettingsDraft {
  return {
    defaultProvider: user.defaultProvider,
    defaultModel: user.defaultModel,
    openBrowser: user.web.openBrowser,
  };
}

export function applySettingsDraft(user: UserConfig, draft: SettingsDraft): UserConfig {
  return {
    ...user,
    defaultProvider: draft.defaultProvider,
    defaultModel: draft.defaultModel.trim(),
    web: {
      ...user.web,
      openBrowser: draft.openBrowser,
    },
  };
}

export function buildProviderRows(user: UserConfig): ProviderSettingsRow[] {
  return user.providers.map((provider) => ({
    id: provider.id,
    label: provider.displayName ?? provider.id,
    enabled: provider.enabled,
    isDefault: provider.id === user.defaultProvider,
    ...(provider.apiKeyEnv ? { apiKeyEnv: provider.apiKeyEnv } : {}),
    ...(provider.defaultModel ? { defaultModel: provider.defaultModel } : {}),
    ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
  }));
}

export function settingsDraftChanged(user: UserConfig, draft: SettingsDraft): boolean {
  const normalized = applySettingsDraft(user, draft);
  return (
    normalized.defaultProvider !== user.defaultProvider ||
    normalized.defaultModel !== user.defaultModel ||
    normalized.web.openBrowser !== user.web.openBrowser
  );
}
