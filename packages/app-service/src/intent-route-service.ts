import {
  type ConfigPlannerModel,
  classifyIntent,
  DeterministicIntentRouter,
  type IntentRouter,
  type IntentRouterContext,
  ModelBackedIntentRouter,
  type RealmIntent,
} from "@realm/assistant";
import type { PiBridge } from "@realm/pi-bridge";
import { resolveRoleModelSettings } from "./model-resolution-service.ts";
import type { SettingsSnapshot } from "./settings-service.ts";

/**
 * Routes one operator instruction to a {@link RealmIntent}. The model-backed
 * router is the PRIMARY path whenever a real provider/model is configured; the
 * deterministic classifier is a hard fallback that ALWAYS produces a coherent,
 * write-safe result. The whole surface is failure-proof: any model/provider error
 * is caught and degraded to the deterministic classification, so a caller (the
 * server endpoint) can always return 200 with a usable intent.
 *
 * Provider/model resolution is the SAME one the role-turn bridge uses
 * ({@link resolveRoleModelSettings} + the shared {@link PiBridge}) — we do NOT
 * introduce a second provider config path. In fake-runtime mode (no real
 * provider), or when provider resolution fails, the deterministic router is used.
 */
export type IntentRouteInput = {
  goal: string;
  context: IntentRouterContext;
};

export type IntentRouteServiceOptions = {
  /** True in fake-runtime mode — always use the deterministic router (no provider). */
  fakeRuntime: boolean;
  /** Shared turn bridge, reused to drive a one-shot completion in real mode. */
  piBridge: PiBridge;
  /** Project root, used as the throwaway model session's cwd. */
  root: string;
  env: NodeJS.ProcessEnv | undefined;
  getSettings: () => Promise<SettingsSnapshot>;
  /**
   * Test/host override: inject a {@link ConfigPlannerModel} directly. When set,
   * the model-backed router is used regardless of runtime mode (still failure-safe).
   */
  modelOverride?: ConfigPlannerModel;
};

export class IntentRouteService {
  private readonly deterministic = new DeterministicIntentRouter();

  constructor(private readonly options: IntentRouteServiceOptions) {}

  /**
   * Route `goal` against `context`. Tries the model-backed router first when a
   * provider is available, and ALWAYS falls back to the deterministic classifier
   * on any failure so the result is guaranteed coherent and write-safe.
   */
  async routeIntent(input: IntentRouteInput): Promise<RealmIntent> {
    const router = await this.resolveRouter(input.context);
    try {
      return await router.classify(input.goal, input.context);
    } catch {
      // ModelBackedIntentRouter already falls back internally, but guard here too
      // so a deterministic-router throw (never expected) can never escape as a 500.
      return classifyIntent(input.goal, input.context);
    }
  }

  /**
   * Pick the router for this request. A real provider/model (resolved exactly as a
   * role turn would) yields the model-backed router; anything else (fake runtime,
   * missing keys, disabled provider, resolution error) yields the deterministic
   * router. Resolution is per-request because settings can change at runtime.
   */
  private async resolveRouter(context: IntentRouterContext): Promise<IntentRouter> {
    const model = await this.resolveModel(context);
    return model ? new ModelBackedIntentRouter(model) : this.deterministic;
  }

  /** Resolve a {@link ConfigPlannerModel}, or undefined when none is available. */
  private async resolveModel(
    context: IntentRouterContext,
  ): Promise<ConfigPlannerModel | undefined> {
    if (this.options.modelOverride) {
      return this.options.modelOverride;
    }
    if (this.options.fakeRuntime) {
      return undefined;
    }
    try {
      const settings = await this.options.getSettings();
      // Reuse the role-turn provider resolution: a configured + enabled provider
      // with a present API key yields a non-empty env; an unconfigured one throws
      // or yields no key, in which case we fall back to deterministic below.
      const resolved = resolveRoleModelSettings({
        settings,
        roleModel: undefined,
        env: this.options.env,
      });
      if (Object.keys(resolved.env).length === 0) {
        return undefined;
      }
      return new PiBridgeConfigModel({
        piBridge: this.options.piBridge,
        provider: resolved.provider,
        model: resolved.model,
        env: resolved.env,
        root: this.options.root,
        sampleWorldId: context.worldId,
      });
    } catch {
      return undefined;
    }
  }
}

/**
 * A {@link ConfigPlannerModel} that drives one throwaway turn through the shared
 * {@link PiBridge} to obtain a single completion. This reuses the EXACT same
 * provider plumbing as a role turn (no second provider path): start a session with
 * the resolved provider/model + env, send the prompt, await the first assistant
 * message, then dispose. Any failure rejects, which the router treats as a
 * deterministic fallback signal.
 */
type PiBridgeConfigModelOptions = {
  piBridge: PiBridge;
  provider: string;
  model: string;
  env: Record<string, string>;
  root: string;
  sampleWorldId: string | undefined;
};

class PiBridgeConfigModel implements ConfigPlannerModel {
  constructor(private readonly options: PiBridgeConfigModelOptions) {}

  async complete(input: { system: string; prompt: string }): Promise<string> {
    const handle = await this.options.piBridge.startSession({
      worldId: this.options.sampleWorldId ?? "intent-router",
      roomId: "intent-router",
      roleId: "intent-router",
      cwd: this.options.root,
      sessionDir: `${this.options.root}/.realm-state/intent-router`,
      provider: this.options.provider,
      model: this.options.model,
      systemPrompt: input.system,
      allowedSkillPaths: [],
      extensionPaths: [],
      env: this.options.env,
    });
    try {
      await this.options.piBridge.sendPrompt(handle.id, { message: input.prompt });
      return await firstAssistantMessage(handle.events);
    } finally {
      await this.options.piBridge.dispose(handle.id).catch(() => undefined);
    }
  }
}

/** Resolve the first `assistant.message` from a session's event stream. */
async function firstAssistantMessage(
  events: AsyncIterable<{ type: string; content?: string; message?: string }>,
): Promise<string> {
  for await (const event of events) {
    if (event.type === "assistant.message" && typeof event.content === "string") {
      return event.content;
    }
    if (event.type === "session.error") {
      throw new Error(event.message ?? "intent router session error");
    }
  }
  throw new Error("intent router session ended without a reply");
}
