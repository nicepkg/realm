import { randomUUID } from "node:crypto";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";

export type TurnFailureTarget = {
  turnId: string;
  worldId: string;
  roomId: string;
  roleId: string;
};

type TurnFailureEmitterOptions = {
  eventStore: EventStore;
  clock: () => Date;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

/**
 * Emits a terminal `turn.failed` event for a background turn that rejected
 * before reaching PiRoleTurnRunner's own try/catch (unknown model, policy
 * denial, missing role, etc.). Without this, TurnControlService would swallow
 * the rejection and the UI would spin forever. Idempotent: if a terminal turn
 * event already exists for this id (the runner emitted its own failure), this
 * is a no-op so the UI never sees a duplicate. Mirrors the runner's
 * turn.failed event shape; the reason rides on an audit event the client reads
 * back to explain the failure.
 */
export class TurnFailureEmitter {
  constructor(private readonly options: TurnFailureEmitterOptions) {}

  emit(target: TurnFailureTarget, reason: string): void {
    if (this.hasTerminalEvent(target.turnId)) {
      return;
    }
    const aggregateId = makeId("turn", target.turnId);
    this.options.eventStore.append({
      eventId: makeId("event:turn:failed", randomUUID()),
      schemaVersion: 1,
      aggregateId,
      correlationId: aggregateId,
      createdAt: nowIso(this.options.clock()),
      type: "turn.failed",
      turn: {
        id: target.turnId,
        worldId: target.worldId,
        roomId: target.roomId,
        actorId: target.roleId,
        status: "failed",
      },
    });
    this.options.appendAudit({
      actorId: "system",
      action: "turn.failed",
      target: target.turnId,
      reason,
    });
  }

  private hasTerminalEvent(turnId: string): boolean {
    return this.options.eventStore
      .list({ limit: 500 })
      .some(
        (event) =>
          (event.type === "turn.failed" ||
            event.type === "turn.cancelled" ||
            event.type === "turn.completed") &&
          event.turn.id === turnId,
      );
  }
}
