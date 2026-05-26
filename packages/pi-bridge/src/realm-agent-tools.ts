import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { PiSessionStartInput } from "./types.ts";

export function buildRealmAgentTools(input: PiSessionStartInput): AgentTool[] {
  const baseUrl = input.env?.REALM_EXTENSION_BASE_URL ?? "http://127.0.0.1:3737";
  const token = input.env?.REALM_EXTENSION_TOKEN;
  const worldId = input.env?.REALM_EXTENSION_WORLD_ID ?? input.worldId;
  const roleId = input.env?.REALM_EXTENSION_ROLE_ID ?? input.roleId;

  return [
    {
      name: "realm_state_query",
      label: "Realm State Query",
      description: "Query visible Realm state for the current role.",
      parameters: Type.Object({
        path: Type.Optional(Type.String({ description: "Optional JSON Pointer path." })),
      }),
      async execute(toolCallId, params, signal) {
        const args = params as { path?: unknown };
        const payload = await postJson(
          baseUrl,
          "/api/extension/state-query",
          {
            toolCallId,
            worldId,
            roleId,
            path: typeof args.path === "string" ? args.path : undefined,
          },
          token,
          signal,
        );
        return textResult(JSON.stringify(payload.state, null, 2), payload);
      },
    },
    {
      name: "realm_memory_read",
      label: "Realm Memory Read",
      description: "Read the current role's private Realm memory.",
      parameters: Type.Object({}),
      async execute(toolCallId, _params, signal) {
        const payload = await postJson(
          baseUrl,
          "/api/extension/memory-read",
          { toolCallId, worldId, roleId },
          token,
          signal,
        );
        return textResult(String(payload.content ?? ""), payload);
      },
    },
    {
      name: "realm_memory_write",
      label: "Realm Memory Write",
      description: "Replace the current role's private Realm memory.",
      parameters: Type.Object({
        content: Type.String({ description: "Complete memory content to store." }),
      }),
      async execute(toolCallId, params, signal) {
        const args = params as { content?: unknown };
        const payload = await postJson(
          baseUrl,
          "/api/extension/memory-write",
          {
            toolCallId,
            worldId,
            roleId,
            content: requireString(args.content, "content"),
          },
          token,
          signal,
        );
        return textResult(`Memory written (${payload.bytes ?? 0} bytes).`, payload);
      },
    },
  ];
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  token: string | undefined,
  signal: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function readErrorMessage(payload: Record<string, unknown>, status: number): string {
  const error = payload.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return `Realm tool request failed with ${status}`;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}
