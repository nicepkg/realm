import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigAssistantPlanner } from "@realm/assistant";
import { initProject } from "@realm/config";
import { FakePiBridge } from "@realm/pi-bridge";
import { RealmApplicationService } from "./index.ts";
import { CapturingPiBridge, HangingPiBridge, waitFor } from "./index-test-helpers.ts";

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

  test("runs a role turn through the configured Pi bridge", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-role-turn-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({
      root,
      piBridge: new FakePiBridge(),
      trustTier: "run-roles",
    });
    const proposal = await service.proposeRole({
      id: "leijun",
      displayName: "Lei Jun",
      model: "default",
      summary: "Product builder.",
    });
    await service.applyConfigPatch(proposal.id);

    const result = await service.runRoleTurn({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      prompt: "Hello",
      timeoutMs: 500,
    });

    expect(result.message.content).toBe("[leijun] Hello");
    expect(service.listEvents().map((event) => event.type)).toContain("turn.started");
    expect(service.listEvents().map((event) => event.type)).toContain("message.created");
    expect(service.listEvents().map((event) => event.type)).toContain("turn.completed");
  });

  test("passes user provider settings into role turns", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-role-model-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-app-role-model-home-"));
    await initProject(root, "demo");
    const piBridge = new CapturingPiBridge();
    const service = new RealmApplicationService({
      root,
      env: { REALM_HOME: realmHome, GEMINI_API_KEY: "secret" },
      piBridge,
      trustTier: "run-roles",
    });
    const proposal = await service.proposeRole({
      id: "analyst",
      displayName: "Analyst",
      model: "google",
      summary: "Uses the configured Google model provider.",
    });
    await service.applyConfigPatch(proposal.id);

    await service.runRoleTurn({
      worldId: "cultivation",
      roomId: "main",
      roleId: "analyst",
      prompt: "Hello",
      timeoutMs: 500,
    });

    expect(piBridge.starts[0]).toMatchObject({
      provider: "google",
      model: "gemini-2.5-flash",
    });
    expect(piBridge.starts[0]?.env).toMatchObject({
      GEMINI_API_KEY: "secret",
      REALM_EXTENSION_WORLD_ID: "cultivation",
      REALM_EXTENSION_ROLE_ID: "analyst",
    });
  });

  test("runs deterministic fake vertical slice followup from an @all message", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-fake-vertical-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({
      root,
      fakeVerticalSlice: true,
      trustTier: "run-roles",
    });

    service.sendMessage({
      worldId: "cultivation",
      roomId: "main",
      operatorId: "owner",
      displayedAuthorId: "owner",
      content: "@all 今天谁先突破？",
      idempotencyKey: "owner-fake-message",
    });
    await waitFor(() =>
      service
        .listEvents()
        .some((event) => event.type === "state.patch.committed" && event.version === 1),
    );

    expect(service.listMessages("main").map((message) => message.authorId)).toEqual([
      "owner",
      "leijun",
      "guchenfeng",
    ]);
    expect(
      JSON.stringify(
        (await service.queryRoleState({ worldId: "cultivation", roleId: "guchenfeng" })).state,
      ),
    ).toContain('"hp":92');
  });

  test("starts and cancels a background role turn", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-turn-cancel-"));
    await initProject(root, "demo");
    const piBridge = new HangingPiBridge();
    const service = new RealmApplicationService({ root, piBridge, trustTier: "run-roles" });
    const proposal = await service.proposeRole({
      id: "leijun",
      displayName: "Lei Jun",
      model: "default",
      summary: "Product builder.",
    });
    await service.applyConfigPatch(proposal.id);

    const started = service.startRoleTurn({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      prompt: "Wait",
      timeoutMs: 5000,
    });
    await waitFor(() => piBridge.sessionId !== undefined);
    const cancelled = service.cancelTurn(started.turnId);
    await waitFor(() =>
      service
        .listEvents()
        .some(
          (event) =>
            event.type === "turn.cancelled" &&
            event.turn.id === started.turnId &&
            event.turn.status === "cancelled",
        ),
    );

    expect(cancelled.cancelled).toBe(true);
  });

  test("compiles role prompt skills and injects scoped extension environment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-role-prompt-"));
    const layout = await initProject(root, "demo");
    const roleDir = path.join(layout.rolesDir, "leijun");
    const promptSkillDir = path.join(roleDir, "skills", "leijun");
    const callableSkillDir = path.join(roleDir, "skills", "note-taker");
    await mkdir(promptSkillDir, { recursive: true });
    await mkdir(callableSkillDir, { recursive: true });
    await writeFile(
      path.join(roleDir, "role.yaml"),
      [
        "version: 1",
        "id: leijun",
        "displayName: Lei Jun",
        "model: default",
        "profile:",
        "  summary: Product builder.",
        "rolePrompt:",
        "  skill: leijun",
        "  source: role-private",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(promptSkillDir, "SKILL.md"), "# Lei Jun\n\nRole DNA.\n", "utf8");
    await writeFile(path.join(callableSkillDir, "SKILL.md"), "# Note Taker\n\nCallable.\n", "utf8");
    const piBridge = new CapturingPiBridge();
    const service = new RealmApplicationService({
      root,
      piBridge,
      extensionBaseUrl: "http://127.0.0.1:3999",
      piExtensionPath: "/extensions/realm.ts",
      trustTier: "run-roles",
    });

    await service.runRoleTurn({
      worldId: "cultivation",
      roomId: "main",
      roleId: "leijun",
      prompt: "Hello",
      timeoutMs: 500,
    });

    const start = piBridge.starts[0];
    expect(start?.systemPrompt).toContain("Role DNA");
    expect(start?.systemPrompt).toContain("role-private:leijun:note-taker");
    expect(start?.allowedSkillPaths).toEqual([callableSkillDir]);
    expect(start?.allowedSkills).toEqual([
      expect.objectContaining({
        id: "role-private:leijun:note-taker",
        name: "note-taker",
        scope: "role-private",
        path: callableSkillDir,
      }),
    ]);
    expect(start?.extensionPaths).toEqual(["/extensions/realm.ts"]);
    expect(start?.env).toMatchObject({
      REALM_EXTENSION_BASE_URL: "http://127.0.0.1:3999",
      REALM_EXTENSION_WORLD_ID: "cultivation",
      REALM_EXTENSION_ROLE_ID: "leijun",
    });
    expect(start?.env?.REALM_EXTENSION_TOKEN).toMatch(/^realm_ext_/);
  });
});
