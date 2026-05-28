import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { projectAuditTimeline } from "./audit-projection.ts";
import { RealmApplicationService } from "./index.ts";

async function setupService(trustTier: "read-only" | "run-roles") {
  const root = await mkdtemp(path.join(os.tmpdir(), "realm-high-risk-"));
  await initProject(root, "demo");
  return { root, service: new RealmApplicationService({ root, trustTier }) };
}

describe("high-risk capability confirmation", () => {
  test("a high-risk config patch (modifying existing config) requires a typed confirmation", async () => {
    const { service } = await setupService("run-roles");

    // Create a world first (low-risk creates), then re-propose the SAME world id.
    // Re-proposing an existing world produces UPDATE operations under
    // `.agents/worlds/<id>/`, which classify as high-risk and demand a typed
    // confirmation — the L4 gate for destructive/world-definition changes.
    const create = await service.proposeWorld({
      id: "arena",
      name: "Arena",
      mode: "sandbox",
      roleIds: [],
      roomName: "All Hands",
    });
    await service.applyConfigPatch(create.id);

    const update = await service.proposeWorld({
      id: "arena",
      name: "Arena Reworked",
      mode: "game",
      roleIds: [],
      roomName: "All Hands",
    });

    expect(update.riskLevel).toBe("high");
    expect(update.typedConfirmation).toBe(`APPLY ${update.id}`);

    // Applying without the typed confirmation is rejected.
    await expect(service.applyConfigPatch(update.id, {})).rejects.toThrow(/APPLY/);

    // Applying WITH the typed confirmation succeeds.
    const applied = await service.applyConfigPatch(update.id, {
      confirmation: `APPLY ${update.id}`,
    });
    expect(applied.patchId).toBe(update.id);
  });
});

describe("audit visibility", () => {
  test("impersonation, tool, state-patch, and denial events surface in the audit timeline", async () => {
    const { service } = await setupService("read-only");

    // A blocked send in read-only emits a policy.denied audit (denied=true).
    expect(() =>
      service.sendMessage({
        worldId: "cultivation",
        roomId: "main",
        operatorId: "owner",
        content: "hello",
      }),
    ).toThrow();

    const audits = service.listAudits("cultivation").audits;
    const denied = audits.filter((entry) => entry.denied);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied[0]?.kind).toBe("audit");
    expect(denied[0]?.action).toContain("denied");
  });

  test("projectAuditTimeline normalizes each audit-relevant event kind", () => {
    const base = {
      schemaVersion: 1,
      aggregateId: "world",
      createdAt: "2026-05-29T00:00:00.000Z",
    } as const;
    const audits = projectAuditTimeline([
      {
        ...base,
        eventId: "event-impersonate",
        seq: 1,
        type: "audit.created",
        audit: {
          id: "audit-1",
          actorId: "owner",
          action: "role.impersonate",
          target: "leijun",
          reason: "Displayed author: leijun",
          createdAt: base.createdAt,
        },
      },
      {
        ...base,
        eventId: "event-tool",
        seq: 2,
        type: "tool.called",
        traceId: "trace-1",
        toolCall: { id: "t1", name: "memory.read", status: "completed" },
      },
      {
        ...base,
        eventId: "event-patch",
        seq: 3,
        type: "state.patch.committed",
        version: 4,
        patch: {
          id: "patch-1",
          worldId: "cultivation",
          actorId: "god",
          proposedBy: "god",
          baseVersion: 3,
          expectedVersion: 3,
          operations: [{ op: "set", path: "/season", value: "winter" }],
          reason: "Seasonal shift",
          createdAt: base.createdAt,
        },
      },
    ] as Parameters<typeof projectAuditTimeline>[0]);

    expect(audits.map((entry) => entry.kind)).toEqual(["impersonation", "tool", "state-patch"]);
    expect(audits[0]?.visibility).toBe("leijun");
    expect(audits[2]?.target).toBe("cultivation");
  });
});
