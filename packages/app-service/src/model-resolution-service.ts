import type { ModelProviderConfig, SettingsSnapshot, UserConfig } from "@realm/config";

export type ResolvedRoleModelSettings = {
  provider: string;
  model: string;
  env: Record<string, string>;
};

export function resolveRoleModelSettings(input: {
  settings: SettingsSnapshot;
  roleModel: string | undefined;
  env?: NodeJS.ProcessEnv;
}): ResolvedRoleModelSettings {
  const modelRef = normalizeModelRef(input.roleModel, input.settings.project.defaults.modelProfile);
  const selection = resolveProviderAndModel(input.settings.user, modelRef);
  const provider = findProvider(input.settings.user, selection.provider);
  assertProviderEnabled(selection.provider, provider);

  return {
    provider: selection.provider,
    model: selection.model,
    env: buildProviderEnv({
      providerId: selection.provider,
      provider,
      env: input.env,
    }),
  };
}

function normalizeModelRef(roleModel: string | undefined, projectModelProfile: string): string {
  const trimmed = roleModel?.trim();
  if (!trimmed || trimmed === "default") {
    return projectModelProfile;
  }
  return trimmed;
}

function resolveProviderAndModel(
  user: UserConfig,
  modelRef: string,
): { provider: string; model: string } {
  if (!modelRef || modelRef === "default") {
    return resolveDefaultProviderAndModel(user);
  }

  const explicit = parseExplicitProviderModel(user, modelRef);
  if (explicit) {
    return explicit;
  }

  const provider = findProvider(user, modelRef);
  if (provider) {
    return {
      provider: provider.id,
      model: provider.defaultModel ?? user.defaultModel,
    };
  }

  return {
    provider: user.defaultProvider,
    model: modelRef,
  };
}

function resolveDefaultProviderAndModel(user: UserConfig): { provider: string; model: string } {
  const provider = findProvider(user, user.defaultProvider);
  return {
    provider: user.defaultProvider,
    model: provider?.defaultModel ?? user.defaultModel,
  };
}

function parseExplicitProviderModel(
  user: UserConfig,
  modelRef: string,
): { provider: string; model: string } | undefined {
  const doubleColon = modelRef.indexOf("::");
  if (doubleColon > 0) {
    return splitProviderModel(modelRef, doubleColon, 2);
  }

  const slash = modelRef.indexOf("/");
  if (slash > 0) {
    const providerId = modelRef.slice(0, slash);
    if (findProvider(user, providerId)) {
      return splitProviderModel(modelRef, slash, 1);
    }
  }

  return undefined;
}

function splitProviderModel(
  modelRef: string,
  separatorIndex: number,
  separatorLength: number,
): { provider: string; model: string } {
  const provider = modelRef.slice(0, separatorIndex).trim();
  const model = modelRef.slice(separatorIndex + separatorLength).trim();
  if (!provider || !model) {
    throw new Error(`Invalid model reference: ${modelRef}`);
  }
  return { provider, model };
}

function findProvider(user: UserConfig, providerId: string): ModelProviderConfig | undefined {
  return user.providers.find((provider) => provider.id === providerId);
}

function assertProviderEnabled(
  providerId: string,
  provider: ModelProviderConfig | undefined,
): void {
  if (provider && !provider.enabled) {
    throw new Error(`Model provider is disabled: ${providerId}`);
  }
}

function buildProviderEnv(input: {
  providerId: string;
  provider: ModelProviderConfig | undefined;
  env?: NodeJS.ProcessEnv;
}): Record<string, string> {
  const sourceEnv = { ...process.env, ...input.env };
  const providerEnvName = input.provider?.apiKeyEnv;
  const apiKey = providerEnvName ? sourceEnv[providerEnvName] : undefined;
  if (!providerEnvName || !apiKey) {
    return {};
  }

  const output: Record<string, string> = { [providerEnvName]: apiKey };
  const normalizedName = defaultApiKeyEnvName(input.providerId);
  if (!sourceEnv[normalizedName]) {
    output[normalizedName] = apiKey;
  }
  return output;
}

function defaultApiKeyEnvName(providerId: string): string {
  return `${providerId.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_API_KEY`;
}
