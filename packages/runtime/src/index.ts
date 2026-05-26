import { randomUUID } from "node:crypto";
import {
  type Message,
  makeId,
  nowIso,
  type StatePatch,
  type ToolCallSummary,
  type TurnSummary,
} from "@realm/core";
import { createInitialState, StateReducer } from "@realm/kernel";
import type { PiBridge, PiBridgeEvent } from "@realm/pi-bridge";
import type { PolicyDecision } from "@realm/policy";
import { CapabilityPolicy, type TrustTier } from "@realm/policy";
import { type EventStore, InMemoryEventStore } from "@realm/storage";
import { fakeClock, nextWithTimeout, TurnCancelledError } from "./runtime-helpers.ts";

export type FakeRuntimeInput = {
  seed: number;
  clockStart: Date;
  trustTier?: TrustTier;
};

export type FakeRuntimeResult = {
  events: ReturnType<EventStore["list"]>;
  stateVersion: number;
  finalState: Record<string, unknown>;
  policyDecision: PolicyDecision;
};

export class FakeVerticalSliceRuntime {
  private readonly eventStore: EventStore;
  private readonly reducer = new StateReducer();
  private readonly policy = new CapabilityPolicy();

  constructor(eventStore: EventStore = new InMemoryEventStore()) {
    this.eventStore = eventStore;
  }

  run(input: FakeRuntimeInput): FakeRuntimeResult {
    const trustTier = input.trustTier ?? "run-roles";
    const dates = fakeClock(input.clockStart);
    const worldId = "cultivation";
    const roomId = "main";
    const correlationId = makeId("corr", input.seed);

    const policyDecision = this.policy.decide({
      principal: { id: "owner", kind: "owner" },
      capability: "message.send",
      trustTier,
      allowedCapabilities: ["message.send", "state.query", "trace.read"],
    });

    if (!policyDecision.allow) {
      throw new Error(policyDecision.reason);
    }

    const ownerMessage: Message = {
      id: "msg:owner:1",
      worldId,
      roomId,
      authorId: "owner",
      displayedAuthorId: "owner",
      content: "@all 今天谁先突破？",
      createdAt: nowIso(dates.next()),
      reversibleUntil: nowIso(dates.peek(30_000)),
    };

    this.eventStore.append({
      eventId: "event:message:owner:1",
      schemaVersion: 1,
      aggregateId: makeId("room", roomId),
      correlationId,
      idempotencyKey: "message-owner-1",
      createdAt: ownerMessage.createdAt,
      type: "message.created",
      message: ownerMessage,
    });

    this.appendRoleReply({
      turnId: "turn:leijun:1",
      messageId: "msg:leijun:1",
      worldId,
      roomId,
      actorId: "leijun",
      content: "我先把炉火稳住，突破要看时机，不能只靠热血。",
      correlationId,
      createdAt: nowIso(dates.next()),
    });

    this.appendRoleReply({
      turnId: "turn:guchenfeng:1",
      messageId: "msg:guchenfeng:1",
      worldId,
      roomId,
      actorId: "guchenfeng",
      content: "我愿意试一试。若失败，也算给后来者留一条路。",
      correlationId,
      createdAt: nowIso(dates.next()),
    });

    const state = createInitialState({
      publicState: {
        roles: {
          leijun: { name: "雷军", realm: "练气七层" },
          guchenfeng: { name: "顾晨峰", realm: "练气五层" },
        },
      },
      privateState: {},
      hiddenState: {},
      derivedState: {},
      metaState: {
        roles: {
          leijun: { alive: true, muted: false },
          guchenfeng: { alive: true, muted: false },
        },
      },
    });

    const patch: StatePatch = {
      id: "patch:guchenfeng:hp:1",
      worldId,
      actorId: "god",
      proposedBy: "owner",
      approvedBy: "owner",
      baseVersion: 0,
      expectedVersion: 0,
      idempotencyKey: "fake-god-patch-1",
      operations: [{ op: "set", path: "/privateState/roles/guchenfeng/hp", value: 92 }],
      reason: "God resolves the first cultivation attempt.",
      createdAt: nowIso(dates.next()),
    };

    this.eventStore.append({
      eventId: "event:state:patch:proposed:1",
      schemaVersion: 1,
      aggregateId: makeId("world", worldId),
      correlationId,
      idempotencyKey: "fake-god-patch-proposed-1",
      createdAt: patch.createdAt,
      type: "state.patch.proposed",
      patch,
    });

    const patchResult = this.reducer.apply(state, patch);
    if (patchResult.status !== "committed") {
      throw new Error(`Fake patch failed: ${JSON.stringify(patchResult)}`);
    }

    this.eventStore.append({
      eventId: "event:state:patch:committed:1",
      schemaVersion: 1,
      aggregateId: makeId("world", worldId),
      correlationId,
      idempotencyKey: "fake-god-patch-committed-1",
      createdAt: nowIso(dates.next()),
      type: "state.patch.committed",
      patch,
      version: patchResult.version,
    });

    this.eventStore.append({
      eventId: "event:audit:1",
      schemaVersion: 1,
      aggregateId: makeId("world", worldId),
      correlationId,
      createdAt: nowIso(dates.next()),
      type: "audit.created",
      audit: {
        id: "audit:1",
        actorId: "god",
        action: "state.patch.committed",
        target: patch.id,
        reason: patch.reason,
        createdAt: nowIso(dates.current()),
      },
    });

    return {
      events: this.eventStore.list(),
      stateVersion: state.version,
      finalState: state.state,
      policyDecision,
    };
  }

  private appendRoleReply(input: {
    turnId: string;
    messageId: string;
    worldId: string;
    roomId: string;
    actorId: string;
    content: string;
    correlationId: string;
    createdAt: string;
  }): void {
    const turn: TurnSummary = {
      id: input.turnId,
      worldId: input.worldId,
      roomId: input.roomId,
      actorId: input.actorId,
      status: "completed",
      model: "fake",
    };

    this.eventStore.append({
      eventId: makeId("event:turn:started", input.turnId),
      schemaVersion: 1,
      aggregateId: makeId("turn", input.turnId),
      correlationId: input.correlationId,
      createdAt: input.createdAt,
      type: "turn.started",
      turn: { ...turn, status: "running" },
    });

    this.eventStore.append({
      eventId: makeId("event:message", input.messageId),
      schemaVersion: 1,
      aggregateId: makeId("room", input.roomId),
      correlationId: input.correlationId,
      causationId: input.turnId,
      createdAt: input.createdAt,
      type: "message.created",
      message: {
        id: input.messageId,
        worldId: input.worldId,
        roomId: input.roomId,
        authorId: input.actorId,
        displayedAuthorId: input.actorId,
        content: input.content,
        createdAt: input.createdAt,
      },
    });

    this.eventStore.append({
      eventId: makeId("event:turn:completed", input.turnId),
      schemaVersion: 1,
      aggregateId: makeId("turn", input.turnId),
      correlationId: input.correlationId,
      createdAt: input.createdAt,
      type: "turn.completed",
      turn,
    });
  }
}

export type PiRoleTurnInput = {
  turnId?: string;
  worldId: string;
  roomId: string;
  roleId: string;
  prompt: string;
  cwd: string;
  sessionDir: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  allowedSkillPaths?: string[];
  extensionPaths?: string[];
  env?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type PiRoleTurnResult = {
  turn: TurnSummary;
  message: Message;
};

export class PiRoleTurnRunner {
  private readonly activeToolNames = new Map<string, string>();

  constructor(
    private readonly bridge: PiBridge,
    private readonly eventStore: EventStore = new InMemoryEventStore(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(input: PiRoleTurnInput): Promise<PiRoleTurnResult> {
    const turnId = input.turnId ?? makeId("turn", randomUUID());
    const correlationId = makeId("corr", randomUUID());
    const turn: TurnSummary = {
      id: turnId,
      worldId: input.worldId,
      roomId: input.roomId,
      actorId: input.roleId,
      status: "running",
      model: input.model,
    };
    this.eventStore.append({
      eventId: makeId("event:turn:started", randomUUID()),
      schemaVersion: 1,
      aggregateId: makeId("turn", turnId),
      correlationId,
      createdAt: nowIso(this.clock()),
      type: "turn.started",
      turn,
    });

    const session = await this.bridge.startSession({
      worldId: input.worldId,
      roomId: input.roomId,
      roleId: input.roleId,
      cwd: input.cwd,
      sessionDir: input.sessionDir,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.systemPrompt,
      allowedSkillPaths: input.allowedSkillPaths ?? [],
      extensionPaths: input.extensionPaths ?? [],
      env: input.env,
    });
    const abortSession = () => {
      void this.bridge.abort(session.id).catch(() => undefined);
    };
    input.signal?.addEventListener("abort", abortSession, { once: true });

    try {
      if (input.signal?.aborted) {
        await this.bridge.abort(session.id);
      }
      await this.bridge.sendPrompt(session.id, { message: input.prompt });
      const assistantMessage = await this.waitForAssistantMessage(
        session.events[Symbol.asyncIterator](),
        input.timeoutMs ?? 60_000,
        correlationId,
        turnId,
        input.roleId,
        input.signal,
      );
      const message: Message = {
        id: makeId("msg", randomUUID()),
        worldId: input.worldId,
        roomId: input.roomId,
        authorId: input.roleId,
        displayedAuthorId: input.roleId,
        content: assistantMessage.content,
        createdAt: nowIso(this.clock()),
      };
      this.eventStore.append({
        eventId: makeId("event:message", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("room", input.roomId),
        correlationId,
        causationId: turnId,
        createdAt: message.createdAt,
        type: "message.created",
        message,
      });
      const completedTurn: TurnSummary = {
        ...turn,
        status: "completed",
        model: assistantMessage.model ?? turn.model,
        usage: assistantMessage.usage,
      };
      this.eventStore.append({
        eventId: makeId("event:turn:completed", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("turn", turnId),
        correlationId,
        createdAt: nowIso(this.clock()),
        type: "turn.completed",
        turn: completedTurn,
      });
      return { turn: completedTurn, message };
    } catch (error) {
      const failedTurn: TurnSummary = {
        ...turn,
        status: error instanceof TurnCancelledError ? "cancelled" : "failed",
      };
      this.eventStore.append({
        eventId: makeId("event:turn:failed", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("turn", turnId),
        correlationId,
        createdAt: nowIso(this.clock()),
        type: "turn.completed",
        turn: failedTurn,
      });
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abortSession);
      await this.bridge.dispose(session.id).catch(() => undefined);
    }
  }

  private async waitForAssistantMessage(
    events: AsyncIterator<PiBridgeEvent>,
    timeoutMs: number,
    correlationId: string,
    turnId: string,
    roleId: string,
    signal?: AbortSignal,
  ): Promise<{ content: string; usage?: TurnSummary["usage"]; model?: string }> {
    const deadline = Date.now() + timeoutMs;
    let usage: TurnSummary["usage"];
    let model: string | undefined;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new TurnCancelledError(turnId);
      }
      const event = await nextWithTimeout(events, Math.max(1, deadline - Date.now()));
      if (!event) {
        break;
      }
      this.captureBridgeEvent(event, correlationId, turnId, roleId);
      if (event.type === "session.aborted") {
        throw new TurnCancelledError(turnId);
      }
      if (event.type === "usage.reported") {
        usage = event.usage;
        model = event.model ?? model;
      }
      if (event.type === "assistant.message") {
        return { content: event.content, usage, model };
      }
      if (event.type === "session.error") {
        throw new Error(event.message);
      }
    }
    throw new Error(`Timed out waiting for Pi assistant message after ${timeoutMs}ms`);
  }

  private captureBridgeEvent(
    event: PiBridgeEvent,
    correlationId: string,
    turnId: string,
    roleId: string,
  ): void {
    if (event.type === "assistant.delta") {
      this.eventStore.append({
        eventId: makeId("event:turn:delta", randomUUID()),
        schemaVersion: 1,
        aggregateId: makeId("turn", turnId),
        correlationId,
        causationId: turnId,
        createdAt: nowIso(this.clock()),
        type: "turn.delta",
        delta: {
          turnId,
          roleId,
          delta: event.delta,
        },
      });
    }
    if (event.type === "tool.started") {
      this.activeToolNames.set(event.toolCallId, event.toolName);
      this.appendToolCall(correlationId, {
        id: event.toolCallId,
        name: event.toolName,
        status: "allowed",
      });
    }
    if (event.type === "tool.finished") {
      this.appendToolCall(correlationId, {
        id: event.toolCallId,
        name: this.activeToolNames.get(event.toolCallId) ?? "unknown",
        status: "completed",
      });
      this.activeToolNames.delete(event.toolCallId);
    }
  }

  private appendToolCall(correlationId: string, toolCall: ToolCallSummary): void {
    this.eventStore.append({
      eventId: makeId("event:tool", randomUUID()),
      schemaVersion: 1,
      aggregateId: makeId("trace", correlationId),
      correlationId,
      createdAt: nowIso(this.clock()),
      type: "tool.called",
      traceId: makeId("trace", correlationId),
      toolCall,
    });
  }
}

export { TurnCancelledError };
