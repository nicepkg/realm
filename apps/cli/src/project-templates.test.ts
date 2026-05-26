import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  initProject,
  loadCallableSkillsForRole,
  loadRoleConfigs,
  loadRolePromptSkill,
  loadWorldConfigs,
} from "@realm/config";
import { writeTemplate } from "./project-templates.ts";

describe("project templates", () => {
  test("writes the built-in software company workflow world", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-template-software-"));
    const layout = await initProject(root, "demo");

    await writeTemplate(layout, "software-company");

    const worlds = await loadWorldConfigs(root);
    const softwareCompany = worlds.find((world) => world.id === "software-company");
    const roles = await loadRoleConfigs(root);
    const roleIds = roles.map((role) => role.id).sort();
    const engineer = roles.find((role) => role.id === "engineer");
    const rules = await readFile(
      path.join(layout.worldsDir, "software-company", "rules.yaml"),
      "utf8",
    );

    expect(softwareCompany).toMatchObject({
      id: "software-company",
      mode: { type: "workflow", time: { kind: "manual" } },
    });
    expect(softwareCompany?.rooms).toHaveProperty("reviews");
    expect(roleIds).toEqual([
      "architect",
      "doc-writer",
      "engineer",
      "product-manager",
      "qa",
      "release-manager",
      "security-reviewer",
      "test-expert",
    ]);
    expect(rules).toContain("fs.project.read");
    expect(rules).toContain("fs.project.write");

    const promptSkill = engineer
      ? await loadRolePromptSkill(root, engineer, { worldId: "software-company" })
      : undefined;
    const callableSkills = await loadCallableSkillsForRole(root, {
      roleId: "engineer",
      worldId: "software-company",
    });

    expect(promptSkill?.scope).toBe("role-prompt");
    expect(promptSkill?.content).toContain("senior implementation engineer");
    expect(callableSkills.map((skill) => `${skill.scope}:${skill.name}`)).toEqual([
      "world:artifact-template",
      "world:review-checklist",
    ]);
  });

  test("rejects unknown template names", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-template-unknown-"));
    const layout = await initProject(root, "demo");

    await expect(writeTemplate(layout, "missing")).rejects.toThrow("Unknown template: missing");
  });
});
