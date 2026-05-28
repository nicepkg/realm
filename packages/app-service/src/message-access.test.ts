import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
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
});
