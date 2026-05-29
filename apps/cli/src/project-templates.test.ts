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

  test("seeds Chinese display strings under a zh-CN locale (cultivation)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-template-zh-"));
    const layout = await initProject(root, "demo");

    await writeTemplate(layout, "cultivation", "zh-CN");

    const worldYaml = await readFile(
      path.join(layout.worldsDir, "cultivation", "world.yaml"),
      "utf8",
    );
    const stateYaml = await readFile(
      path.join(layout.worldsDir, "cultivation", "initial-state.yaml"),
      "utf8",
    );
    const eventsYaml = await readFile(
      path.join(layout.worldsDir, "cultivation", "events.yaml"),
      "utf8",
    );

    // Ids / enums stay stable + English.
    expect(worldYaml).toContain("id: cultivation");
    expect(worldYaml).toContain("type: game");
    expect(worldYaml).toContain("type: world-main");
    // Display strings localized.
    expect(worldYaml).toContain("修真演示");
    expect(worldYaml).toContain("全员议事");
    expect(stateYaml).toContain("雷军");
    expect(stateYaml).toContain("顾辰风");
    expect(eventsYaml).toContain("小机缘");
    // No English display leaks.
    expect(worldYaml).not.toContain("All Hands");
    expect(worldYaml).not.toContain("Cultivation Demo");
    expect(stateYaml).not.toContain("Lei Jun");
    expect(eventsYaml).not.toContain("Minor Fortune");

    const worlds = await loadWorldConfigs(root);
    expect(worlds.find((world) => world.id === "cultivation")?.name).toBe("修真演示");
  });

  test("keeps English display strings under a non-Chinese locale (cultivation)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-template-en-"));
    const layout = await initProject(root, "demo");

    await writeTemplate(layout, "cultivation", "en");

    const worldYaml = await readFile(
      path.join(layout.worldsDir, "cultivation", "world.yaml"),
      "utf8",
    );
    expect(worldYaml).toContain("Cultivation Demo");
    expect(worldYaml).toContain("All Hands");
    expect(worldYaml).not.toContain("修真演示");
  });

  test("localizes the software-company world + rooms under zh-CN", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-template-sc-zh-"));
    const layout = await initProject(root, "demo");

    await writeTemplate(layout, "software-company", "zh-CN");

    const worldYaml = await readFile(
      path.join(layout.worldsDir, "software-company", "world.yaml"),
      "utf8",
    );
    expect(worldYaml).toContain("id: software-company");
    expect(worldYaml).toContain("type: workflow");
    expect(worldYaml).toContain("软件公司");
    expect(worldYaml).toContain("全员议事");
    expect(worldYaml).toContain("分诊");
    expect(worldYaml).toContain("评审室");
    expect(worldYaml).toContain("天道裁决官");
    expect(worldYaml).not.toContain("All Hands");
    expect(worldYaml).not.toContain("Triage");
    expect(worldYaml).not.toContain("Review Room");

    // Role ids stay stable + English even when display names are Chinese.
    const roles = await loadRoleConfigs(root);
    expect(roles.map((role) => role.id).sort()).toEqual([
      "architect",
      "doc-writer",
      "engineer",
      "product-manager",
      "qa",
      "release-manager",
      "security-reviewer",
      "test-expert",
    ]);
    expect(roles.find((role) => role.id === "engineer")?.displayName).toBe("工程师");
  });
});
