import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FileConfigPatchStore,
  initProject,
  loadCallableSkillsForRole,
  loadProjectConfig,
  loadRoleConfigs,
  loadRolePromptSkill,
  loadUserConfig,
  parseUserConfig,
  projectLayout,
  readProjectTrust,
  resolveProjectRoot,
  stringifyYamlPreservingComments,
  trustProject,
  UnsupportedConfigVersionError,
  userConfigDir,
  writeProjectConfig,
  writeUserConfig,
} from "./index.ts";

describe("config project layout", () => {
  test("uses REALM_HOME override", () => {
    expect(userConfigDir({ REALM_HOME: "/tmp/realm-home" })).toBe("/tmp/realm-home");
  });

  test("loads and writes user model settings", async () => {
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-home-"));
    const env = { REALM_HOME: realmHome };

    const initial = await loadUserConfig(env);
    await writeUserConfig(
      {
        ...initial,
        defaultProvider: "google",
        defaultModel: "gemini-2.5-flash",
        providers: [
          {
            id: "google",
            displayName: "Google",
            apiKeyEnv: "GEMINI_API_KEY",
            defaultModel: "gemini-2.5-flash",
            enabled: true,
          },
        ],
      },
      env,
    );
    const saved = await loadUserConfig(env);

    expect(saved.defaultProvider).toBe("google");
    expect(saved.providers[0]?.apiKeyEnv).toBe("GEMINI_API_KEY");
  });

  test("preserves existing YAML comments when writing project settings", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-comments-"));
    const layout = await initProject(root, "demo");
    await writeFile(
      layout.configPath,
      [
        "# Realm project settings",
        "version: 1",
        "project:",
        "  # Human readable name",
        "  name: demo",
        "defaults:",
        "  world: cultivation",
        "  modelProfile: default",
        "skills:",
        "  global:",
        "    mode: blacklist",
        "    include:",
        "      - ~/.realm/skills/**",
        "    exclude: []",
        "  project:",
        "    mode: blacklist",
        "    include:",
        "      - .agents/skills/**",
        "    exclude: []",
        "security:",
        "  requireTrust: true",
        "  allowProjectShellByDefault: false",
        "  # Network stays opt-in by default",
        "  allowNetworkByDefault: false",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = await loadProjectConfig(root);
    await writeProjectConfig(root, {
      ...config,
      project: { name: "renamed" },
      security: { ...config.security, allowNetworkByDefault: true },
    });

    const saved = await readFile(layout.configPath, "utf8");
    expect(saved).toContain("# Human readable name");
    expect(saved).toContain("# Network stays opt-in by default");
    expect(saved).toContain("name: renamed");
    expect(saved).toContain("allowNetworkByDefault: true");
  });

  test("preserves YAML comments through the standalone writer", () => {
    const saved = stringifyYamlPreservingComments(
      ["# Header", "value:", "  # Inline note", "  name: old", ""].join("\n"),
      { value: { name: "new" } },
    );

    expect(saved).toContain("# Header");
    expect(saved).toContain("# Inline note");
    expect(saved).toContain("name: new");
  });

  test("migrates legacy project config without a version", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-migrate-project-"));
    const layout = await initProject(root, "demo");
    await writeFile(
      layout.configPath,
      ["project:", "  name: legacy", "security:", "  allowNetworkByDefault: true", ""].join("\n"),
      "utf8",
    );

    const config = await loadProjectConfig(root);

    expect(config.version).toBe(1);
    expect(config.project.name).toBe("legacy");
    expect(config.defaults.world).toBe("cultivation");
    expect(config.security.requireTrust).toBe(true);
    expect(config.security.allowNetworkByDefault).toBe(true);
  });

  test("migrates legacy user config and rejects unsupported versions", () => {
    const user = parseUserConfig({ defaultProvider: "google" });

    expect(user.version).toBe(1);
    expect(user.defaultProvider).toBe("google");
    expect(user.defaultModel).toBe("gpt-5");
    expect(() => parseUserConfig({ version: 99 })).toThrow(UnsupportedConfigVersionError);
  });

  test("initializes .agents layout idempotently", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-init-"));
    await initProject(root, "demo");
    await initProject(root, "demo");

    const config = await loadProjectConfig(root);
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");

    expect(config.project.name).toBe("demo");
    await expect(
      readFile(path.join(root, ".agents", "config.local.yaml"), "utf8"),
    ).resolves.toContain("Machine-local Realm overrides");
    expect(gitignore).toContain(".agents/state/");
  });

  test("stores project trust in user-local Realm home", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-trust-project-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-trust-home-"));
    const env = { REALM_HOME: realmHome };

    expect(await readProjectTrust(root, env)).toBeUndefined();
    const record = await trustProject(
      root,
      "run-roles",
      env,
      () => new Date("2026-05-26T00:00:00.000Z"),
    );

    expect(record.tier).toBe("run-roles");
    await expect(readProjectTrust(root, env)).resolves.toMatchObject({
      tier: "run-roles",
      trustedAt: "2026-05-26T00:00:00.000Z",
    });
  });

  test("rejects unsafe config patch and history ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-config-safe-id-"));
    await initProject(root, "demo");
    const store = new FileConfigPatchStore(root);

    await expect(store.loadProposal("../escape")).rejects.toThrow();
    await expect(store.rollback("..\\escape")).rejects.toThrow();
  });

  test("proposes a role with a zh-CN summary so the patch card has no English残段", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-role-summary-"));
    await initProject(root, "demo");
    const store = new FileConfigPatchStore(root);

    const proposal = await store.proposeRole({
      id: "leijun",
      displayName: "雷军",
      model: "default",
      summary: "小米创始人",
    });

    expect(proposal.summary).toBe("为「雷军」创建一个项目角色配置。");
    // Title stays English; localizeProposalTitle renders it in the display layer.
    expect(proposal.title).toBe("Create role 雷军");
  });

  test("attaches an added role to the active world.yaml and is idempotent on re-add", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-role-attach-"));
    const layout = await initProject(root, "demo");
    const store = new FileConfigPatchStore(root);

    // Seed an existing world manifest so the attach has something to merge into.
    const worldDir = path.join(layout.worldsDir, "cultivation");
    await mkdir(worldDir, { recursive: true });
    await writeFile(
      path.join(worldDir, "world.yaml"),
      [
        "version: 1",
        "id: cultivation",
        "name: 云岭修仙界",
        "mode:",
        "  type: sandbox",
        "  time:",
        "    kind: manual",
        "rooms:",
        "  main:",
        "    type: world-main",
        "    name: main",
        "roles: []",
        "",
      ].join("\n"),
    );

    const proposal = await store.proposeRole(
      { id: "yunyao", displayName: "云遥", model: "default", summary: "新弟子" },
      "cultivation",
    );

    // The role-create op is still present...
    const roleOp = proposal.operations.find((op) => op.path === ".agents/roles/yunyao/role.yaml");
    expect(roleOp?.action).toBe("create");
    // ...AND a SECOND update op attaches the member to the world manifest.
    const worldOp = proposal.operations.find(
      (op) => op.path === ".agents/worlds/cultivation/world.yaml",
    );
    expect(worldOp?.action).toBe("update");
    expect(worldOp?.nextContent).toContain("yunyao");

    // Attaching a member edits an existing world manifest, which the risk
    // classifier rates high → a typed confirmation is required to apply.
    expect(proposal.typedConfirmation).toBe(`APPLY ${proposal.id}`);
    // Apply it, then re-propose the SAME role: the world is now a member, so the
    // re-add must NOT emit a world.yaml op (idempotent membership).
    await store.apply(proposal.id, { confirmation: proposal.typedConfirmation ?? undefined });
    const reAdd = await store.proposeRole(
      { id: "yunyao", displayName: "云遥", model: "default", summary: "新弟子" },
      "cultivation",
    );
    expect(reAdd.operations.some((op) => op.path === ".agents/worlds/cultivation/world.yaml")).toBe(
      false,
    );
  });

  test("adding a role without a world id stays a standalone role create (no world op)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-role-standalone-"));
    await initProject(root, "demo");
    const store = new FileConfigPatchStore(root);

    const proposal = await store.proposeRole({
      id: "yunyao",
      displayName: "云遥",
      model: "default",
      summary: "新弟子",
    });

    expect(proposal.operations).toHaveLength(1);
    expect(proposal.operations[0]?.path).toBe(".agents/roles/yunyao/role.yaml");
  });

  test("resolves project root from nested directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-root-"));
    await initProject(root, "demo");
    const nested = path.join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, ".keep"), "");

    const resolved = await resolveProjectRoot(nested);
    expect(resolved).toBe(root);
  });

  test("loads role prompt skills separately from callable skills", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-skills-"));
    const layout = await initProject(root, "demo");
    const roleDir = path.join(layout.rolesDir, "leijun");
    const promptSkillDir = path.join(roleDir, "skills", "leijun");
    const privateSkillDir = path.join(roleDir, "skills", "note-taker");
    const toolSkillDir = path.join(layout.worldsDir, "cultivation", "skills", "market-news");
    await mkdir(promptSkillDir, { recursive: true });
    await mkdir(privateSkillDir, { recursive: true });
    await mkdir(toolSkillDir, { recursive: true });
    await writeFile(
      path.join(roleDir, "role.yaml"),
      [
        "version: 1",
        "id: leijun",
        "displayName: Lei Jun",
        "model: default",
        "avatar:",
        "  emoji: 🧭",
        "rolePrompt:",
        "  skill: leijun",
        "  source: role-private",
        "",
      ].join("\n"),
    );
    await writeFile(path.join(promptSkillDir, "SKILL.md"), "# Lei Jun\n\nRole DNA.\n", "utf8");
    await writeFile(path.join(privateSkillDir, "SKILL.md"), "# Note Taker\n\nCallable.\n", "utf8");
    await writeFile(path.join(toolSkillDir, "SKILL.md"), "# Market News\n\nCallable.\n", "utf8");

    const role = (await loadRoleConfigs(root))[0];
    const promptSkill = role ? await loadRolePromptSkill(root, role) : undefined;
    const callableSkills = await loadCallableSkillsForRole(root, {
      roleId: "leijun",
      worldId: "cultivation",
    });

    expect(promptSkill?.scope).toBe("role-prompt");
    expect(promptSkill?.content).toContain("Role DNA");
    expect(role?.avatar).toEqual({ emoji: "🧭" });
    expect(callableSkills.map((skill) => `${skill.scope}:${skill.name}`)).toEqual([
      "role-private:note-taker",
      "world:market-news",
    ]);
    expect(projectLayout(root).skillsDir).toBe(path.join(root, ".agents", "skills"));
  });
});
