import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadWorldConfigs, projectLayout } from "@realm/config";
import type {
  Capability,
  GodRoleActionType,
  RealmEvent,
  StatePatch,
  StatePatchOperation,
  StatePatchResult,
} from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import { createInitialState, StateReducer, type WorldState } from "@realm/kernel";
import { buildRandomNaturalEvent } from "@realm/scheduler";
import type { EventStore } from "@realm/storage";
import YAML from "yaml";
import { assertSafePathSegment, OWNER_ID } from "./support.ts";

export type StateQueryInput = {
  worldId: string;
  roleId: string;
  path?: string;
};

export type AdminStatePatchInput = {
  worldId: string;
  actorId?: string;
  expectedVersion?: number;
  operations: StatePatchOperation[];
  reason: string;
  idempotencyKey?: string;
};

export type WorldStateView = {
  worldId: string;
  version: number;
  state: WorldState;
};

export type GodRoleActionInput = {
  worldId: string;
  action: GodRoleActionType;
  targetRoleId: string;
  expectedVersion?: number;
  reason: string;
  idempotencyKey?: string;
};

export type GodRoleActionResult = {
  action: GodRoleActionInput;
  patch: StatePatch;
  result: StatePatchResult;
};

export type NaturalWorldEventInput = {
  worldId: string;
  title: string;
  description: string;
  severity?: "minor" | "major" | "critical";
  targetRoleIds?: string[];
  operations: StatePatchOperation[];
  expectedVersion?: number;
  idempotencyKey?: string;
};

export type NaturalWorldEventResult = {
  event: NaturalWorldEventInput;
  patch: StatePatch;
  result: StatePatchResult;
};

export type RandomNaturalWorldEventInput = {
  worldId: string;
  seed?: string | number;
  targetRoleIds?: string[];
  idempotencyKey?: string;
};

export type WorldStateServiceOptions = {
  root: string;
  eventStore: EventStore;
  clock: () => Date;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class WorldStateService {
  private readonly reducer = new StateReducer();

  constructor(private readonly options: WorldStateServiceOptions) {}

  async queryRoleState(input: StateQueryInput): Promise<{ state: unknown }> {
    this.options.assertAllowed("state.query");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.roleId, "roleId");
    const { state } = await this.getWorldState(input.worldId);
    const visibleState = {
      publicState: readObjectProperty(state, "publicState") ?? {},
      privateState: {
        roles: {
          [input.roleId]: readNestedObject(state, ["privateState", "roles", input.roleId]) ?? {},
        },
      },
      metaState: {
        roles: {
          [input.roleId]: readNestedObject(state, ["metaState", "roles", input.roleId]) ?? {},
        },
      },
    };

    return { state: input.path ? readJsonPointer(visibleState, input.path) : visibleState };
  }

  async getWorldState(worldId: string): Promise<WorldStateView> {
    this.options.assertAllowed("state.query");
    assertSafePathSegment(worldId, "worldId");
    const snapshot = await this.loadWorldStateSnapshot(worldId);
    return { worldId, version: snapshot.version, state: snapshot.state };
  }

  async adminPatchState(
    input: AdminStatePatchInput,
  ): Promise<{ patch: StatePatch; result: StatePatchResult }> {
    this.options.assertAllowed("state.patch.admin");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.actorId ?? "god", "actorId");

    const existing = input.idempotencyKey
      ? this.findCommittedStatePatchByIdempotencyKey(input.idempotencyKey)
      : undefined;
    const snapshot = await this.loadWorldStateSnapshot(input.worldId);
    if (existing) {
      return {
        patch: existing.patch,
        result: {
          status: "duplicate",
          patchId: existing.patch.id,
          version: existing.version,
          state: snapshot.state,
        },
      };
    }

    const createdAt = nowIso(this.options.clock());
    const patch: StatePatch = {
      id: makeId("state-patch", randomUUID()),
      worldId: input.worldId,
      actorId: input.actorId ?? "god",
      proposedBy: OWNER_ID,
      approvedBy: OWNER_ID,
      baseVersion: snapshot.version,
      expectedVersion: input.expectedVersion ?? snapshot.version,
      idempotencyKey: input.idempotencyKey,
      operations: input.operations,
      reason: input.reason,
      createdAt,
    };

    this.options.eventStore.append({
      eventId: makeId("event:state:patch:proposed", patch.id),
      schemaVersion: 1,
      aggregateId: makeId("world", input.worldId),
      idempotencyKey: `state-patch-proposed:${patch.id}`,
      createdAt,
      type: "state.patch.proposed",
      patch,
    });

    const versioned = createInitialState(snapshot.state);
    versioned.version = snapshot.version;
    const result = this.reducer.apply(versioned, patch);
    if (result.status === "committed") {
      await this.saveWorldStateSnapshot(input.worldId, {
        version: result.version,
        state: result.state,
      });
      this.options.eventStore.append({
        eventId: makeId("event:state:patch:committed", patch.id),
        schemaVersion: 1,
        aggregateId: makeId("world", input.worldId),
        idempotencyKey: input.idempotencyKey
          ? `state-patch-admin:${input.idempotencyKey}:committed`
          : `state-patch-committed:${patch.id}`,
        createdAt: nowIso(this.options.clock()),
        type: "state.patch.committed",
        patch,
        version: result.version,
      });
    }

    this.options.appendAudit({
      actorId: OWNER_ID,
      action: result.status === "committed" ? "state.patch.committed" : "state.patch.rejected",
      target: patch.id,
      reason: result.status === "rejected" ? result.reason : patch.reason,
    });

    return { patch, result };
  }

  async applyGodRoleAction(input: GodRoleActionInput): Promise<GodRoleActionResult> {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    assertSafePathSegment(input.targetRoleId, "targetRoleId");
    const response = await this.adminPatchState({
      worldId: input.worldId,
      actorId: "god",
      expectedVersion: input.expectedVersion,
      operations: operationsForGodRoleAction(input.action, input.targetRoleId),
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });

    this.options.appendAudit({
      actorId: "god",
      action: `god.role.${input.action}`,
      target: input.targetRoleId,
      reason: input.reason,
    });

    return {
      action: input,
      patch: response.patch,
      result: response.result,
    };
  }

  async triggerNaturalEvent(input: NaturalWorldEventInput): Promise<NaturalWorldEventResult> {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    for (const roleId of input.targetRoleIds ?? []) {
      assertSafePathSegment(roleId, "targetRoleId");
    }

    const response = await this.adminPatchState({
      worldId: input.worldId,
      actorId: "god",
      expectedVersion: input.expectedVersion,
      operations: input.operations,
      reason: naturalEventReason(input),
      idempotencyKey: input.idempotencyKey,
    });

    this.options.appendAudit({
      actorId: "god",
      action: "god.natural-event.triggered",
      target: input.worldId,
      reason: naturalEventReason(input),
    });

    return {
      event: input,
      patch: response.patch,
      result: response.result,
    };
  }

  async triggerRandomNaturalEvent(
    input: RandomNaturalWorldEventInput,
  ): Promise<NaturalWorldEventResult> {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    const roleIds = input.targetRoleIds ?? (await this.listWorldRoleIds(input.worldId));
    const event = buildRandomNaturalEvent({ worldId: input.worldId, roleIds, seed: input.seed });
    return this.triggerNaturalEvent({
      worldId: input.worldId,
      title: event.title,
      description: event.description,
      severity: event.severity,
      targetRoleIds: event.targetRoleIds,
      operations: event.operations,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private findCommittedStatePatchByIdempotencyKey(
    idempotencyKey: string,
  ): Extract<RealmEvent, { type: "state.patch.committed" }> | undefined {
    const committed = this.options.eventStore.findByIdempotencyKey(
      `state-patch-admin:${idempotencyKey}:committed`,
    );
    if (committed?.type === "state.patch.committed") {
      return committed;
    }

    return this.options.eventStore
      .list({ limit: Number.MAX_SAFE_INTEGER })
      .find(
        (event): event is Extract<RealmEvent, { type: "state.patch.committed" }> =>
          event.type === "state.patch.committed" && event.patch.idempotencyKey === idempotencyKey,
      );
  }

  private async loadWorldStateSnapshot(
    worldId: string,
  ): Promise<{ version: number; state: WorldState }> {
    const currentStatePath = this.worldCurrentStatePath(worldId);
    try {
      const raw = await readFile(currentStatePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isStoredWorldState(parsed)) {
        return { version: parsed.version, state: parsed.state };
      }
    } catch {
      // Fall through to the configured initial state.
    }

    return { version: 0, state: await this.loadWorldInitialState(worldId) };
  }

  private async saveWorldStateSnapshot(
    worldId: string,
    snapshot: { version: number; state: WorldState },
  ): Promise<void> {
    const currentStatePath = this.worldCurrentStatePath(worldId);
    const snapshotPath = path.join(
      path.dirname(currentStatePath),
      "snapshots",
      `${snapshot.version}.json`,
    );
    await Promise.all([
      writeJsonAtomic(currentStatePath, snapshot),
      writeJsonAtomic(snapshotPath, snapshot),
    ]);
  }

  private async loadWorldInitialState(worldId: string): Promise<WorldState> {
    const layout = projectLayout(this.options.root);
    const initialStatePath = path.join(layout.worldsDir, worldId, "initial-state.yaml");
    try {
      const raw = await readFile(initialStatePath, "utf8");
      const parsed = YAML.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : defaultWorldState();
    } catch {
      return defaultWorldState();
    }
  }

  private worldCurrentStatePath(worldId: string): string {
    return path.join(projectLayout(this.options.root).stateDir, "worlds", worldId, "current.json");
  }

  private async listWorldRoleIds(worldId: string): Promise<string[]> {
    const worlds = await loadWorldConfigs(this.options.root);
    return worlds.find((world) => world.id === worldId)?.roles.map((role) => role.id) ?? [];
  }
}

function readObjectProperty(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = target[key];
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNestedObject(
  target: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  let current: unknown = target;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "object" && current !== null
    ? (current as Record<string, unknown>)
    : undefined;
}

function readJsonPointer(target: unknown, pointer: string): unknown {
  if (pointer === "") {
    return target;
  }
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: ${pointer}`);
  }
  let current = target;
  for (const part of pointer
    .slice(1)
    .split("/")
    .map((value) => value.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function isStoredWorldState(value: unknown): value is { version: number; state: WorldState } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "number" &&
    Number.isInteger(candidate.version) &&
    candidate.version >= 0 &&
    typeof candidate.state === "object" &&
    candidate.state !== null &&
    !Array.isArray(candidate.state)
  );
}

function defaultWorldState(): WorldState {
  return {
    publicState: {},
    privateState: { roles: {} },
    hiddenState: {},
    derivedState: {},
    metaState: { roles: {} },
  };
}

function operationsForGodRoleAction(
  action: GodRoleActionType,
  roleId: string,
): StatePatchOperation[] {
  const rolePath = `/metaState/roles/${escapeJsonPointerSegment(roleId)}`;
  if (action === "kill") {
    return [{ op: "set", path: `${rolePath}/alive`, value: false }];
  }
  if (action === "mute") {
    return [{ op: "set", path: `${rolePath}/muted`, value: true }];
  }
  return [
    { op: "set", path: `${rolePath}/alive`, value: true },
    { op: "set", path: `${rolePath}/muted`, value: false },
  ];
}

function naturalEventReason(input: NaturalWorldEventInput): string {
  const severity = input.severity ? ` [${input.severity}]` : "";
  const targets =
    input.targetRoleIds && input.targetRoleIds.length > 0
      ? ` Targets: ${input.targetRoleIds.join(", ")}.`
      : "";
  return `Natural event${severity}: ${input.title}. ${input.description}.${targets}`;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
