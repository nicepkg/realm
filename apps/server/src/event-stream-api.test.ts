import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RealmApplicationService } from "@realm/app-service";
import { initProject } from "@realm/config";
import { createRealmServer, createRealmWebSocketHandlers, realmWebSocketData } from "./index.ts";

describe("Realm event stream API", () => {
  test("streams events as server-sent events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-stream-"));
    await initProject(root, "demo");
    const app = createRealmServer({ root, trustTier: "run-roles" });
    await app.request("/api/rooms/main/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldId: "cultivation",
        displayedAuthorId: "owner",
        content: "Stream me.",
      }),
    });

    const response = await app.request("/api/events/stream?afterSeq=0");
    const reader = response.body?.getReader();
    const chunk = await reader?.read();
    await reader?.cancel();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(new TextDecoder().decode(chunk?.value)).toContain("message.created");
  });

  test("reports the latest event sequence when the event page is capped", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-events-cursor-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });
    const app = createRealmServer({ root, service });

    for (let index = 0; index < 505; index += 1) {
      service.sendMessage({
        worldId: "cultivation",
        roomId: "main",
        operatorId: "owner",
        displayedAuthorId: "owner",
        content: `event ${index}`,
        idempotencyKey: `event-cursor-${index}`,
      });
    }

    const response = await app.request("/api/events?afterSeq=0");
    const payload = (await response.json()) as { events: Array<{ seq: number }>; lastSeq: number };

    expect(payload.events).toHaveLength(500);
    expect(payload.events.at(-1)?.seq).toBe(500);
    expect(payload.lastSeq).toBe(505);
  });

  test("streams events over WebSocket", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-server-ws-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });
    const app = createRealmServer({ root, service });
    service.sendMessage({
      worldId: "cultivation",
      roomId: "main",
      displayedAuthorId: "owner",
      content: "WebSocket me.",
    });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request, server) {
        const requestUrl = new URL(request.url);
        if (requestUrl.pathname === "/api/events/ws") {
          const afterSeq = Number.parseInt(requestUrl.searchParams.get("afterSeq") ?? "0", 10);
          const upgraded = server.upgrade(request, {
            data: realmWebSocketData(service, afterSeq),
          });
          return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
        }
        return app.fetch(request);
      },
      websocket: createRealmWebSocketHandlers(),
    });

    try {
      const event = JSON.parse(
        await readOneWebSocketMessage(`ws://127.0.0.1:${server.port}/api/events/ws?afterSeq=0`),
      ) as { type: string; message: { content: string } };
      expect(event.type).toBe("message.created");
      expect(event.message.content).toBe("WebSocket me.");
    } finally {
      server.stop(true);
    }
  });
});

function readOneWebSocketMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for WebSocket event"));
    }, 2_000);
    socket.onmessage = (event) => {
      clearTimeout(timeout);
      socket.close();
      resolve(String(event.data));
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed"));
    };
  });
}
