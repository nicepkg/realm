import type { RealmHttpClient } from "@realm/client-sdk";
import type { TuiDictionary } from "./i18n.ts";
import type { TuiSettingsItem, TuiState } from "./types.ts";

export async function loadSettingsSummary(client: RealmHttpClient): Promise<string> {
  const settings = await client.getSettings();
  return `${settings.user.defaultProvider}/${settings.user.defaultModel}`;
}

export async function updateDefaultModelSettings(
  client: RealmHttpClient,
  provider: string,
  model: string,
): Promise<string> {
  const settings = await client.getSettings();
  const updated = await client.updateUserSettings({
    ...settings.user,
    defaultModel: model,
    defaultProvider: provider,
  });
  return `${updated.user.defaultProvider}/${updated.user.defaultModel}`;
}

export async function loadSettingsItems(
  client: RealmHttpClient,
  state: TuiState,
  dictionary: TuiDictionary,
): Promise<TuiSettingsItem[]> {
  const settings = await client.getSettings();
  return [
    {
      currentValue: settings.user.defaultProvider,
      description: dictionary.providerDescription,
      id: "provider",
      label: dictionary.provider,
    },
    {
      currentValue: settings.user.defaultModel,
      description: dictionary.modelDescription,
      id: "model",
      label: dictionary.model,
    },
    {
      currentValue: state.identity,
      description: dictionary.identityDescription,
      id: "identity",
      label: dictionary.identity,
    },
  ];
}
