import { describe, expect, test } from "bun:test";
import {
  createSimConfirmation,
  decideSimConfirmation,
  type TuiPendingSimAction,
} from "./sim-confirmation.ts";
import type { TuiSimAction, TuiState } from "./types.ts";

function stateWithWorld(): TuiState {
  return {
    projectName: "demo",
    worlds: [],
    world: { id: "cultivation", name: "Cultivation Sim" },
    rooms: [],
    roles: [],
    messages: [],
    events: [],
    identity: "god",
  } as unknown as TuiState;
}

describe("createSimConfirmation gating", () => {
  test("a single tick arms a confirmation (no fast-path; one tick is an irreversible write)", () => {
    const action: TuiSimAction = { kind: "tick", ticks: 1 };
    const pending = createSimConfirmation(stateWithWorld(), action);
    expect(pending?.action).toEqual({ kind: "tick", ticks: 1 });
    expect(pending?.worldId).toBe("cultivation");
  });

  test("a multi-tick advance arms a confirmation", () => {
    const pending = createSimConfirmation(stateWithWorld(), { kind: "tick", ticks: 5 });
    expect(pending?.action).toEqual({ kind: "tick", ticks: 5 });
    expect(pending?.worldId).toBe("cultivation");
  });

  test("fork arms a confirmation", () => {
    const pending = createSimConfirmation(stateWithWorld(), { kind: "fork", label: "branch-a" });
    expect(pending?.action).toEqual({ kind: "fork", label: "branch-a" });
  });

  test("non-destructive actions never arm a confirmation", () => {
    for (const action of [
      { kind: "status" },
      { kind: "pause" },
      { kind: "resume" },
      { kind: "export" },
    ] satisfies TuiSimAction[]) {
      expect(createSimConfirmation(stateWithWorld(), action)).toBeUndefined();
    }
  });

  test("no active world means no confirmation (caller guards separately)", () => {
    const state = { ...stateWithWorld(), world: undefined } as TuiState;
    expect(createSimConfirmation(state, { kind: "tick", ticks: 5 })).toBeUndefined();
  });
});

describe("decideSimConfirmation", () => {
  const pending: TuiPendingSimAction = {
    action: { kind: "tick", ticks: 1 },
    worldId: "cultivation",
    worldName: "Cultivation Sim",
  };

  test("a single-tick confirmation still requires re-typing the exact world id", () => {
    expect(decideSimConfirmation(" cultivation ", pending)).toBe("confirm");
    expect(decideSimConfirmation("cultivatio", pending)).toBe("pending");
    expect(decideSimConfirmation("1", pending)).toBe("pending");
  });

  test("a bare y stays pending so stray chat never commits", () => {
    expect(decideSimConfirmation("y", pending)).toBe("pending");
  });

  test("explicit n/no/cancel aborts", () => {
    expect(decideSimConfirmation("n", pending)).toBe("cancel");
    expect(decideSimConfirmation("cancel", pending)).toBe("cancel");
  });
});
