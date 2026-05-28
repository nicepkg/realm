import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { TurnRuntime } from "@realm/core";
import { AsyncEventQueue } from "./async-event-queue.ts";
import { mapPiRpcRecordToBridgeEvents } from "./event-mapper.ts";
import { JsonlDecoder, type PiRpcRecord, parsePiRpcJsonLine, serializeJsonLine } from "./jsonl.ts";
import type {
  PiBridge,
  PiBridgeEvent,
  PiProcessSpawner,
  PiPromptInput,
  PiSessionHandle,
  PiSessionStartInput,
  PiSubprocessBridgeOptions,
} from "./types.ts";

type SubprocessPiSession = {
  id: string;
  input: PiSessionStartInput;
  process: ChildProcessWithoutNullStreams;
  heartbeat: ReturnType<typeof setInterval> | undefined;
  queue: AsyncEventQueue<PiBridgeEvent>;
  decoder: JsonlDecoder;
  restarts: number;
  pending: Map<
    string,
    {
      resolve: (record: PiRpcRecord) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >;
  stderr: string;
};

type PiRpcCommand =
  | { type: "prompt"; message: string; streamingBehavior?: "steer" | "followUp" }
  | { type: "abort" };

export class SubprocessPiBridge implements PiBridge {
  private readonly sessions = new Map<string, SubprocessPiSession>();
  private readonly binary: string;
  private readonly commandTimeoutMs: number;
  private readonly spawnProcess: PiProcessSpawner;

  constructor(private readonly options: PiSubprocessBridgeOptions = {}) {
    this.binary = options.binary ?? process.env.REALM_PI_BIN ?? "pi";
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    this.spawnProcess = options.spawnProcess ?? defaultSpawner;
  }

  adapterMetadata(): TurnRuntime {
    return {
      adapterKind: "subprocess",
      binary: this.binary,
      fallback: {
        adapterKind: "subprocess",
        reason: "Subprocess bridge is the active adapter.",
        status: "available",
      },
    };
  }

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    const id = `pi-${randomUUID()}`;
    const queue = new AsyncEventQueue<PiBridgeEvent>();
    const session: SubprocessPiSession = {
      id,
      input,
      process: this.spawnSessionProcess(input),
      heartbeat: undefined,
      queue,
      decoder: new JsonlDecoder(),
      restarts: 0,
      pending: new Map(),
      stderr: "",
    };
    this.sessions.set(id, session);
    this.attachProcess(session);
    session.heartbeat = this.startHeartbeat(session);
    queue.push({ type: "session.started", sessionId: id, sessionDir: input.sessionDir });
    return { id, sessionDir: input.sessionDir, events: queue };
  }

  async sendPrompt(sessionId: string, input: PiPromptInput): Promise<void> {
    const command: PiRpcCommand = {
      type: "prompt",
      message: input.message,
      streamingBehavior: input.streamingBehavior,
    };
    await this.send(sessionId, command);
  }

  async abort(sessionId: string): Promise<void> {
    await this.send(sessionId, { type: "abort" });
    this.requireSession(sessionId).queue.push({ type: "session.aborted", sessionId });
  }

  async dispose(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    this.stopHeartbeat(session);
    session.process.kill("SIGTERM");
    session.queue.push({ type: "session.disposed", sessionId });
    session.queue.close();
    this.rejectPending(session, new Error("Pi session disposed"));
    this.sessions.delete(sessionId);
  }

  private attachProcess(session: SubprocessPiSession): void {
    session.process.stdout.on("data", (chunk: Buffer | string) => {
      const lines = session.decoder.push(
        typeof chunk === "string" ? chunk : chunk.toString("utf8"),
      );
      for (const line of lines) {
        this.handleLine(session, line);
      }
    });
    session.process.stdout.on("end", () => {
      for (const line of session.decoder.flush()) {
        this.handleLine(session, line);
      }
    });
    session.process.stderr.on("data", (chunk: Buffer | string) => {
      session.stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    session.process.once("error", (error) => {
      this.failSession(session, `Pi process error: ${error.message}`);
    });
    session.process.once("exit", (code, signal) => {
      if (!this.sessions.has(session.id)) {
        return;
      }
      const reason = `Pi process exited with code=${code} signal=${signal}`;
      if (this.shouldRestart(session)) {
        this.restartSession(session, reason);
        return;
      }
      this.failSession(session, reason);
    });
  }

  private spawnSessionProcess(input: PiSessionStartInput): ChildProcessWithoutNullStreams {
    const args = buildPiRpcArgs(input, this.options.extraArgs ?? []);
    return this.spawnProcess(this.binary, args, {
      cwd: input.cwd,
      env: buildSubprocessEnv(input.env, this.options.env),
    });
  }

  private startHeartbeat(session: SubprocessPiSession): ReturnType<typeof setInterval> | undefined {
    const intervalMs = this.options.heartbeatIntervalMs;
    if (!intervalMs || intervalMs <= 0) {
      return undefined;
    }
    return setInterval(() => {
      if (!this.sessions.has(session.id)) {
        return;
      }
      session.queue.push({
        type: "session.heartbeat",
        sessionId: session.id,
        status: session.process.exitCode === null ? "alive" : "exited",
        pid: session.process.pid,
      });
    }, intervalMs);
  }

  private stopHeartbeat(session: SubprocessPiSession): void {
    if (session.heartbeat) {
      clearInterval(session.heartbeat);
      session.heartbeat = undefined;
    }
  }

  private shouldRestart(session: SubprocessPiSession): boolean {
    return Boolean(
      this.options.restartOnFailure && session.restarts < (this.options.maxRestarts ?? 1),
    );
  }

  private restartSession(session: SubprocessPiSession, reason: string): void {
    this.rejectPending(session, new Error(reason));
    session.restarts += 1;
    session.decoder = new JsonlDecoder();
    session.stderr = "";
    session.process = this.spawnSessionProcess(session.input);
    this.attachProcess(session);
    session.queue.push({
      type: "session.restarted",
      sessionId: session.id,
      attempt: session.restarts,
      reason,
    });
  }

  private handleLine(session: SubprocessPiSession, line: string): void {
    let record: PiRpcRecord;
    try {
      record = parsePiRpcJsonLine(line);
    } catch {
      return;
    }

    if (isPiRpcResponse(record) && typeof record.id === "string") {
      const pending = session.pending.get(record.id);
      if (pending) {
        clearTimeout(pending.timeout);
        session.pending.delete(record.id);
        if (record.success === false) {
          pending.reject(
            new Error(typeof record.error === "string" ? record.error : "Pi RPC command failed"),
          );
        } else {
          if (record.command === "prompt") {
            session.queue.push({
              type: "prompt.accepted",
              sessionId: session.id,
              requestId: record.id,
            });
          }
          pending.resolve(record);
        }
        return;
      }
    }

    for (const event of mapPiRpcRecordToBridgeEvents(session.id, record)) {
      session.queue.push(event);
    }
  }

  private async send(sessionId: string, command: PiRpcCommand): Promise<PiRpcRecord> {
    const session = this.requireSession(sessionId);
    if (session.process.exitCode !== null) {
      throw new Error(`Pi process already exited. Stderr: ${session.stderr}`);
    }
    const id = `req-${randomUUID()}`;
    const fullCommand = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error(`Timeout waiting for Pi RPC ${command.type}. Stderr: ${session.stderr}`));
      }, this.commandTimeoutMs);

      session.pending.set(id, { resolve, reject, timeout });
      session.process.stdin.write(serializeJsonLine(fullCommand), (error) => {
        if (!error) {
          return;
        }
        clearTimeout(timeout);
        session.pending.delete(id);
        reject(error);
      });
    });
  }

  private failSession(session: SubprocessPiSession, message: string): void {
    this.stopHeartbeat(session);
    const details = session.stderr ? `${message}. Stderr: ${session.stderr}` : message;
    session.queue.push({ type: "session.error", sessionId: session.id, message: details });
    session.queue.close();
    this.rejectPending(session, new Error(details));
    this.sessions.delete(session.id);
  }

  private rejectPending(session: SubprocessPiSession, error: Error): void {
    for (const pending of session.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    session.pending.clear();
  }

  private requireSession(sessionId: string): SubprocessPiSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown Pi session: ${sessionId}`);
    }
    return session;
  }
}

export function buildPiRpcArgs(input: PiSessionStartInput, extraArgs: string[] = []): string[] {
  const args = [
    "--mode",
    "rpc",
    "--session-dir",
    input.sessionDir,
    "--system-prompt",
    input.systemPrompt,
    "--no-context-files",
    "--no-builtin-tools",
    "--no-extensions",
  ];

  if (input.provider) {
    args.push("--provider", input.provider);
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  for (const extensionPath of input.extensionPaths) {
    args.push("--extension", extensionPath);
  }
  for (const skillPath of input.allowedSkillPaths) {
    args.push("--skill", skillPath);
  }
  args.push(...extraArgs);
  return args;
}

function defaultSpawner(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function buildSubprocessEnv(
  inputEnv: Record<string, string> | undefined,
  optionEnv: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  if (!inputEnv) {
    return { ...process.env, ...optionEnv };
  }
  return { ...safeRuntimeEnv(process.env), ...optionEnv, ...inputEnv };
}

function safeRuntimeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keys = [
    "PATH",
    "Path",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
  ];
  const safeEnv: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    if (env[key]) {
      safeEnv[key] = env[key];
    }
  }
  return safeEnv;
}

function isPiRpcResponse(record: PiRpcRecord): boolean {
  return record.type === "response" && typeof record.command === "string";
}
