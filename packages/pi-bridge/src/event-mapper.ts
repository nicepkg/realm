import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { type ModelUsage, modelUsageSchema } from "@realm/core";
import type { PiRpcRecord } from "./jsonl.ts";
import type { PiBridgeEvent } from "./types.ts";

export function mapPiRpcRecordToBridgeEvents(
  sessionId: string,
  record: PiRpcRecord,
): PiBridgeEvent[] {
  if (record.type === "message_update") {
    const assistantMessageEvent = record.assistantMessageEvent;
    if (isObject(assistantMessageEvent)) {
      const delta = assistantMessageEvent.delta;
      if (
        (assistantMessageEvent.type === "text_delta" ||
          assistantMessageEvent.type === "thinking_delta") &&
        typeof delta === "string"
      ) {
        return [{ type: "assistant.delta", sessionId, delta }];
      }
    }
  }

  if (record.type === "message_end") {
    return mapAssistantEndMessage(sessionId, record.message);
  }

  if (
    record.type === "tool_execution_start" &&
    typeof record.toolCallId === "string" &&
    typeof record.toolName === "string"
  ) {
    return [
      {
        type: "tool.started",
        sessionId,
        toolCallId: record.toolCallId,
        toolName: record.toolName,
      },
    ];
  }

  if (record.type === "tool_execution_end" && typeof record.toolCallId === "string") {
    return [
      {
        type: "tool.finished",
        sessionId,
        toolCallId: record.toolCallId,
        result: record.result,
      },
    ];
  }

  return [];
}

export function mapAgentEventToBridgeEvents(sessionId: string, event: AgentEvent): PiBridgeEvent[] {
  if (event.type === "message_update") {
    const assistantMessageEvent = event.assistantMessageEvent;
    if (
      (assistantMessageEvent.type === "text_delta" ||
        assistantMessageEvent.type === "thinking_delta") &&
      typeof assistantMessageEvent.delta === "string"
    ) {
      return [{ type: "assistant.delta", sessionId, delta: assistantMessageEvent.delta }];
    }
  }

  if (event.type === "message_end") {
    return mapAssistantEndMessage(sessionId, event.message);
  }

  if (event.type === "tool_execution_start") {
    return [
      {
        type: "tool.started",
        sessionId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      },
    ];
  }

  if (event.type === "tool_execution_end") {
    return [
      {
        type: "tool.finished",
        sessionId,
        toolCallId: event.toolCallId,
        result: event.result,
      },
    ];
  }

  return [];
}

function mapAssistantEndMessage(sessionId: string, message: unknown): PiBridgeEvent[] {
  const events: PiBridgeEvent[] = [];
  const usageReport = extractAssistantUsage(message);
  if (usageReport) {
    events.push({
      type: "usage.reported",
      sessionId,
      ...usageReport,
    });
  }
  const content = extractAssistantText(message);
  if (content) {
    events.push({ type: "assistant.message", sessionId, content });
  }
  const errorMessage = extractAssistantError(message);
  if (errorMessage) {
    events.push({ type: "session.error", sessionId, message: errorMessage });
  }
  return events;
}

function extractAssistantText(message: unknown): string | undefined {
  if (!isObject(message) || message.role !== "assistant") {
    return undefined;
  }
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .map((part) => {
      if (!isObject(part)) {
        return "";
      }
      return part.type === "text" && typeof part.text === "string" ? part.text : "";
    })
    .join("");
  return text.length > 0 ? text : undefined;
}

function extractAssistantError(message: unknown): string | undefined {
  if (!isObject(message) || message.role !== "assistant") {
    return undefined;
  }
  if (typeof message.errorMessage !== "string" || message.errorMessage.trim().length === 0) {
    return undefined;
  }
  const provider = typeof message.provider === "string" ? `${message.provider}` : "provider";
  const model = typeof message.model === "string" ? `/${message.model}` : "";
  return `Pi ${provider}${model} failed: ${message.errorMessage}`;
}

function extractAssistantUsage(
  message: unknown,
): { usage: ModelUsage; provider?: string; model?: string } | undefined {
  if (!isObject(message) || message.role !== "assistant") {
    return undefined;
  }
  const parsed = modelUsageSchema.safeParse(message.usage);
  if (!parsed.success) {
    return undefined;
  }
  return {
    usage: parsed.data,
    provider: typeof message.provider === "string" ? message.provider : undefined,
    model: typeof message.model === "string" ? message.model : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
