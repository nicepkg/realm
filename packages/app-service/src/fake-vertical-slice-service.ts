import type { Message } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import type { AdminStatePatchInput } from "./world-state-service.ts";

type FakeVerticalSliceServiceOptions = {
  eventStore: EventStore;
  clock: () => Date;
  commitGodPatch: (input: AdminStatePatchInput) => Promise<unknown>;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class FakeVerticalSliceService {
  constructor(private readonly options: FakeVerticalSliceServiceOptions) {}

  shouldTrigger(message: Message): boolean {
    return (
      message.worldId === "cultivation" &&
      message.roomId === "main" &&
      message.content.includes("@all")
    );
  }

  run(message: Message): void {
    void this.runFollowup().catch((error) => {
      this.options.appendAudit({
        actorId: "system",
        action: "fake.vertical-slice.failed",
        target: message.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async runFollowup(): Promise<void> {
    if (this.options.eventStore.findByIdempotencyKey("fake-vertical-slice:leijun:completed")) {
      return;
    }
    const worldId = "cultivation";
    const roomId = "main";
    const correlationId = makeId("corr", "fake-vertical-slice");
    this.appendRoleReply({
      turnId: "turn:fake:leijun",
      messageId: "msg:fake:leijun",
      worldId,
      roomId,
      actorId: "leijun",
      content: "我先把炉火稳住，突破要看时机，不能只靠热血。",
      correlationId,
      idempotencyPrefix: "fake-vertical-slice:leijun",
    });
    this.appendRoleReply({
      turnId: "turn:fake:guchenfeng",
      messageId: "msg:fake:guchenfeng",
      worldId,
      roomId,
      actorId: "guchenfeng",
      content: "我愿意试一试。若失败，也算给后来者留一条路。",
      correlationId,
      idempotencyPrefix: "fake-vertical-slice:guchenfeng",
    });
    await this.options.commitGodPatch({
      worldId,
      actorId: "god",
      operations: [{ op: "set", path: "/privateState/roles/guchenfeng/hp", value: 92 }],
      reason: "God resolves the first cultivation attempt.",
      idempotencyKey: "fake-god-patch-1",
    });
  }

  private appendRoleReply(input: {
    turnId: string;
    messageId: string;
    worldId: string;
    roomId: string;
    actorId: string;
    content: string;
    correlationId: string;
    idempotencyPrefix: string;
  }): void {
    const startedAt = nowIso(this.options.clock());
    this.options.eventStore.append({
      eventId: makeId("event:turn:started", input.turnId),
      schemaVersion: 1,
      aggregateId: makeId("turn", input.turnId),
      correlationId: input.correlationId,
      idempotencyKey: `${input.idempotencyPrefix}:started`,
      createdAt: startedAt,
      type: "turn.started",
      turn: {
        id: input.turnId,
        worldId: input.worldId,
        roomId: input.roomId,
        actorId: input.actorId,
        status: "running",
        model: "fake",
      },
    });
    this.appendMessage(input);
    this.appendCompletedTurn(input);
  }

  private appendMessage(input: {
    turnId: string;
    messageId: string;
    worldId: string;
    roomId: string;
    actorId: string;
    content: string;
    correlationId: string;
    idempotencyPrefix: string;
  }): void {
    const createdAt = nowIso(this.options.clock());
    this.options.eventStore.append({
      eventId: makeId("event:message", input.messageId),
      schemaVersion: 1,
      aggregateId: makeId("room", input.roomId),
      correlationId: input.correlationId,
      causationId: input.turnId,
      idempotencyKey: `${input.idempotencyPrefix}:message`,
      createdAt,
      type: "message.created",
      message: {
        id: input.messageId,
        worldId: input.worldId,
        roomId: input.roomId,
        authorId: input.actorId,
        displayedAuthorId: input.actorId,
        content: input.content,
        createdAt,
      },
    });
  }

  private appendCompletedTurn(input: {
    turnId: string;
    worldId: string;
    roomId: string;
    actorId: string;
    correlationId: string;
    idempotencyPrefix: string;
  }): void {
    this.options.eventStore.append({
      eventId: makeId("event:turn:completed", input.turnId),
      schemaVersion: 1,
      aggregateId: makeId("turn", input.turnId),
      correlationId: input.correlationId,
      idempotencyKey: `${input.idempotencyPrefix}:completed`,
      createdAt: nowIso(this.options.clock()),
      type: "turn.completed",
      turn: {
        id: input.turnId,
        worldId: input.worldId,
        roomId: input.roomId,
        actorId: input.actorId,
        status: "completed",
        model: "fake",
      },
    });
  }
}
