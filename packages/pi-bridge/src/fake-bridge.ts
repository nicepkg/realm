import { randomUUID } from "node:crypto";
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
};

export class FakePiBridge implements PiBridge {
  private readonly sessions = new Map<string, FakePiSession>();

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    const id = `fake-pi-${randomUUID()}`;
    const queue = new AsyncEventQueue<PiBridgeEvent>();
    const session: FakePiSession = {
      id,
      roleId: input.roleId,
      sessionDir: input.sessionDir,
      queue,
    };
    this.sessions.set(id, session);
    queue.push({ type: "session.started", sessionId: id, sessionDir: input.sessionDir });
    return { id, sessionDir: input.sessionDir, events: queue };
  }

  async sendPrompt(sessionId: string, input: PiPromptInput): Promise<void> {
    const session = this.requireSession(sessionId);
    const requestId = `req-${randomUUID()}`;
    const content = `[${session.roleId}] ${input.message}`;
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
