import { describe, expect, test } from "bun:test";
import type { SettingsSnapshot } from "@/view-models/settings-view-model.ts";
import {
  affectsHighRiskPolicy,
  computeAffectedPolicySections,
  parseImportBundle,
} from "./settings-import-diff.ts";

function snapshot(): SettingsSnapshot {
  return {
    paths: {
      projectConfigPath: "/p/realm.yaml",
      projectLocalConfigPath: "/p/realm.local.yaml",
      userConfigPath: "/u/realm.yaml",
    },
    project: {
      defaults: { modelProfile: "default", world: "demo" },
      project: { name: "demo" },
      security: {
        allowNetworkByDefault: false,
        allowProjectShellByDefault: false,
        requireTrust: true,
      },
      skills: {},
      version: 1,
    },
    user: {
      defaultModel: "gpt-5",
      defaultProvider: "openai",
      providers: [
        { apiKeyEnv: "OPENAI_API_KEY", defaultModel: "gpt-5", enabled: true, id: "openai" },
      ],
      version: 1,
      web: { host: "127.0.0.1", openBrowser: true, preferredPort: 3737 },
    },
  } as SettingsSnapshot;
}

describe("parseImportBundle", () => {
  test("accepts a bare project/user object", () => {
    const bundle = parseImportBundle(JSON.stringify({ project: { x: 1 }, user: { y: 2 } }));
    expect(bundle.project).toEqual({ x: 1 } as never);
    expect(bundle.user).toEqual({ y: 2 } as never);
  });

  test("throws on non-JSON", () => {
    expect(() => parseImportBundle("not json")).toThrow();
  });
});

describe("computeAffectedPolicySections", () => {
  test("no changes when bundle matches current", () => {
    const current = snapshot();
    const same = parseImportBundle(
      JSON.stringify({ project: current.project, user: current.user }),
    );
    expect(computeAffectedPolicySections(current, same)).toEqual([]);
    expect(affectsHighRiskPolicy([])).toBe(false);
  });

  test("flags network when allowNetworkByDefault flips", () => {
    const current = snapshot();
    const bundle = parseImportBundle(
      JSON.stringify({
        project: {
          ...current.project,
          security: { ...current.project.security, allowNetworkByDefault: true },
        },
        user: current.user,
      }),
    );
    expect(computeAffectedPolicySections(current, bundle)).toContain("network");
  });

  test("flags projectShell, requireTrust, and provider together", () => {
    const current = snapshot();
    const bundle = parseImportBundle(
      JSON.stringify({
        project: {
          ...current.project,
          security: {
            allowNetworkByDefault: false,
            allowProjectShellByDefault: true,
            requireTrust: false,
          },
        },
        user: { ...current.user, defaultProvider: "anthropic" },
      }),
    );
    const affected = computeAffectedPolicySections(current, bundle);
    expect(affected).toContain("projectShell");
    expect(affected).toContain("requireTrust");
    expect(affected).toContain("provider");
    expect(affected).not.toContain("network");
    expect(affectsHighRiskPolicy(affected)).toBe(true);
  });

  test("flags provider when the roster changes (enabled flag)", () => {
    const current = snapshot();
    const bundle = parseImportBundle(
      JSON.stringify({
        project: current.project,
        user: {
          ...current.user,
          providers: [{ ...current.user.providers[0], enabled: false }],
        },
      }),
    );
    expect(computeAffectedPolicySections(current, bundle)).toEqual(["provider"]);
  });

  test("does not flag sections the bundle omits", () => {
    const current = snapshot();
    const bundle = parseImportBundle(JSON.stringify({ project: {}, user: {} }));
    expect(computeAffectedPolicySections(current, bundle)).toEqual([]);
  });
});
