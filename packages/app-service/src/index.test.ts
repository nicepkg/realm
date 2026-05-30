import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigAssistantPlanner } from "@realm/assistant";
import { initProject } from "@realm/config";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService", () => {
  test("applies and rolls back role config patches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-config-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const proposal = await service.proposeRole({
      id: "buffett",
      displayName: "Warren Buffett",
      model: "default",
      summary: "Value investor.",
    });
    const applied = await service.applyConfigPatch(proposal.id);
    const rolePath = path.join(root, ".agents", "roles", "buffett", "role.yaml");

    expect(await readFile(rolePath, "utf8")).toContain("Warren Buffett");
    await service.rollbackConfigHistory(applied.historyId);
    await expect(readFile(rolePath, "utf8")).rejects.toThrow();
    await expect(access(path.dirname(rolePath))).rejects.toThrow();
  });

  test("rejects stale config patches without writing or auditing apply", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-config-conflict-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const proposal = await service.proposeRole({
      id: "qa",
      displayName: "QA",
      model: "default",
      summary: "Regression reviewer.",
    });
    const rolePath = path.join(root, ".agents", "roles", "qa", "role.yaml");
    await mkdir(path.dirname(rolePath), { recursive: true });
    await writeFile(rolePath, "version: 1\nid: qa\ndisplayName: Existing QA\n", "utf8");

    await expect(service.applyConfigPatch(proposal.id)).rejects.toThrow(
      "Config conflict at .agents/roles/qa/role.yaml",
    );
    expect(await readFile(rolePath, "utf8")).toContain("Existing QA");
    expect(service.listEvents().map((event) => event.type)).not.toContain("config.patch.applied");
  });

  test("exposes configured role avatars through effective config", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-avatar-"));
    await initProject(root, "demo");
    const roleDir = path.join(root, ".agents", "roles", "leijun");
    await mkdir(roleDir, { recursive: true });
    await writeFile(
      path.join(roleDir, "role.yaml"),
      [
        "version: 1",
        "id: leijun",
        "displayName: Lei Jun",
        "model: default",
        "avatar:",
        "  emoji: 🧭",
        "",
      ].join("\n"),
      "utf8",
    );
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const effective = await service.getEffectiveConfig();

    expect(effective.roles.find((role) => role.id === "leijun")?.avatar).toEqual({
      emoji: "🧭",
    });
  });

  test("requires typed confirmation for high-risk config patches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-config-risk-"));
    await initProject(root, "demo");
    await mkdir(path.join(root, ".agents", "worlds", "cultivation"), { recursive: true });
    await writeFile(
      path.join(root, ".agents", "worlds", "cultivation", "world.yaml"),
      [
        "version: 1",
        "id: cultivation",
        "name: Existing Cultivation",
        "mode:",
        "  type: game",
        "  time:",
        "    kind: manual",
        "rooms:",
        "  main:",
        "    type: world-main",
        "    name: All Hands",
        "roles: []",
        "",
      ].join("\n"),
      "utf8",
    );
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const proposal = await service.proposeWorld({
      id: "cultivation",
      mode: "simulation",
      name: "Existing Cultivation",
      roleIds: [],
      roomName: "All Hands",
    });

    expect(proposal.riskLevel).toBe("high");
    expect(proposal.typedConfirmation).toBe(`APPLY ${proposal.id}`);
    await expect(service.applyConfigPatch(proposal.id)).rejects.toThrow("Type APPLY");

    const applied = await service.applyConfigPatch(proposal.id, {
      confirmation: proposal.typedConfirmation ?? "",
    });
    expect(
      await readFile(path.join(root, ".agents", "worlds", "cultivation", "world.yaml"), "utf8"),
    ).toContain("simulation");
    await service.rollbackConfigHistory(applied.historyId);
    expect(
      await readFile(path.join(root, ".agents", "worlds", "cultivation", "world.yaml"), "utf8"),
    ).toContain("Existing Cultivation");
  });

  test("uses an injected config assistant planner for proposals", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-assistant-"));
    await initProject(root, "demo");
    const planner: ConfigAssistantPlanner = {
      plan: async () => ({
        kind: "role",
        role: {
          id: "architect",
          displayName: "Architect",
          model: "default",
          summary: "Reviews architecture decisions.",
        },
      }),
    };
    const service = new RealmApplicationService({
      root,
      configAssistantPlanner: planner,
      trustTier: "run-roles",
    });

    const proposal = await service.proposeAssistantConfig({ goal: "Add an architect" });

    expect(proposal.operations[0]?.path).toContain(".agents/roles/architect/role.yaml");
    expect(proposal.summary).toContain("Architect");
  });

  test("threads worldId so an assistant add-role attaches to the active world.yaml", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-assistant-attach-"));
    await initProject(root, "demo");
    const worldDir = path.join(root, ".agents", "worlds", "cultivation");
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
    const planner: ConfigAssistantPlanner = {
      plan: async () => ({
        kind: "role",
        role: { id: "yunyao", displayName: "云遥", model: "default", summary: "新弟子" },
      }),
    };
    const service = new RealmApplicationService({
      root,
      configAssistantPlanner: planner,
      trustTier: "run-roles",
    });

    const proposal = await service.proposeAssistantConfig({
      goal: "加一个叫云遥的角色",
      worldId: "cultivation",
    });

    const worldOp = proposal.operations.find(
      (op) => op.path === ".agents/worlds/cultivation/world.yaml",
    );
    expect(worldOp?.action).toBe("update");
    expect(worldOp?.nextContent).toContain("yunyao");
    // The capability stays role.create only — attaching a member is not world creation.
    expect(proposal.requiredCapabilities).toEqual(["role.create"]);
  });

  test("creates runtime group and dm rooms as events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-room-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const group = service.createRoom({
      worldId: "cultivation",
      type: "group",
      name: "Temp Group",
      memberIds: ["owner", "leijun"],
      idempotencyKey: "room-group-1",
    });
    const dm = service.createRoom({
      worldId: "cultivation",
      type: "dm",
      name: "Owner / Lei Jun",
      memberIds: ["owner", "leijun"],
      idempotencyKey: "room-dm-1",
    });

    const rooms = await service.listRooms("cultivation");
    expect(rooms.map((room) => room.id)).toContain(group.id);
    expect(rooms.map((room) => room.id)).toContain(dm.id);
    expect(service.listEvents().map((event) => event.type)).toEqual([
      "room.created",
      "audit.created",
      "room.created",
      "audit.created",
    ]);
  });

  test("updates user and project settings through the service", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-settings-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-app-settings-home-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({
      root,
      env: { REALM_HOME: realmHome },
      trustTier: "run-roles",
    });
    const initial = await service.getSettings();

    await service.updateUserSettings({
      ...initial.user,
      defaultProvider: "google",
      defaultModel: "gemini-2.5-flash",
    });
    const updated = await service.updateProjectSettings({
      ...initial.project,
      project: { name: "demo-renamed" },
      security: { ...initial.project.security, allowNetworkByDefault: true },
    });

    expect(updated.user.defaultProvider).toBe("google");
    expect(updated.project.project.name).toBe("demo-renamed");
    expect(updated.project.security.allowNetworkByDefault).toBe(true);
    expect(service.listEvents().map((event) => event.type)).toContain("audit.created");
  });

  test("reports effective capability and skill policy", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-policy-"));
    const layout = await initProject(root, "demo");
    const roleDir = path.join(layout.rolesDir, "leijun");
    await mkdir(path.join(roleDir, "skills", "private-note"), { recursive: true });
    await mkdir(path.join(layout.worldsDir, "cultivation", "skills", "encounter"), {
      recursive: true,
    });
    await writeFile(
      path.join(roleDir, "role.yaml"),
      ["version: 1", "id: leijun", "displayName: Lei Jun", "model: default", ""].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(layout.worldsDir, "cultivation", "world.yaml"),
      [
        "version: 1",
        "id: cultivation",
        "name: Cultivation",
        "mode:",
        "  type: game",
        "  time:",
        "    kind: manual",
        "rooms:",
        "  main:",
        "    type: world-main",
        "    name: All Hands",
        "roles:",
        "  - id: leijun",
        "    model: default",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(roleDir, "skills", "private-note", "SKILL.md"),
      "# Private Note\n",
      "utf8",
    );
    await writeFile(
      path.join(layout.worldsDir, "cultivation", "skills", "encounter", "SKILL.md"),
      "# Encounter\n",
      "utf8",
    );
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const policy = await service.getEffectivePolicy();

    expect(policy.capabilities.find((item) => item.capability === "shell.run")).toMatchObject({
      allow: false,
      highRisk: true,
    });
    expect(policy.roleWorlds[0]?.allowedSkills.map((skill) => skill.id)).toEqual([
      "role-private:leijun:private-note",
      "world:cultivation:encounter",
    ]);
    expect(policy.warnings).toContain("Network fetch is disabled by project policy.");
  });
});
