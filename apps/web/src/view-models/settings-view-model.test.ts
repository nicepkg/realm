import { describe, expect, test } from "bun:test";
import type { UserConfig } from "@realm/api-contract";
import {
  applySettingsDraft,
  buildProviderRows,
  buildSettingsDraft,
  settingsDraftChanged,
} from "./settings-view-model.ts";

describe("settings view model", () => {
  test("builds editable user settings without losing provider configuration", () => {
    const user = userConfig();
    const draft = {
      ...buildSettingsDraft(user),
      defaultModel: "gemini-2.5-flash",
      defaultProvider: "google",
      openBrowser: false,
    };

    const updated = applySettingsDraft(user, draft);

    expect(updated.defaultProvider).toBe("google");
    expect(updated.defaultModel).toBe("gemini-2.5-flash");
    expect(updated.web.openBrowser).toBe(false);
    expect(updated.providers).toEqual(user.providers);
    expect(settingsDraftChanged(user, draft)).toBe(true);
    expect(settingsDraftChanged(updated, buildSettingsDraft(updated))).toBe(false);
  });

  test("builds provider rows with default and key-env status", () => {
    const rows = buildProviderRows(userConfig());

    expect(rows).toEqual([
      {
        apiKeyEnv: "OPENAI_API_KEY",
        defaultModel: "gpt-5",
        enabled: true,
        id: "openai",
        isDefault: true,
        label: "OpenAI",
      },
      {
        apiKeyEnv: "GEMINI_API_KEY",
        defaultModel: "gemini-2.5-flash",
        enabled: false,
        id: "google",
        isDefault: false,
        label: "Google",
      },
    ]);
  });
});

function userConfig(): UserConfig {
  return {
    defaultModel: "gpt-5",
    defaultProvider: "openai",
    providers: [
      {
        apiKeyEnv: "OPENAI_API_KEY",
        defaultModel: "gpt-5",
        displayName: "OpenAI",
        enabled: true,
        id: "openai",
      },
      {
        apiKeyEnv: "GEMINI_API_KEY",
        defaultModel: "gemini-2.5-flash",
        displayName: "Google",
        enabled: false,
        id: "google",
      },
    ],
    version: 1,
    web: {
      host: "127.0.0.1",
      openBrowser: true,
      preferredPort: 3737,
    },
  };
}
