import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { SQLiteEventStore } from "@realm/storage";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService world state", () => {
  test("serves visible role state and private memory for Pi tools", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-extension-"));
    await initProject(root, "demo");
    const worldDir = path.join(root, ".agents", "worlds", "cultivation");
    await mkdir(worldDir, { recursive: true });
    await writeFile(
      path.join(worldDir, "initial-state.yaml"),
      [
        "publicState:",
        "  weather: clear",
        "privateState:",
        "  roles:",
        "    leijun:",
        "      hp: 92",
        "hiddenState:",
        "  secret: should-not-leak",
        "metaState:",
        "  roles:",
        "    leijun:",
        "      alive: true",
        "",
      ].join("\n"),
    );
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const state = await service.queryRoleState({ worldId: "cultivation", roleId: "leijun" });
    await service.writeRoleMemory({ roleId: "leijun", content: "remember this" });
    const memory = await service.readRoleMemory({ roleId: "leijun" });

    expect(JSON.stringify(state.state)).toContain("weather");
    expect(JSON.stringify(state.state)).toContain("hp");
    expect(JSON.stringify(state.state)).not.toContain("should-not-leak");
    expect(memory.content).toBe("remember this");
  });

  test("commits admin state patches, snapshots state, and preserves role visibility", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-admin-state-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const response = await service.adminPatchState({
      worldId: "cultivation",
      actorId: "god",
      operations: [{ op: "set", path: "/privateState/roles/leijun/hp", value: 80 }],
      reason: "Boss adjusted Lei Jun HP.",
      idempotencyKey: "hp-80",
    });

    expect(response.result).toMatchObject({ status: "committed", version: 1 });
    expect((await service.getWorldState("cultivation")).version).toBe(1);
    expect(
      await readFile(
        path.join(root, ".agents", "state", "worlds", "cultivation", "current.json"),
        "utf8",
      ),
    ).toContain('"version": 1');
    expect(service.listEvents().map((event) => event.type)).toContain("state.patch.proposed");
    expect(service.listEvents().map((event) => event.type)).toContain("state.patch.committed");

    const leijunState = await service.queryRoleState({ worldId: "cultivation", roleId: "leijun" });
    const guchenfengState = await service.queryRoleState({
      worldId: "cultivation",
      roleId: "guchenfeng",
    });
    expect(JSON.stringify(leijunState.state)).toContain('"hp":80');
    expect(JSON.stringify(guchenfengState.state)).not.toContain('"hp":80');

    const duplicate = await service.adminPatchState({
      worldId: "cultivation",
      operations: [{ op: "set", path: "/privateState/roles/leijun/hp", value: 10 }],
      reason: "Duplicate should not mutate.",
      idempotencyKey: "hp-80",
    });
    expect(duplicate.result.status).toBe("duplicate");
    expect(
      JSON.stringify(
        (await service.queryRoleState({ worldId: "cultivation", roleId: "leijun" })).state,
      ),
    ).toContain('"hp":80');
  });

  test("detects duplicate state patches beyond the SQLite list window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-state-idempotency-"));
    await initProject(root, "demo");
    const store = new SQLiteEventStore(path.join(root, ".agents", "state", "events.sqlite"), {
      defaultListLimit: 5,
    });
    const service = new RealmApplicationService({
      root,
      eventStore: store,
      trustTier: "run-roles",
    });

    await service.adminPatchState({
      worldId: "cultivation",
      operations: [{ op: "set", path: "/privateState/roles/leijun/hp", value: 80 }],
      reason: "Initial HP update.",
      idempotencyKey: "stable-hp",
    });
    for (let index = 0; index < 8; index += 1) {
      store.append({
        eventId: `event:config:${index}`,
        schemaVersion: 1,
        aggregateId: "project:demo",
        idempotencyKey: `config:${index}`,
        createdAt: new Date(1_779_750_000_000 + index).toISOString(),
        type: "config.reloaded",
        projectId: "project:demo",
      });
    }

    const duplicate = await service.adminPatchState({
      worldId: "cultivation",
      operations: [{ op: "set", path: "/privateState/roles/leijun/hp", value: 1 }],
      reason: "Duplicate after many events.",
      idempotencyKey: "stable-hp",
    });

    expect(duplicate.result.status).toBe("duplicate");
    store.close();
  });

  test("applies typed God role actions through controlled state patches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-god-actions-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const kill = await service.applyGodRoleAction({
      worldId: "cultivation",
      action: "kill",
      targetRoleId: "leijun",
      reason: "God adjudicated fatal damage.",
      idempotencyKey: "god-kill-leijun",
    });
    const mute = await service.applyGodRoleAction({
      worldId: "cultivation",
      action: "mute",
      targetRoleId: "leijun",
      expectedVersion: 1,
      reason: "God silenced the role.",
      idempotencyKey: "god-mute-leijun",
    });
    const revive = await service.applyGodRoleAction({
      worldId: "cultivation",
      action: "revive",
      targetRoleId: "leijun",
      expectedVersion: 2,
      reason: "God restored the role.",
      idempotencyKey: "god-revive-leijun",
    });

    expect(kill.patch.operations).toEqual([
      { op: "set", path: "/metaState/roles/leijun/alive", value: false },
    ]);
    expect(mute.patch.operations).toEqual([
      { op: "set", path: "/metaState/roles/leijun/muted", value: true },
    ]);
    expect(revive.patch.operations).toEqual([
      { op: "set", path: "/metaState/roles/leijun/alive", value: true },
      { op: "set", path: "/metaState/roles/leijun/muted", value: false },
    ]);
    expect(revive.result).toMatchObject({ status: "committed", version: 3 });
    expect(
      JSON.stringify(
        (await service.queryRoleState({ worldId: "cultivation", roleId: "leijun" })).state,
      ),
    ).toContain('"alive":true');
    expect(service.listEvents().map((event) => event.type)).toContain("audit.created");
  });

  test("triggers natural events through God-controlled state patches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-natural-event-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const response = await service.triggerNaturalEvent({
      worldId: "cultivation",
      title: "Cave Encounter",
      description: "Lei Jun finds a hidden cave.",
      severity: "major",
      targetRoleIds: ["leijun"],
      operations: [{ op: "set", path: "/privateState/roles/leijun/fortune", value: "cave" }],
      idempotencyKey: "event-cave-leijun",
    });

    expect(response.result).toMatchObject({ status: "committed", version: 1 });
    expect(response.patch.reason).toContain("Natural event [major]: Cave Encounter");
    expect(
      JSON.stringify(
        (await service.queryRoleState({ worldId: "cultivation", roleId: "leijun" })).state,
      ),
    ).toContain('"fortune":"cave"');
    expect(service.listEvents().map((event) => event.type)).toContain("audit.created");
  });

  test("triggers deterministic random natural events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-random-event-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const response = await service.triggerRandomNaturalEvent({
      worldId: "cultivation",
      seed: "day-1",
      targetRoleIds: ["leijun", "guchenfeng"],
      idempotencyKey: "random-day-1",
    });

    expect(response.result.status).toBe("committed");
    expect(response.event.operations.length).toBeGreaterThan(0);
    expect(response.patch.reason).toContain("Natural event");
  });
});
