import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RealmApplicationService } from "@realm/app-service";

export type RealmEventWebSocketData = {
  service: RealmApplicationService;
  lastSeq: number;
  interval?: ReturnType<typeof setInterval>;
};

export function createRealmWebSocketHandlers(): Bun.WebSocketHandler<RealmEventWebSocketData> {
  return {
    open(websocket) {
      sendPendingWebSocketEvents(websocket);
      websocket.data.interval = setInterval(() => sendPendingWebSocketEvents(websocket), 500);
    },
    message() {
      // Realm event sockets are server-push only in P2.
    },
    close(websocket) {
      if (websocket.data.interval) {
        clearInterval(websocket.data.interval);
      }
    },
  };
}

export function realmWebSocketData(
  service: RealmApplicationService,
  afterSeq: number,
): RealmEventWebSocketData {
  return {
    service,
    lastSeq: Number.isNaN(afterSeq) ? 0 : afterSeq,
  };
}

export function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1];
}

export function extensionAccessError(message: string) {
  return {
    ok: false,
    error: {
      code: "extension_access_denied",
      message,
    },
  };
}

export async function serveWebFile(requestPath: string, webDistDir: string): Promise<Response> {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(webDistDir, relativePath);
  const relativeToDist = path.relative(webDistDir, filePath);
  if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        "content-type": contentType(filePath),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "application/octet-stream";
}

function sendPendingWebSocketEvents(websocket: Bun.ServerWebSocket<RealmEventWebSocketData>): void {
  const events = websocket.data.service.listEvents({
    afterSeq: websocket.data.lastSeq,
    limit: 100,
  });
  for (const event of events) {
    websocket.data.lastSeq = event.seq;
    websocket.send(JSON.stringify(event));
  }
}

/** SSE heartbeat interval. Keeps proxies and idle-timeout watchdogs from
 * closing a quiet stream, and lets the client detect a dead connection. */
const SSE_HEARTBEAT_MS = 5_000;

export function createEventStream(
  service: RealmApplicationService,
  initialSeq: number,
): ReadableStream {
  const encoder = new TextEncoder();
  let lastSeq = initialSeq;
  let pollInterval: ReturnType<typeof setInterval> | undefined;
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream({
    start(controller) {
      const sendPending = () => {
        const events = service.listEvents({ afterSeq: lastSeq, limit: 100 });
        for (const event of events) {
          lastSeq = event.seq;
          controller.enqueue(
            encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        }
      };

      sendPending();
      pollInterval = setInterval(sendPending, 500);
      // Comment-only heartbeat (ignored by EventSource) so the connection stays
      // open and observably alive even when no events flow.
      heartbeatInterval = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, SSE_HEARTBEAT_MS);
    },
    cancel() {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    },
  });
}
