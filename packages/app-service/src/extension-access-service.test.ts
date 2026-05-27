import { describe, expect, test } from "bun:test";
import { InMemoryEventStore } from "@realm/storage";
import { ExtensionAccessService } from "./extension-access-service.ts";

describe("ExtensionAccessService", () => {
  test("audits successful extension tool access", () => {
    const eventStore = new InMemoryEventStore();
    const audits: Array<{ actorId: string; action: string; target: string; reason: string }> = [];
    const service = new ExtensionAccessService({
      eventStore,
      clock: () => new Date("2026-05-26T00:00:00.000Z"),
      assertAllowed() {},
      appendAudit(input) {
        audits.push(input);
      },
    });
    const session = service.createSession({ worldId: "cultivation", roleId: "leijun" });

    const decision = service.verifyAccess({
      token: session.token,
      worldId: "cultivation",
      roleId: "leijun",
      capability: "state.query",
      toolName: "realm_state_query",
      toolCallId: "tool:state:1",
    });

    expect(decision.allow).toBe(true);
    expect(audits).toEqual([
      {
        actorId: "leijun",
        action: "extension.allowed",
        target: "realm_state_query",
        reason: "state.query allowed",
      },
    ]);
    expect(eventStore.list()[0]).toMatchObject({
      type: "tool.called",
      toolCall: {
        id: "tool:state:1",
        name: "realm_state_query",
        status: "allowed",
      },
    });
  });
});
