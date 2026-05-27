import { describe, expect, test } from "bun:test";
import { createInitialState, StateReducer } from "./index.ts";

type TestState = {
  publicState: {
    roles: {
      leijun: {
        hp: number;
      };
    };
  };
};

describe("StateReducer", () => {
  test("commits state patch with version bump", () => {
    const state = createInitialState({ publicState: { roles: { leijun: { hp: 100 } } } });

    const result = new StateReducer().apply(state, {
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      idempotencyKey: "patch-key",
      operations: [{ op: "increment", path: "/publicState/roles/leijun/hp", amount: -10 }],
      reason: "Damage",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.status).toBe("committed");
    expect(state.version).toBe(1);
    expect((state.state as TestState).publicState.roles.leijun.hp).toBe(90);
  });

  test("rejects stale version", () => {
    const state = createInitialState({});
    const result = new StateReducer().apply(state, {
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 1,
      operations: [{ op: "set", path: "/publicState", value: {} }],
      reason: "Invalid",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.status).toBe("rejected");
  });

  test("rejects direct derivedState writes", () => {
    const state = createInitialState({ derivedState: {} });
    const result = new StateReducer().apply(state, {
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      operations: [{ op: "set", path: "/derivedState/combatPower", value: 999 }],
      reason: "Cheat",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.status).toBe("rejected");
  });

  test("rejects operation runtime errors without mutating state", () => {
    const state = createInitialState({ publicState: { roles: { leijun: { hp: "full" } } } });
    const result = new StateReducer().apply(state, {
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      operations: [{ op: "increment", path: "/publicState/roles/leijun/hp", amount: -10 }],
      reason: "Invalid damage",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "rejected",
      currentVersion: 0,
    });
    expect(
      (state.state as { publicState: { roles: { leijun: { hp: string } } } }).publicState.roles
        .leijun.hp,
    ).toBe("full");
  });

  test("rejects traversal into an existing scalar without mutating state", () => {
    const state = createInitialState({ publicState: { roles: { leijun: { hp: 100 } } } });
    const result = new StateReducer().apply(state, {
      id: "patch:1",
      worldId: "cultivation",
      actorId: "god",
      proposedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      operations: [{ op: "set", path: "/publicState/roles/leijun/hp/current", value: 90 }],
      reason: "Invalid nested hit points",
      createdAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "rejected",
      currentVersion: 0,
    });
    expect((state.state as TestState).publicState.roles.leijun.hp).toBe(100);
  });
});
