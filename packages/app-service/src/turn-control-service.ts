import { randomUUID } from "node:crypto";
import { makeId } from "@realm/core";

export type TurnCancelResult = {
  turnId: string;
  cancelled: boolean;
};

/**
 * Invoked when a background turn run rejects before it could emit its own
 * terminal event (e.g. a failure that happens outside PiRoleTurnRunner's
 * try/catch, such as unknown-model resolution or a policy denial). The caller
 * owns the event shape; this service only signals that the turn ended in
 * failure so the UI can leave its running state and surface a recoverable
 * error instead of spinning forever.
 */
export type EmitTurnFailure = (turnId: string, reason: string) => void;

export class TurnControlService {
  private readonly activeTurns = new Map<string, AbortController>();

  start(
    run: (turnId: string, signal: AbortSignal) => Promise<unknown>,
    emitFailure?: EmitTurnFailure,
  ): { turnId: string } {
    const turnId = makeId("turn", randomUUID());
    const controller = new AbortController();
    this.activeTurns.set(turnId, controller);
    void run(turnId, controller.signal)
      .catch((error: unknown) => {
        emitFailure?.(turnId, error instanceof Error ? error.message : String(error));
      })
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
