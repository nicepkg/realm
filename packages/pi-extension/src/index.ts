import { Type } from "typebox";

export type RealmPiExtensionOptions = {
  baseUrl?: string;
  token?: string;
  worldId?: string;
  roleId?: string;
  fetchImpl?: typeof fetch;
};

type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }>;
};

type ExtensionApiLike = {
  registerTool(tool: ToolDefinition): void;
};

export function createRealmPiExtension(options: RealmPiExtensionOptions = {}) {
  const baseUrl =
    options.baseUrl ?? process.env.REALM_EXTENSION_BASE_URL ?? "http://127.0.0.1:3737";
  const token = options.token ?? process.env.REALM_EXTENSION_TOKEN;
  const injectedWorldId = options.worldId ?? process.env.REALM_EXTENSION_WORLD_ID;
  const injectedRoleId = options.roleId ?? process.env.REALM_EXTENSION_ROLE_ID;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return (pi: ExtensionApiLike) => {
    pi.registerTool({
      name: "realm_state_query",
      label: "Realm State Query",
      description: "Query the visible Realm state for the current role.",
      parameters: Type.Object({
        worldId: Type.Optional(Type.String({ description: "Realm world id. Usually injected." })),
        roleId: Type.Optional(Type.String({ description: "Current role id. Usually injected." })),
        path: Type.Optional(Type.String({ description: "Optional JSON Pointer path." })),
      }),
      async execute(toolCallId, params, signal) {
        const payload = await postJson(
          fetchImpl,
          baseUrl,
          "/api/extension/state-query",
          {
            toolCallId,
            worldId: injectedWorldId ?? requireString(params.worldId, "worldId"),
            roleId: injectedRoleId ?? requireString(params.roleId, "roleId"),
            path: typeof params.path === "string" ? params.path : undefined,
          },
          token,
          signal,
        );
        return textResult(JSON.stringify(payload.state, null, 2), payload);
      },
    });

    pi.registerTool({
      name: "realm_memory_read",
      label: "Realm Memory Read",
      description: "Read the current role's private Realm memory.",
      parameters: Type.Object({
        roleId: Type.Optional(Type.String({ description: "Current role id. Usually injected." })),
      }),
      async execute(toolCallId, params, signal) {
        const payload = await postJson(
          fetchImpl,
          baseUrl,
          "/api/extension/memory-read",
          {
            toolCallId,
            worldId: injectedWorldId,
            roleId: injectedRoleId ?? requireString(params.roleId, "roleId"),
          },
          token,
          signal,
        );
        return textResult(String(payload.content ?? ""), payload);
      },
    });

    pi.registerTool({
      name: "realm_memory_write",
      label: "Realm Memory Write",
      description: "Replace the current role's private Realm memory.",
      parameters: Type.Object({
        roleId: Type.Optional(Type.String({ description: "Current role id. Usually injected." })),
        content: Type.String({ description: "Complete memory content to store." }),
      }),
      async execute(toolCallId, params, signal) {
        const payload = await postJson(
          fetchImpl,
          baseUrl,
          "/api/extension/memory-write",
          {
            toolCallId,
            worldId: injectedWorldId,
            roleId: injectedRoleId ?? requireString(params.roleId, "roleId"),
            content: requireString(params.content, "content"),
          },
          token,
          signal,
        );
        return textResult(`Memory written (${payload.bytes ?? 0} bytes).`, payload);
      },
    });
  };
}

export default createRealmPiExtension();

async function postJson(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  body: unknown,
  token: string | undefined,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
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
    const message =
      typeof payload?.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `Realm extension request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}
