import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compileCallableSkillPolicy,
  initProject,
  loadProjectConfig,
  projectLayout,
  writeProjectConfig,
} from "./index.ts";

describe("compileCallableSkillPolicy", () => {
  test("compiles role, world, project, and global skills through identity policies", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-skill-policy-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-home-"));
    const layout = await initProject(root, "demo");
    await writeRolePrompt(root, "leijun", "leijun");
    await writeSkill(path.join(layout.rolesDir, "leijun", "skills", "leijun"), "# Persona\n");
    await writeSkill(path.join(layout.rolesDir, "leijun", "skills", "private-note"), "# Private\n");
    await writeSkill(
      path.join(layout.worldsDir, "cultivation", "skills", "encounter"),
      "# World\n",
    );
    await writeSkill(path.join(layout.skillsDir, "shared-allowed"), "# Project Allowed\n");
    await writeSkill(path.join(layout.skillsDir, "shared-blocked"), "# Project Blocked\n");
    await writeSkill(path.join(realmHome, "skills", "global-helper"), "# Global\n");
    const config = await loadProjectConfig(root);
    await writeProjectConfig(root, {
      ...config,
      skills: {
        global: { mode: "allowlist", include: ["global:global-helper"], exclude: [] },
        project: {
          mode: "blacklist",
          include: [".agents/skills/**"],
          exclude: ["project:shared-blocked"],
        },
      },
    });

    const compiled = await compileCallableSkillPolicy(root, {
      roleId: "leijun",
      worldId: "cultivation",
      env: { REALM_HOME: realmHome },
    });

    expect(compiled.allowed.map((skill) => skill.id)).toEqual([
      "global:global-helper",
      "project:shared-allowed",
      "role-private:leijun:private-note",
      "world:cultivation:encounter",
    ]);
    expect(compiled.denied.map((denial) => [denial.skill.id, denial.reason])).toEqual([
      ["project:shared-blocked", "Skill is excluded by policy"],
      ["role-private:leijun:leijun", "Role prompt skill is reserved for the role system prompt"],
    ]);
  });

  test("does not make a role prompt skill callable through broad project roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-skill-prompt-"));
    const layout = await initProject(root, "demo");
    await writeRolePrompt(root, "analyst", "shared-persona", "project");
    await writeSkill(path.join(layout.skillsDir, "shared-persona"), "# Shared Persona\n");

    const broad = await compileCallableSkillPolicy(root, {
      roleId: "analyst",
      worldId: "cultivation",
    });

    expect(broad.allowed.map((skill) => skill.id)).not.toContain("project:shared-persona");
    expect(
      broad.denied.find((denial) => denial.skill.id === "project:shared-persona"),
    ).toMatchObject({
      reason: "Role prompt skill is not callable without an explicit identity include",
    });

    const config = await loadProjectConfig(root);
    await writeProjectConfig(root, {
      ...config,
      skills: {
        ...config.skills,
        project: {
          mode: "blacklist",
          include: [".agents/skills/**", "project:shared-persona"],
          exclude: [],
        },
      },
    });

    const explicit = await compileCallableSkillPolicy(root, {
      roleId: "analyst",
      worldId: "cultivation",
    });

    expect(explicit.allowed.map((skill) => skill.id)).toContain("project:shared-persona");
  });
});

async function writeRolePrompt(
  root: string,
  roleId: string,
  skillName: string,
  source = "role-private",
): Promise<void> {
  const roleDir = path.join(projectLayout(root).rolesDir, roleId);
  await mkdir(roleDir, { recursive: true });
  await writeFile(
    path.join(roleDir, "role.yaml"),
    [
      "version: 1",
      `id: ${roleId}`,
      `displayName: ${roleId}`,
      "model: default",
      "rolePrompt:",
      `  skill: ${skillName}`,
      `  source: ${source}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeSkill(skillDir: string, content: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
}
