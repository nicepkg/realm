import {
  AsyncEventQueue,
  FakePiBridge,
  type PiBridge,
  type PiBridgeEvent,
  type PiPromptInput,
  type PiSessionHandle,
  type PiSessionStartInput,
} from "@realm/pi-bridge";

export class CapturingPiBridge extends FakePiBridge {
  readonly starts: PiSessionStartInput[] = [];

  override async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    this.starts.push(input);
    return super.startSession(input);
  }
}

export class HangingPiBridge implements PiBridge {
  sessionId?: string;
  private queue?: AsyncEventQueue<PiBridgeEvent>;

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    this.sessionId = `hanging-${crypto.randomUUID()}`;
    this.queue = new AsyncEventQueue<PiBridgeEvent>();
    this.queue.push({
      type: "session.started",
      sessionId: this.sessionId,
      sessionDir: input.sessionDir,
    });
    return { id: this.sessionId, sessionDir: input.sessionDir, events: this.queue };
  }

  async sendPrompt(sessionId: string, _input: PiPromptInput): Promise<void> {
    this.queue?.push({ type: "prompt.accepted", sessionId, requestId: "request-hanging" });
  }

  async abort(sessionId: string): Promise<void> {
    this.queue?.push({ type: "session.aborted", sessionId });
  }

  async dispose(sessionId: string): Promise<void> {
    this.queue?.push({ type: "session.disposed", sessionId });
    this.queue?.close();
  }
}

export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
