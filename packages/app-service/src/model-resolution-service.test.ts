import { describe, expect, test } from "bun:test";
import { defaultProjectConfig, defaultUserConfig, type SettingsSnapshot } from "@realm/config";
import { resolveRoleModelSettings } from "./model-resolution-service.ts";

describe("resolveRoleModelSettings", () => {
  test("resolves default role model through project default profile and user provider", () => {
    const resolved = resolveRoleModelSettings({
      settings: settingsSnapshot(),
      roleModel: "default",
      env: {},
    });

    expect(resolved).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      env: {},
    });
  });

  test("resolves a provider id to that provider default model", () => {
    const resolved = resolveRoleModelSettings({
      settings: settingsSnapshot(),
      roleModel: "google",
      env: {},
    });

    expect(resolved.provider).toBe("google");
    expect(resolved.model).toBe("gemini-2.5-flash");
  });

  test("resolves explicit provider model refs and maps custom key env names", () => {
    const resolved = resolveRoleModelSettings({
      settings: settingsSnapshot({
        user: {
          providers: [
            {
              id: "openai",
              apiKeyEnv: "REALM_OPENAI_KEY",
              defaultModel: "gpt-5",
              enabled: true,
            },
          ],
        },
      }),
      roleModel: "openai::gpt-5-mini",
      env: { REALM_OPENAI_KEY: "secret" },
    });

    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("gpt-5-mini");
    expect(resolved.env).toEqual({
      OPENAI_API_KEY: "secret",
      REALM_OPENAI_KEY: "secret",
    });
  });

  test("uses explicit env input instead of leaking ambient provider keys", () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "ambient";
    try {
      const resolved = resolveRoleModelSettings({
        settings: settingsSnapshot(),
        roleModel: "default",
        env: {},
      });

      expect(resolved.env).toEqual({});
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previous;
      }
    }
  });

  test("keeps slash model ids as models when the prefix is not a provider", () => {
    const resolved = resolveRoleModelSettings({
      settings: settingsSnapshot(),
      roleModel: "qwen/qwen3-coder",
      env: {},
    });

    expect(resolved.provider).toBe("openai");
    expect(resolved.model).toBe("qwen/qwen3-coder");
  });

  test("rejects disabled providers before starting a turn", () => {
    expect(() =>
      resolveRoleModelSettings({
        settings: settingsSnapshot({
          user: {
            providers: [
              {
                id: "google",
                apiKeyEnv: "GEMINI_API_KEY",
                defaultModel: "gemini-2.5-flash",
                enabled: false,
              },
            ],
          },
        }),
        roleModel: "google",
        env: {},
      }),
    ).toThrow("Model provider is disabled: google");
  });
});

function settingsSnapshot(
  input: {
    user?: Partial<SettingsSnapshot["user"]>;
    project?: Partial<SettingsSnapshot["project"]>;
  } = {},
): SettingsSnapshot {
  return {
    user: {
      ...defaultUserConfig(),
      ...input.user,
    },
    project: {
      ...defaultProjectConfig("demo"),
      ...input.project,
    },
    paths: {
      userConfigPath: "/tmp/.realm/config.yaml",
      projectConfigPath: "/tmp/project/.agents/config.yaml",
      projectLocalConfigPath: "/tmp/project/.agents/config.local.yaml",
    },
  };
}
