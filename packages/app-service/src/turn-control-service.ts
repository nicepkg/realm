import { randomUUID } from "node:crypto";
import { makeId } from "@realm/core";

export type TurnCancelResult = {
  turnId: string;
  cancelled: boolean;
};

export class TurnControlService {
  private readonly activeTurns = new Map<string, AbortController>();

  start(run: (turnId: string, signal: AbortSignal) => Promise<unknown>): { turnId: string } {
    const turnId = makeId("turn", randomUUID());
    const controller = new AbortController();
    this.activeTurns.set(turnId, controller);
    void run(turnId, controller.signal)
      .catch(() => undefined)
      .finally(() => this.activeTurns.delete(turnId));
    return { turnId };
  }

  cancel(turnId: string): TurnCancelResult {
    const controller = this.activeTurns.get(turnId);
    if (!controller) {
      return { turnId, cancelled: false };
    }
    controller.abort();
    return { turnId, cancelled: true };
  }
}
