import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject, readProjectTrust } from "@realm/config";
import { SQLiteEventStore } from "@realm/storage";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService message access", () => {
  test("defaults to read-only trust when no trust tier is provided", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-read-only-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root });

    await expect(service.getWorldState("cultivation")).resolves.toMatchObject({
      worldId: "cultivation",
      version: 0,
    });
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

  test("setTrust unblocks sending live and persists the tier", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-trust-set-"));
    const realmHome = await mkdtemp(path.join(os.tmpdir(), "realm-app-trust-home-"));
    await initProject(root, "demo");
    const env = { ...process.env, REALM_HOME: realmHome };
    const service = new RealmApplicationService({ root, env });

    expect(() =>
      service.sendMessage({
        worldId: "cultivation",
        roomId: "main",
        operatorId: "owner",
        displayedAuthorId: "owner",
        content: "Blocked until trusted.",
      }),
    ).toThrow("read-only");

    const record = await service.setTrust("run-roles");
    expect(record.trustTier).toBe("run-roles");
    expect((await service.getEffectivePolicy()).trustTier).toBe("run-roles");

    const message = service.sendMessage({
      worldId: "cultivation",
      roomId: "main",
      operatorId: "owner",
      displayedAuthorId: "owner",
      content: "Now allowed.",
      idempotencyKey: "trusted-message-1",
    });
    expect(message.content).toBe("Now allowed.");
    expect(service.listMessages("main")).toHaveLength(1);

    // A fresh service reading the same trust store sees the persisted tier
    // (mirrors how the CLI resolves trust at startup via readProjectTrust).
    const persisted = await readProjectTrust(root, env);
    const reloaded = new RealmApplicationService({ root, env, trustTier: persisted?.tier });
    expect((await reloaded.getEffectivePolicy()).trustTier).toBe("run-roles");
  });
});
