import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { SettingsService } from "./settings-service.ts";

describe("SettingsService import/export", () => {
  test("exports portable settings and rejects raw secrets on import", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-settings-export-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-settings-home-"));
    await initProject(root, "demo");
    const service = new SettingsService(root, { REALM_HOME: realmHome });

    const exported = await service.exportSettings(() => new Date("2026-05-27T00:00:00.000Z"));

    expect(exported.exportedAt).toBe("2026-05-27T00:00:00.000Z");
    expect(exported.redactions[0]).toContain("provider secret values are never exported");
    await expect(
      service.importSettings({
        user: {
          ...exported.user,
          providers: [{ id: "openai", enabled: true, apiKey: "sk-test" }],
        },
        project: exported.project,
      }),
    ).rejects.toThrow("raw secret field");
    await expect(
      service.importSettings({ user: exported.user, project: exported.project }),
    ).resolves.toMatchObject({
      user: { defaultProvider: exported.user.defaultProvider },
      project: { project: { name: "demo" } },
    });
  });
});
