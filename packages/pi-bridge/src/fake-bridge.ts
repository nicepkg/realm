import { randomUUID } from "node:crypto";
import type { TurnRuntime } from "@realm/core";
import { AsyncEventQueue } from "./async-event-queue.ts";
import type {
  PiBridge,
  PiBridgeEvent,
  PiPromptInput,
  PiSessionHandle,
  PiSessionStartInput,
} from "./types.ts";

type FakePiSession = {
  id: string;
  roleId: string;
  sessionDir: string;
  queue: AsyncEventQueue<PiBridgeEvent>;
  turnIndex: number;
};

/**
 * Natural, in-character Chinese stand-in lines for the mock runtime. The fake
 * bridge must never echo the raw English scaffolding prompt back into a
 * Chinese-first product UI (Boss: "明明是中文产品，界面却满屏英文"). These read
 * like a thoughtful participant taking a turn, independent of world theme.
 */
export const FAKE_REPLIES = [
  "我先理一理眼下的局势，再给大家一个判断。",
  "这件事我有几点想法，说出来一起参详。",
  "（环顾四周）人都到齐了，那我先起个头。",
  "稳一手——先听听其他人怎么说，我再补充。",
  "我的看法是：当下最该解决的就是这一件。",
  "别急，我们一步一步来，先把关键问题摆出来。",
  "刚才那段我记下了，顺着往下推演一下。",
  "让我从结果倒推：我们真正想要的到底是什么？",
] as const;

/** Deterministic mock reply chosen from {@link FAKE_REPLIES} by role + turn. */
export function fakeReply(roleId: string, turnIndex: number): string {
  let hash = turnIndex >>> 0;
  for (const character of roleId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return FAKE_REPLIES[hash % FAKE_REPLIES.length] ?? FAKE_REPLIES[0];
}

export class FakePiBridge implements PiBridge {
  private readonly sessions = new Map<string, FakePiSession>();

  adapterMetadata(): TurnRuntime {
    return { adapterKind: "fake" };
  }

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    const id = `fake-pi-${randomUUID()}`;
    const queue = new AsyncEventQueue<PiBridgeEvent>();
    const session: FakePiSession = {
      id,
      roleId: input.roleId,
      sessionDir: input.sessionDir,
      queue,
      turnIndex: 0,
    };
    this.sessions.set(id, session);
    queue.push({ type: "session.started", sessionId: id, sessionDir: input.sessionDir });
    return { id, sessionDir: input.sessionDir, events: queue };
  }

  async sendPrompt(sessionId: string, _input: PiPromptInput): Promise<void> {
    const session = this.requireSession(sessionId);
    const requestId = `req-${randomUUID()}`;
    // Generate an in-character Chinese line rather than echoing the English
    // scaffolding prompt. Deterministic per role + turn so traces stay stable.
    const content = fakeReply(session.roleId, session.turnIndex);
    session.turnIndex += 1;
    session.queue.push({ type: "prompt.accepted", sessionId, requestId });
    session.queue.push({ type: "assistant.delta", sessionId, delta: content });
    session.queue.push({ type: "assistant.message", sessionId, content });
  }

  async abort(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.queue.push({ type: "session.aborted", sessionId });
  }

  async dispose(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.queue.push({ type: "session.disposed", sessionId });
    session.queue.close();
    this.sessions.delete(sessionId);
  }

  private requireSession(sessionId: string): FakePiSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown Pi session: ${sessionId}`);
    }
    return session;
  }
}
