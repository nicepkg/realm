import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ConfigAssistantPlanner } from "@realm/assistant";
import { initProject } from "@realm/config";
import {
  AsyncEventQueue,
  FakePiBridge,
  type PiBridge,
  type PiBridgeEvent,
  type PiPromptInput,
  type PiSessionHandle,
  type PiSessionStartInput,
} from "@realm/pi-bridge";
import { SQLiteEventStore } from "@realm/storage";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService", () => {
  test("defaults to read-only trust when no trust tier is provided", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-read-only-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root });

    expect(() =>
      service.sendMessage({
        worldId: "cultivation",
        roomId: "main",
        operatorId: "owner",
        displayedAuthorId: "owner",
        content: "Blocked until trusted.",
      }),
    ).toThrow("read-only");
    expect(service.listEvents().map((event) => event.type)).toEqual(["audit.created"]);
    expect(service.listEvents()[0]).toMatchObject({
      audit: { action: "policy.denied", target: "message.send" },
    });
  });

  test("persists messages and audits impersonation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-message-"));
    await initProject(root, "demo");
    const store = new SQLiteEventStore(path.join(root, ".agents", "state", "events.sqlite"));
    const service = new RealmApplicationService({
      root,
      eventStore: store,
      trustTier: "run-roles",
    });

    const message = service.sendMessage({
      worldId: "cultivation",
      roomId: "main",
      operatorId: "owner",
      displayedAuthorId: "leijun",
      content: "Ship it.",
      idempotencyKey: "message-1",
    });

    expect(message.realOperatorId).toBe("owner");
    expect(service.listMessages("main")).toHaveLength(1);
    expect(service.listEvents().map((event) => event.type)).toEqual([
      "message.created",
      "audit.created",
    ]);
    store.close();
  });

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
      defaultModel: "gemini-3.5-pro",
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
    expect(start?.systemPrompt).toContain("role-private:note-taker");
    expect(start?.allowedSkillPaths).toEqual([callableSkillDir]);
    expect(start?.extensionPaths).toEqual(["/extensions/realm.ts"]);
    expect(start?.env).toMatchObject({
      REALM_EXTENSION_BASE_URL: "http://127.0.0.1:3999",
      REALM_EXTENSION_WORLD_ID: "cultivation",
      REALM_EXTENSION_ROLE_ID: "leijun",
    });
    expect(start?.env?.REALM_EXTENSION_TOKEN).toMatch(/^realm_ext_/);
  });
});

class CapturingPiBridge extends FakePiBridge {
  readonly starts: PiSessionStartInput[] = [];

  override async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    this.starts.push(input);
    return super.startSession(input);
  }
}

class HangingPiBridge implements PiBridge {
  sessionId?: string;
  private queue?: AsyncEventQueue<PiBridgeEvent>;

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    this.sessionId = `hanging-${crypto.randomUUID()}`;
    this.queue = new AsyncEventQueue<PiBridgeEvent>();
    this.queue.push({
      type: "session.started",
      sessionId: this.sessionId,
      sessionDir: input.sessionDir,
    });
    return { id: this.sessionId, sessionDir: input.sessionDir, events: this.queue };
  }

  async sendPrompt(sessionId: string, _input: PiPromptInput): Promise<void> {
    this.queue?.push({ type: "prompt.accepted", sessionId, requestId: "request-hanging" });
  }

  async abort(sessionId: string): Promise<void> {
    this.queue?.push({ type: "session.aborted", sessionId });
  }

  async dispose(sessionId: string): Promise<void> {
    this.queue?.push({ type: "session.disposed", sessionId });
    this.queue?.close();
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
