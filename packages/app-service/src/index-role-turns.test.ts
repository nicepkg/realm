import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { FakePiBridge, fakeReply } from "@realm/pi-bridge";
import { RealmApplicationService } from "./index.ts";
import { CapturingPiBridge, HangingPiBridge, waitFor } from "./index-test-helpers.ts";

describe("RealmApplicationService role turns", () => {
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

    expect(result.message.content).toBe(fakeReply("leijun", 0));
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
