import { describe, expect, test } from "bun:test";
import { createRealmPiExtension } from "./index.ts";

describe("Realm Pi extension", () => {
  test("registers controlled state and memory tools", () => {
    const tools: Array<{ name: string }> = [];
    createRealmPiExtension({ fetchImpl: fakeFetch({}) })({
      registerTool(tool) {
        tools.push(tool);
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "realm_state_query",
      "realm_memory_read",
      "realm_memory_write",
    ]);
  });

  test("calls host endpoints from tools", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const tools: Array<{
      name: string;
      execute: (
        toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal,
      ) => Promise<{ content: Array<{ text: string }> }>;
    }> = [];
    createRealmPiExtension({
      baseUrl: "http://realm.local",
      fetchImpl: (async (url: URL | RequestInfo, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({
          state: { publicState: { weather: "clear" } },
          content: "memory",
          bytes: 6,
        });
      }) as unknown as typeof fetch,
    })({
      registerTool(tool) {
        tools.push(tool);
      },
    });

    const stateTool = tools.find((tool) => tool.name === "realm_state_query");
    const result = await stateTool?.execute(
      "tool-1",
      { worldId: "cultivation", roleId: "leijun" },
      new AbortController().signal,
    );

    expect(calls[0]).toEqual({
      url: "http://realm.local/api/extension/state-query",
      body: { toolCallId: "tool-1", worldId: "cultivation", roleId: "leijun" },
    });
    expect(result?.content[0]?.text).toContain("weather");
  });

  test("uses injected runtime identity and bearer token", async () => {
    const calls: Array<{ headers: HeadersInit | undefined; body: unknown }> = [];
    const tools: Array<{
      name: string;
      execute: (
        toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal,
      ) => Promise<{ content: Array<{ text: string }> }>;
    }> = [];
    createRealmPiExtension({
      baseUrl: "http://realm.local",
      token: "secret",
      worldId: "cultivation",
      roleId: "leijun",
      fetchImpl: (async (_url: URL | RequestInfo, init?: RequestInit) => {
        calls.push({ headers: init?.headers, body: JSON.parse(String(init?.body)) });
        return Response.json({ content: "memory" });
      }) as unknown as typeof fetch,
    })({
      registerTool(tool) {
        tools.push(tool);
      },
    });

    const memoryTool = tools.find((tool) => tool.name === "realm_memory_read");
    await memoryTool?.execute("tool-2", {}, new AbortController().signal);

    expect(calls[0]?.body).toEqual({
      toolCallId: "tool-2",
      worldId: "cultivation",
      roleId: "leijun",
    });
    expect(calls[0]?.headers).toMatchObject({ authorization: "Bearer secret" });
  });
});

function fakeFetch(payload: Record<string, unknown>): typeof fetch {
  return (async () => Response.json(payload)) as unknown as typeof fetch;
}
