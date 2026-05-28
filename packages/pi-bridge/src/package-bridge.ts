import { randomUUID } from "node:crypto";
import { Agent } from "@earendil-works/pi-agent-core";
import { type Api, getModel, getModels, type Model } from "@earendil-works/pi-ai";
import { AsyncEventQueue } from "./async-event-queue.ts";
import { mapAgentEventToBridgeEvents } from "./event-mapper.ts";
import { buildRealmAgentTools } from "./realm-agent-tools.ts";
import type {
  PiBridge,
  PiBridgeEvent,
  PiPackageBridgeOptions,
  PiPromptInput,
  PiSessionHandle,
  PiSessionStartInput,
} from "./types.ts";

type PackagePiSession = {
  id: string;
  input: PiSessionStartInput;
  agent: Agent;
  queue: AsyncEventQueue<PiBridgeEvent>;
  activePrompt: Promise<void> | undefined;
  unsubscribe?: () => void;
};

export class PackagePiBridge implements PiBridge {
  private readonly sessions = new Map<string, PackagePiSession>();

  constructor(private readonly options: PiPackageBridgeOptions = {}) {}

  async startSession(input: PiSessionStartInput): Promise<PiSessionHandle> {
    const id = `pi-sdk-${randomUUID()}`;
    const queue = new AsyncEventQueue<PiBridgeEvent>();
    const agent = new Agent({
      initialState: {
        systemPrompt: input.systemPrompt,
        model: await this.resolveModel(input),
        thinkingLevel: "off",
        tools: buildRealmAgentTools(input),
      },
      streamFn: this.options.streamFn,
      getApiKey: this.options.getApiKey ?? defaultApiKeyResolver(input.env),
      sessionId: id,
      transport: "auto",
      toolExecution: "parallel",
    });

    const session: PackagePiSession = {
      id,
      input,
      agent,
      queue,
      activePrompt: undefined,
    };
    session.unsubscribe = agent.subscribe((event) => {
      for (const mapped of mapAgentEventToBridgeEvents(id, event)) {
        queue.push(mapped);
      }
      if (event.type === "agent_end") {
        session.activePrompt = undefined;
      }
    });

    this.sessions.set(id, session);
    queue.push({ type: "session.started", sessionId: id, sessionDir: input.sessionDir });
    return { id, sessionDir: input.sessionDir, events: queue };
  }

  async sendPrompt(sessionId: string, input: PiPromptInput): Promise<void> {
    const session = this.requireSession(sessionId);
    if (session.activePrompt) {
      throw new Error(`Pi package session already has an active prompt: ${sessionId}`);
    }
    const requestId = `req-${randomUUID()}`;
    session.queue.push({ type: "prompt.accepted", sessionId, requestId });
    session.activePrompt = session.agent.prompt(input.message).catch((error) => {
      session.queue.push({
        type: "session.error",
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async abort(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.agent.abort();
    await session.activePrompt?.catch(() => undefined);
    session.activePrompt = undefined;
    session.queue.push({ type: "session.aborted", sessionId });
  }

  async dispose(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.agent.abort();
    session.unsubscribe?.();
    await session.activePrompt?.catch(() => undefined);
    session.queue.push({ type: "session.disposed", sessionId });
    session.queue.close();
    this.sessions.delete(sessionId);
  }

  private async resolveModel(input: PiSessionStartInput): Promise<Model<Api>> {
    if (this.options.resolveModel) {
      return this.options.resolveModel(input);
    }

    const provider =
      input.provider ?? this.options.defaultProvider ?? process.env.REALM_PI_PROVIDER ?? "openai";
    const modelId =
      input.model ??
      this.options.defaultModel ??
      process.env.REALM_PI_MODEL ??
      firstModelIdForProvider(provider);
    if (!modelId) {
      throw new Error(
        `No Pi model configured for provider ${provider}. Set REALM_PI_MODEL or configure a model provider in Realm settings.`,
      );
    }
    const model = getModel(provider as never, modelId as never) as Model<Api> | undefined;
    if (!model) {
      throw new Error(`Unknown Pi model: ${provider}/${modelId}`);
    }
    return model;
  }

  private requireSession(sessionId: string): PackagePiSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown Pi package session: ${sessionId}`);
    }
    return session;
  }
}

function firstModelIdForProvider(provider: string): string | undefined {
  const firstModel = getModels(provider as never)[0] as Model<Api> | undefined;
  return firstModel?.id;
}

export function defaultApiKeyResolver(
  env: Record<string, string> | undefined,
): (provider: string) => string | undefined {
  const sourceEnv = env ?? process.env;
  return (provider: string) => {
    const normalized = provider.toLowerCase();
    if (normalized === "openai" || normalized === "openai-codex") {
      return sourceEnv.OPENAI_API_KEY;
    }
    if (normalized === "google" || normalized === "google-vertex") {
      return sourceEnv.GOOGLE_API_KEY ?? sourceEnv.GEMINI_API_KEY;
    }
    if (normalized === "anthropic") {
      return sourceEnv.ANTHROPIC_API_KEY;
    }
    if (normalized === "openrouter") {
      return sourceEnv.OPENROUTER_API_KEY;
    }
    const envName = `${normalized.replace(/[^a-z0-9]/g, "_").toUpperCase()}_API_KEY`;
    return sourceEnv[envName];
  };
}
