import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelUsage, TurnRuntime } from "@realm/core";

export type PiSessionStartInput = {
  worldId: string;
  roomId: string;
  roleId: string;
  cwd: string;
  sessionDir: string;
  provider?: string;
  model?: string;
  systemPrompt: string;
  allowedSkills?: PiAllowedSkill[];
  allowedSkillPaths: string[];
  extensionPaths: string[];
  env?: Record<string, string>;
};

export type PiAllowedSkill = {
  id: string;
  name: string;
  scope: string;
  path: string;
  contentHash?: string;
};

export type PiPromptInput = {
  message: string;
  streamingBehavior?: "steer" | "followUp";
};

export type PiBridgeEvent =
  | { type: "session.started"; sessionId: string; sessionDir: string }
  | { type: "session.heartbeat"; sessionId: string; status: "alive" | "exited"; pid?: number }
  | { type: "session.restarted"; sessionId: string; attempt: number; reason: string }
  | { type: "prompt.accepted"; sessionId: string; requestId: string }
  | { type: "assistant.delta"; sessionId: string; delta: string }
  | {
      type: "usage.reported";
      sessionId: string;
      usage: ModelUsage;
      provider?: string;
      model?: string;
    }
  | { type: "assistant.message"; sessionId: string; content: string }
  | { type: "tool.started"; sessionId: string; toolCallId: string; toolName: string }
  | { type: "tool.finished"; sessionId: string; toolCallId: string; result: unknown }
  | { type: "session.aborted"; sessionId: string }
  | { type: "session.disposed"; sessionId: string }
  | { type: "session.error"; sessionId: string; message: string };

export type PiProcessSpawner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => ChildProcessWithoutNullStreams;

export type PiSubprocessBridgeOptions = {
  binary?: string;
  env?: NodeJS.ProcessEnv;
  commandTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxRestarts?: number;
  restartOnFailure?: boolean;
  extraArgs?: string[];
  spawnProcess?: PiProcessSpawner;
};

export type PiPackageBridgeOptions = {
  defaultProvider?: string;
  defaultModel?: string;
  resolveModel?: (input: PiSessionStartInput) => Model<Api> | Promise<Model<Api>>;
  streamFn?: StreamFn;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
};

export type PiSessionHandle = {
  id: string;
  sessionDir: string;
  events: AsyncIterable<PiBridgeEvent>;
};

export interface PiBridge {
  adapterMetadata?(): TurnRuntime;
  startSession(input: PiSessionStartInput): Promise<PiSessionHandle>;
  sendPrompt(sessionId: string, input: PiPromptInput): Promise<void>;
  abort(sessionId: string): Promise<void>;
  dispose(sessionId: string): Promise<void>;
}
