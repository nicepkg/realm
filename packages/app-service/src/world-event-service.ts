import { createHash, randomUUID } from "node:crypto";
import type {
  Capability,
  Message,
  RealmEvent,
  StatePatch,
  StatePatchOperation,
  StatePatchResult,
  WorldEventCondition,
  WorldEventRecord,
  WorldEventSeverity,
  WorldTickRecord,
} from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import { buildRandomNaturalEvent } from "@realm/scheduler";
import type { EventStore } from "@realm/storage";
import type { SendMessageInput } from "./message-service.ts";
import { assertSafePathSegment, readJsonPointer } from "./support.ts";
import type { AdminStatePatchInput, WorldStateView } from "./world-state-service.ts";

export type WorldEventTriggerInput = {
  worldId: string;
  title: string;
  description: string;
  severity?: WorldEventSeverity;
  targetRoleIds?: string[];
  seed?: string | number;
  operations: StatePatchOperation[];
  expectedVersion?: number;
  roomId?: string;
  message?: string;
  idempotencyKey?: string;
};

export type RandomWorldEventInput = {
  worldId: string;
  seed?: string | number;
  targetRoleIds?: string[];
  roomId?: string;
  idempotencyKey?: string;
};

export type TickWorldEventInput = RandomWorldEventInput & {
  tick?: number;
};

export type ConditionWorldEventInput = WorldEventTriggerInput & {
  condition: WorldEventCondition;
};

export type WorldEventTriggerResult = {
  event: WorldEventRecord;
  patch?: StatePatch;
  result?: StatePatchResult;
  message?: Message;
};

export type WorldTickTriggerResult = WorldEventTriggerResult & {
  tick: WorldTickRecord;
};

export type WorldEventReplay = {
  worldId: string;
  fromSeq: number;
  toSeq: number;
  replayHash: string;
  events: readonly RealmEvent[];
};

export type WorldEventServiceOptions = {
  eventStore: EventStore;
  clock: () => Date;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
  commitStatePatch: (
    input: AdminStatePatchInput,
  ) => Promise<{ patch: StatePatch; result: StatePatchResult }>;
  getWorldState: (worldId: string) => Promise<WorldStateView>;
  listWorldRoleIds: (worldId: string) => Promise<string[]>;
  sendMessage: (input: SendMessageInput) => Message;
};

type TriggerKind = WorldEventRecord["kind"];

export class WorldEventService {
  constructor(private readonly options: WorldEventServiceOptions) {}

  triggerManualEvent(input: WorldEventTriggerInput): Promise<WorldEventTriggerResult> {
    return this.triggerEvent("manual", input);
  }

  async triggerRandomEvent(input: RandomWorldEventInput): Promise<WorldEventTriggerResult> {
    this.validateWorldEventScope(input.worldId, input.targetRoleIds ?? []);
    const roleIds = input.targetRoleIds ?? (await this.options.listWorldRoleIds(input.worldId));
    const plan = buildRandomNaturalEvent({ worldId: input.worldId, roleIds, seed: input.seed });
    return this.triggerEvent("random", {
      worldId: input.worldId,
      title: plan.title,
      description: plan.description,
      severity: plan.severity,
      targetRoleIds: plan.targetRoleIds,
      seed: input.seed,
      operations: plan.operations,
      roomId: input.roomId,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async triggerTick(input: TickWorldEventInput): Promise<WorldTickTriggerResult> {
    this.options.assertAllowed("god.admin");
    assertSafePathSegment(input.worldId, "worldId");
    const tick = input.tick ?? this.nextTick(input.worldId);
    const seed = input.seed ?? `${input.worldId}:tick:${tick}`;
    const idempotencyKey = input.idempotencyKey ?? `${input.worldId}:${tick}`;
    const existing = this.findTickByKey(idempotencyKey);
    if (existing) {
      return { tick: existing.tick, event: this.findWorldEvent(existing.tick.eventId) };
    }

    const eventResult = await this.triggerRandomEvent({
      worldId: input.worldId,
      seed,
      targetRoleIds: input.targetRoleIds,
      roomId: input.roomId,
      idempotencyKey: `tick-event:${idempotencyKey}`,
    });
    const tickRecord: WorldTickRecord = {
      id: makeId("world-tick", randomUUID()),
      worldId: input.worldId,
      tick,
      seed,
      eventId: eventResult.event.id,
      stateVersion: eventResult.event.stateVersion,
      status: "triggered",
      createdAt: nowIso(this.options.clock()),
    };
    const appended = this.options.eventStore.append({
      eventId: makeId("event:world-tick", tickRecord.id),
      schemaVersion: 1,
      aggregateId: makeId("world", input.worldId),
      idempotencyKey: this.tickKey(idempotencyKey),
      createdAt: tickRecord.createdAt,
      type: "world.tick.triggered",
      tick: tickRecord,
    });
    if (appended.type !== "world.tick.triggered") {
      throw new Error("Idempotency key collision returned a non-tick event");
    }
    this.options.appendAudit({
      actorId: "god",
      action: "world.tick.triggered",
      target: appended.tick.id,
      reason: `Tick ${tick} triggered ${eventResult.event.title}.`,
    });
    return { ...eventResult, tick: appended.tick };
  }

  async triggerConditionEvent(input: ConditionWorldEventInput): Promise<WorldEventTriggerResult> {
    this.options.assertAllowed("god.admin");
    this.validateWorldEventScope(input.worldId, input.targetRoleIds ?? []);
    const view = await this.options.getWorldState(input.worldId);
    if (!conditionMatches(readJsonPointer(view.state, input.condition.path), input.condition)) {
      return this.appendSkippedEvent("condition", input, "Condition did not match current state.");
    }
    return this.triggerEvent("condition", input);
  }

  triggerGodAdjudicatedEvent(input: WorldEventTriggerInput): Promise<WorldEventTriggerResult> {
    return this.triggerEvent("god-adjudicated", input);
  }

  getReplay(input: { worldId: string; afterSeq?: number; limit?: number }): WorldEventReplay {
    this.options.assertAllowed("trace.read");
    assertSafePathSegment(input.worldId, "worldId");
    const afterSeq = input.afterSeq ?? 0;
    const events = this.options.eventStore
      .list({ afterSeq, limit: input.limit ?? 1_000 })
      .filter((event) => belongsToWorld(event, input.worldId));
    return {
      worldId: input.worldId,
      fromSeq: events[0]?.seq ?? afterSeq,
      toSeq: events.at(-1)?.seq ?? afterSeq,
      replayHash: hashReplay(events),
      events,
    };
  }

  private async triggerEvent(
    kind: TriggerKind,
    input: WorldEventTriggerInput,
  ): Promise<WorldEventTriggerResult> {
    this.options.assertAllowed("god.admin");
    this.validateWorldEventScope(input.worldId, input.targetRoleIds ?? []);
    const existing = input.idempotencyKey
      ? this.findWorldEventByKey(kind, input.idempotencyKey)
      : undefined;
    if (existing) {
      return { event: existing.event };
    }

    const patchResponse = await this.options.commitStatePatch({
      worldId: input.worldId,
      actorId: "god",
      expectedVersion: input.expectedVersion,
      operations: input.operations,
      reason: eventReason(kind, input),
      idempotencyKey: input.idempotencyKey
        ? `world-event-patch:${kind}:${input.idempotencyKey}`
        : undefined,
    });
    const status = statusFromPatchResult(patchResponse.result);
    const message =
      input.roomId && status !== "rejected"
        ? this.options.sendMessage({
            worldId: input.worldId,
            roomId: input.roomId,
            operatorId: "god",
            displayedAuthorId: "god",
            content: input.message ?? formatWorldEventMessage(input, patchResponse.result),
            idempotencyKey: input.idempotencyKey
              ? `world-event-message:${kind}:${input.idempotencyKey}`
              : undefined,
          })
        : undefined;
    const record = this.buildRecord(kind, input, {
      messageId: message?.id,
      patchId: patchResponse.patch.id,
      status,
      stateVersion:
        patchResponse.result.status === "committed" || patchResponse.result.status === "duplicate"
          ? patchResponse.result.version
          : undefined,
      reason: patchResponse.result.status === "rejected" ? patchResponse.result.reason : undefined,
    });
    const appended = this.appendWorldEvent(kind, input.idempotencyKey, record);
    this.options.appendAudit({
      actorId: "god",
      action: `world.event.${kind}`,
      target: appended.event.id,
      reason: eventReason(kind, input),
    });
    return {
      event: appended.event,
      patch: patchResponse.patch,
      result: patchResponse.result,
      message,
    };
  }

  private appendSkippedEvent(
    kind: TriggerKind,
    input: ConditionWorldEventInput,
    reason: string,
  ): WorldEventTriggerResult {
    const record = this.buildRecord(kind, input, { status: "skipped", reason });
    const appended = this.appendWorldEvent(kind, input.idempotencyKey, record);
    this.options.appendAudit({
      actorId: "god",
      action: `world.event.${kind}.skipped`,
      target: appended.event.id,
      reason,
    });
    return { event: appended.event };
  }

  private buildRecord(
    kind: TriggerKind,
    input: WorldEventTriggerInput | ConditionWorldEventInput,
    result: {
      status: WorldEventRecord["status"];
      patchId?: string;
      messageId?: string;
      stateVersion?: number;
      reason?: string;
    },
  ): WorldEventRecord {
    return {
      id: makeId("world-event", randomUUID()),
      worldId: input.worldId,
      kind,
      title: input.title,
      description: input.description,
      severity: input.severity ?? "minor",
      targetRoleIds: input.targetRoleIds ?? [],
      seed: input.seed,
      condition: "condition" in input ? input.condition : undefined,
      patchId: result.patchId,
      messageId: result.messageId,
      stateVersion: result.stateVersion,
      status: result.status,
      reason: result.reason,
      createdAt: nowIso(this.options.clock()),
    };
  }

  private appendWorldEvent(
    kind: TriggerKind,
    idempotencyKey: string | undefined,
    record: WorldEventRecord,
  ): Extract<RealmEvent, { type: "world.event.triggered" }> {
    const event = this.options.eventStore.append({
      eventId: makeId("event:world-event", record.id),
      schemaVersion: 1,
      aggregateId: makeId("world", record.worldId),
      idempotencyKey: idempotencyKey ? this.eventKey(kind, idempotencyKey) : undefined,
      createdAt: record.createdAt,
      type: "world.event.triggered",
      event: record,
    });
    if (event.type !== "world.event.triggered") {
      throw new Error("Idempotency key collision returned a non-world-event event");
    }
    return event;
  }

  private validateWorldEventScope(worldId: string, roleIds: string[]): void {
    assertSafePathSegment(worldId, "worldId");
    for (const roleId of roleIds) {
      assertSafePathSegment(roleId, "targetRoleId");
    }
  }

  private findWorldEventByKey(
    kind: TriggerKind,
    idempotencyKey: string,
  ): Extract<RealmEvent, { type: "world.event.triggered" }> | undefined {
    const event = this.options.eventStore.findByIdempotencyKey(this.eventKey(kind, idempotencyKey));
    return event?.type === "world.event.triggered" ? event : undefined;
  }

  private findTickByKey(
    idempotencyKey: string,
  ): Extract<RealmEvent, { type: "world.tick.triggered" }> | undefined {
    const event = this.options.eventStore.findByIdempotencyKey(this.tickKey(idempotencyKey));
    return event?.type === "world.tick.triggered" ? event : undefined;
  }

  private findWorldEvent(eventId: string | undefined): WorldEventRecord {
    const event = this.options.eventStore
      .list({ limit: Number.MAX_SAFE_INTEGER })
      .find(
        (candidate): candidate is Extract<RealmEvent, { type: "world.event.triggered" }> =>
          candidate.type === "world.event.triggered" && candidate.event.id === eventId,
      );
    if (!event) {
      throw new Error(`Unknown world event: ${eventId ?? "missing"}`);
    }
    return event.event;
  }

  private nextTick(worldId: string): number {
    return (
      Math.max(
        0,
        ...this.options.eventStore
          .list({ limit: Number.MAX_SAFE_INTEGER })
          .filter(
            (event): event is Extract<RealmEvent, { type: "world.tick.triggered" }> =>
              event.type === "world.tick.triggered" && event.tick.worldId === worldId,
          )
          .map((event) => event.tick.tick),
      ) + 1
    );
  }

  private eventKey(kind: TriggerKind, idempotencyKey: string): string {
    return `world-event:${kind}:${idempotencyKey}`;
  }

  private tickKey(idempotencyKey: string): string {
    return `world-tick:${idempotencyKey}`;
  }
}

function conditionMatches(actual: unknown, condition: WorldEventCondition): boolean {
  if (typeof condition.exists === "boolean" && (actual !== undefined) !== condition.exists) {
    return false;
  }
  if (Object.hasOwn(condition, "equals")) {
    return stableJson(actual) === stableJson(condition.equals);
  }
  return actual !== undefined;
}

function statusFromPatchResult(result: StatePatchResult): WorldEventRecord["status"] {
  if (result.status === "duplicate") {
    return "duplicate";
  }
  return result.status;
}

function eventReason(kind: TriggerKind, input: WorldEventTriggerInput): string {
  const targets =
    input.targetRoleIds && input.targetRoleIds.length > 0
      ? ` Targets: ${input.targetRoleIds.join(", ")}.`
      : "";
  return `World event [${kind}]: ${input.title}. ${input.description}.${targets}`;
}

function formatWorldEventMessage(input: WorldEventTriggerInput, result: StatePatchResult): string {
  const status = result.status === "committed" ? `State v${result.version}` : result.status;
  return `[${input.severity ?? "minor"}] ${input.title}\n${input.description}\n${status}`;
}

function belongsToWorld(event: RealmEvent, worldId: string): boolean {
  if (event.type === "message.created") {
    return event.message.worldId === worldId;
  }
  if (event.type === "state.patch.proposed" || event.type === "state.patch.committed") {
    return event.patch.worldId === worldId;
  }
  if (event.type === "world.event.triggered") {
    return event.event.worldId === worldId;
  }
  if (event.type === "world.tick.triggered") {
    return event.tick.worldId === worldId;
  }
  return event.aggregateId === makeId("world", worldId);
}

function hashReplay(events: readonly RealmEvent[]): string {
  return createHash("sha256").update(stableJson(events)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}
