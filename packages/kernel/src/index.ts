import type { StatePatch, StatePatchOperation, StatePatchResult } from "@realm/core";

type CommittedPatchResult = Extract<StatePatchResult, { status: "committed" }>;

export type WorldState = Record<string, unknown>;

export type VersionedState = {
  version: number;
  state: WorldState;
  committedIdempotencyKeys: Map<string, CommittedPatchResult>;
};

export function createInitialState(state: WorldState): VersionedState {
  return {
    version: 0,
    state: structuredClone(state),
    committedIdempotencyKeys: new Map(),
  };
}

export class StateReducer {
  apply(current: VersionedState, patch: StatePatch): StatePatchResult {
    if (patch.idempotencyKey) {
      const existing = current.committedIdempotencyKeys.get(patch.idempotencyKey);
      if (existing) {
        return { ...existing, status: "duplicate" };
      }
    }

    if (patch.expectedVersion !== current.version) {
      return {
        status: "rejected",
        patchId: patch.id,
        reason: `Expected version ${patch.expectedVersion}, got ${current.version}`,
        currentVersion: current.version,
      };
    }

    for (const operation of patch.operations) {
      if (operation.path.startsWith("/derivedState")) {
        return {
          status: "rejected",
          patchId: patch.id,
          reason: "Direct writes to derivedState are not allowed",
          currentVersion: current.version,
        };
      }
    }

    const nextState = structuredClone(current.state);

    try {
      for (const operation of patch.operations) {
        applyOperation(nextState, operation);
      }
    } catch (error) {
      return {
        status: "rejected",
        patchId: patch.id,
        reason: error instanceof Error ? error.message : String(error),
        currentVersion: current.version,
      };
    }

    current.version += 1;
    current.state = nextState;

    const result: StatePatchResult = {
      status: "committed",
      patchId: patch.id,
      version: current.version,
      state: structuredClone(current.state),
    };

    if (patch.idempotencyKey) {
      current.committedIdempotencyKeys.set(patch.idempotencyKey, result);
    }

    return result;
  }
}

function applyOperation(target: WorldState, operation: StatePatchOperation): void {
  switch (operation.op) {
    case "set":
      setAtPointer(target, operation.path, operation.value);
      return;
    case "increment": {
      const current = getAtPointer(target, operation.path);
      if (typeof current !== "number") {
        throw new Error(`Cannot increment non-number at ${operation.path}`);
      }
      setAtPointer(target, operation.path, current + operation.amount);
      return;
    }
    case "append": {
      const current = getAtPointer(target, operation.path);
      if (!Array.isArray(current)) {
        throw new Error(`Cannot append to non-array at ${operation.path}`);
      }
      current.push(operation.value);
      return;
    }
    case "remove":
      removeAtPointer(target, operation.path);
      return;
    case "move": {
      const value = getAtPointer(target, operation.from);
      removeAtPointer(target, operation.from);
      setAtPointer(target, operation.path, value);
      return;
    }
  }
}

function pointerParts(pointer: string): string[] {
  if (pointer === "") {
    return [];
  }
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getAtPointer(target: WorldState, pointer: string): unknown {
  let current: unknown = target;
  for (const part of pointerParts(pointer)) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setAtPointer(target: WorldState, pointer: string, value: unknown): void {
  const parts = pointerParts(pointer);
  if (parts.length === 0) {
    throw new Error("Cannot replace root state");
  }

  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const finalPart = parts.at(-1);
  if (!finalPart) {
    throw new Error(`Invalid pointer ${pointer}`);
  }
  current[finalPart] = value;
}

function removeAtPointer(target: WorldState, pointer: string): void {
  const parts = pointerParts(pointer);
  if (parts.length === 0) {
    throw new Error("Cannot remove root state");
  }

  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      return;
    }
    current = next as Record<string, unknown>;
  }

  const finalPart = parts.at(-1);
  if (finalPart) {
    delete current[finalPart];
  }
}
