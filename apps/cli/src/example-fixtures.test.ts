import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  loadCallableSkillsForRole,
  loadProjectConfig,
  loadRoleConfigs,
  loadRolePromptSkill,
  loadWorldConfigs,
} from "@realm/config";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const cultivationSimRoot = path.join(repoRoot, "examples", "cultivation-sim");

describe("example fixtures", () => {
  test("keeps cultivation-sim as a complete runnable Realm project", async () => {
    const project = await loadProjectConfig(cultivationSimRoot);
    const worlds = await loadWorldConfigs(cultivationSimRoot);
    const roles = await loadRoleConfigs(cultivationSimRoot);
    const world = worlds.find((candidate) => candidate.id === "cultivation");
    const roleIds = roles.map((role) => role.id).sort();
    const guChenfeng = roles.find((role) => role.id === "guchenfeng");

    expect(project).toMatchObject({
      version: 1,
      project: { name: "云岭修仙界" },
      defaults: { world: "cultivation", modelProfile: "default" },
      security: {
        requireTrust: true,
        allowProjectShellByDefault: false,
        allowNetworkByDefault: false,
      },
    });
    expect(world).toMatchObject({
      id: "cultivation",
      mode: { type: "simulation", time: { kind: "tick" } },
    });
    expect(Object.keys(world?.rooms ?? {}).sort()).toEqual([
      "god",
      "infirmary",
      "main",
      "sect-hall",
    ]);
    expect(roleIds).toEqual(["guchenfeng", "leijun", "yunyao"]);

    const promptSkill = guChenfeng
      ? await loadRolePromptSkill(cultivationSimRoot, guChenfeng, { worldId: "cultivation" })
      : undefined;
    const callableSkills = await loadCallableSkillsForRole(cultivationSimRoot, {
      roleId: "guchenfeng",
      worldId: "cultivation",
    });
    const initialState = await readFile(
      path.join(cultivationSimRoot, ".agents", "worlds", "cultivation", "initial-state.yaml"),
      "utf8",
    );

    expect(promptSkill?.scope).toBe("role-prompt");
    expect(promptSkill?.content).toContain("calculated risks");
    expect(callableSkills.map((skill) => `${skill.scope}:${skill.name}`).sort()).toEqual([
      "project:world-brief",
      "role-private:battle-journal",
      "world:fate-tick",
      "world:sect-ledger",
    ]);
    expect(initialState).toContain("hiddenState:");
    await expect(
      readFile(path.join(cultivationSimRoot, ".agents", "state", "README.md"), "utf8"),
    ).resolves.toContain("Runtime State");
    await expect(
      readFile(path.join(cultivationSimRoot, ".agents", "logs", "README.md"), "utf8"),
    ).resolves.toContain("Runtime Logs");
  });
});
