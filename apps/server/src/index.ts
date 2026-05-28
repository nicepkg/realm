import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  adminStatePatchRequestSchema,
  applyProjectPatchRequestSchema,
  assistantConfigRequestSchema,
  configPatchApplyRequestSchema,
  createRoleRequestSchema,
  createRoomRequestSchema,
  createWorkflowArtifactRequestSchema,
  createWorkflowTaskRequestSchema,
  createWorldRequestSchema,
  decideWorkflowApprovalRequestSchema,
  decideWorkflowReviewRequestSchema,
  extensionMemoryReadRequestSchema,
  extensionMemoryWriteRequestSchema,
  extensionStateQueryRequestSchema,
  godRoleActionRequestSchema,
  naturalWorldEventRequestSchema,
  proposeProjectPatchRequestSchema,
  randomNaturalWorldEventRequestSchema,
  requestWorkflowApprovalRequestSchema,
  requestWorkflowReviewRequestSchema,
  runRoleTurnRequestSchema,
  sendMessageRequestSchema,
  updateProjectSettingsRequestSchema,
  updateUserSettingsRequestSchema,
} from "@realm/api-contract";
import {
  OWNER_ID,
  RealmApplicationService,
  type RealmApplicationServiceOptions,
} from "@realm/app-service";
import { Hono } from "hono";
import { registerSimulationRoutes } from "./simulation-routes.ts";
import { registerWorldEventRoutes } from "./world-event-routes.ts";

export type RealmServerOptions = RealmApplicationServiceOptions & {
  webDistDir?: string;
  service?: RealmApplicationService;
};

export type RealmEventWebSocketData = {
  service: RealmApplicationService;
  lastSeq: number;
  interval?: ReturnType<typeof setInterval>;
};

export function createRealmServer(options: RealmServerOptions): Hono {
  const app = new Hono();
  const service = options.service ?? new RealmApplicationService(options);
  const webDistDir = options.webDistDir;

  app.onError((error, context) =>
    context.json(
      {
        ok: false,
        error: {
          code: "realm_error",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500,
    ),
  );

  app.get("/api/health", (context) => context.json({ ok: true }));
  app.get("/api/project", async (context) => context.json(await service.getProject()));
  app.get("/api/settings", async (context) => context.json(await service.getSettings()));
  app.get("/api/settings/export", async (context) => context.json(await service.exportSettings()));
  app.post("/api/settings/import", async (context) =>
    context.json(await service.importSettings(await context.req.json())),
  );
  app.post("/api/settings/user", async (context) => {
    const request = updateUserSettingsRequestSchema.parse(await context.req.json());
    return context.json(await service.updateUserSettings(request));
  });
  app.post("/api/settings/project", async (context) => {
    const request = updateProjectSettingsRequestSchema.parse(await context.req.json());
    return context.json(await service.updateProjectSettings(request));
  });
  app.get("/api/config/status", async (context) => context.json(await service.getConfigStatus()));
  app.get("/api/config/effective", async (context) =>
    context.json(await service.getEffectiveConfig()),
  );
  app.get("/api/policy/effective", async (context) =>
    context.json(await service.getEffectivePolicy()),
  );

  app.get("/api/events", (context) => {
    const afterSeq = Number.parseInt(context.req.query("afterSeq") ?? "0", 10);
    const events = service.listEvents({
      afterSeq: Number.isNaN(afterSeq) ? 0 : afterSeq,
      limit: 500,
    });
    return context.json({ events, lastSeq: service.lastEventSeq() });
  });
  app.get("/api/events/stream", (context) => {
    const afterSeq = Number.parseInt(context.req.query("afterSeq") ?? "0", 10);
    return new Response(createEventStream(service, Number.isNaN(afterSeq) ? 0 : afterSeq), {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  });
  app.get("/api/events/ws", (context) =>
    context.text("WebSocket upgrade required for /api/events/ws", 426),
  );

  app.get("/api/worlds", async (context) => context.json({ worlds: await service.listWorlds() }));
  app.get("/api/worlds/:worldId/state", async (context) =>
    context.json(await service.getWorldState(context.req.param("worldId"))),
  );
  app.get("/api/worlds/:worldId/roles/:roleId/memory", async (context) =>
    context.json(await service.readRoleMemory({ roleId: context.req.param("roleId") })),
  );
  registerWorldEventRoutes(app, service);
  registerSimulationRoutes(app, service);
  app.get("/api/worlds/:worldId/rooms", async (context) =>
    context.json({ rooms: await service.listRooms(context.req.param("worldId")) }),
  );
  app.post("/api/worlds/:worldId/rooms", async (context) => {
    const request = createRoomRequestSchema.parse(await context.req.json());
    const room = service.createRoom({ ...request, worldId: context.req.param("worldId") });
    return context.json({ room }, 201);
  });
  app.get("/api/roles", async (context) => context.json({ roles: await service.listRoles() }));
  app.get("/api/rooms/:roomId/messages", (context) =>
    context.json({ messages: service.listMessages(context.req.param("roomId")) }),
  );
  app.post("/api/rooms/:roomId/messages", async (context) => {
    const request = sendMessageRequestSchema.parse(await context.req.json());
    const message = service.sendMessage({
      ...request,
      operatorId: OWNER_ID,
      roomId: context.req.param("roomId"),
    });
    return context.json({ message }, 201);
  });
  app.post("/api/rooms/:roomId/role-turns", async (context) => {
    const request = runRoleTurnRequestSchema.parse(await context.req.json());
    const result = await service.runRoleTurn({ ...request, roomId: context.req.param("roomId") });
    return context.json(result, 201);
  });
  app.post("/api/rooms/:roomId/role-turns/start", async (context) => {
    const request = runRoleTurnRequestSchema.parse(await context.req.json());
    return context.json(
      service.startRoleTurn({ ...request, roomId: context.req.param("roomId") }),
      202,
    );
  });
  app.post("/api/turns/:turnId/cancel", (context) =>
    context.json(service.cancelTurn(context.req.param("turnId"))),
  );
  app.post("/api/admin/state-patch", async (context) => {
    const request = adminStatePatchRequestSchema.parse(await context.req.json());
    return context.json(await service.adminPatchState(request), 201);
  });
  app.post("/api/god/:worldId/actions", async (context) => {
    const request = godRoleActionRequestSchema.parse(await context.req.json());
    return context.json(
      await service.applyGodRoleAction({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });
  app.post("/api/god/:worldId/natural-events", async (context) => {
    const request = naturalWorldEventRequestSchema.parse(await context.req.json());
    return context.json(
      await service.triggerNaturalEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });
  app.post("/api/god/:worldId/natural-events/random", async (context) => {
    const request = randomNaturalWorldEventRequestSchema.parse(await context.req.json());
    return context.json(
      await service.triggerRandomNaturalEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });
  app.post("/api/extension/state-query", async (context) => {
    const request = extensionStateQueryRequestSchema.parse(await context.req.json());
    const access = service.verifyExtensionAccess({
      token: readBearerToken(context.req.header("authorization")),
      worldId: request.worldId,
      roleId: request.roleId,
      capability: "state.query",
      toolName: "realm_state_query",
      toolCallId: request.toolCallId,
    });
    if (!access.allow) {
      return context.json(extensionAccessError(access.reason), access.status);
    }
    return context.json(await service.queryRoleState(request));
  });
  app.post("/api/extension/memory-read", async (context) => {
    const request = extensionMemoryReadRequestSchema.parse(await context.req.json());
    const access = service.verifyExtensionAccess({
      token: readBearerToken(context.req.header("authorization")),
      worldId: request.worldId,
      roleId: request.roleId,
      capability: "memory.read",
      toolName: "realm_memory_read",
      toolCallId: request.toolCallId,
    });
    if (!access.allow) {
      return context.json(extensionAccessError(access.reason), access.status);
    }
    return context.json(await service.readRoleMemory(request));
  });
  app.post("/api/extension/memory-write", async (context) => {
    const request = extensionMemoryWriteRequestSchema.parse(await context.req.json());
    const access = service.verifyExtensionAccess({
      token: readBearerToken(context.req.header("authorization")),
      worldId: request.worldId,
      roleId: request.roleId,
      capability: "memory.write",
      toolName: "realm_memory_write",
      toolCallId: request.toolCallId,
    });
    if (!access.allow) {
      return context.json(extensionAccessError(access.reason), access.status);
    }
    return context.json(await service.writeRoleMemory(request));
  });

  app.post("/api/config/patches/role", async (context) => {
    const request = createRoleRequestSchema.parse(await context.req.json());
    return context.json({ patch: await service.proposeRole(request) }, 201);
  });

  app.post("/api/config/patches/world", async (context) => {
    const request = createWorldRequestSchema.parse(await context.req.json());
    return context.json({ patch: await service.proposeWorld(request) }, 201);
  });

  app.post("/api/assistant/config", async (context) => {
    const request = assistantConfigRequestSchema.parse(await context.req.json());
    return context.json({ patch: await service.proposeAssistantConfig(request) }, 201);
  });

  app.post("/api/config/patches/:patchId/apply", async (context) => {
    const rawBody = await context.req.text();
    const request = configPatchApplyRequestSchema.parse(rawBody ? JSON.parse(rawBody) : {});
    return context.json(await service.applyConfigPatch(context.req.param("patchId"), request));
  });

  app.post("/api/config/history/:historyId/rollback", async (context) =>
    context.json(await service.rollbackConfigHistory(context.req.param("historyId"))),
  );

  app.post("/api/worlds/:worldId/workflow/artifacts", async (context) => {
    const request = createWorkflowArtifactRequestSchema.parse(await context.req.json());
    const artifact = service.createWorkflowArtifact({
      ...request,
      worldId: context.req.param("worldId"),
    });
    return context.json({ artifact }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/tasks", async (context) => {
    const request = createWorkflowTaskRequestSchema.parse(await context.req.json());
    const task = service.createWorkflowTask({ ...request, worldId: context.req.param("worldId") });
    return context.json({ task }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/reviews", async (context) => {
    const request = requestWorkflowReviewRequestSchema.parse(await context.req.json());
    const review = service.requestWorkflowReview({
      ...request,
      worldId: context.req.param("worldId"),
    });
    return context.json({ review }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/reviews/:reviewId/decision", async (context) => {
    const request = decideWorkflowReviewRequestSchema.parse(await context.req.json());
    const review = service.decideWorkflowReview({
      ...request,
      worldId: context.req.param("worldId"),
      reviewId: context.req.param("reviewId"),
    });
    return context.json({ review }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/approvals", async (context) => {
    const request = requestWorkflowApprovalRequestSchema.parse(await context.req.json());
    const approval = service.requestWorkflowApproval({
      ...request,
      worldId: context.req.param("worldId"),
    });
    return context.json({ approval }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/approvals/:approvalId/decision", async (context) => {
    const request = decideWorkflowApprovalRequestSchema.parse(await context.req.json());
    const approval = service.decideWorkflowApproval({
      ...request,
      worldId: context.req.param("worldId"),
      approvalId: context.req.param("approvalId"),
    });
    return context.json({ approval }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/project-patches", async (context) => {
    const request = proposeProjectPatchRequestSchema.parse(await context.req.json());
    const projectPatch = await service.proposeProjectPatch({
      ...request,
      worldId: context.req.param("worldId"),
    });
    return context.json({ projectPatch }, 201);
  });

  app.post("/api/worlds/:worldId/workflow/project-patches/:patchId/apply", async (context) => {
    const request = applyProjectPatchRequestSchema.parse(await context.req.json());
    const projectPatch = await service.applyProjectPatch({
      ...request,
      worldId: context.req.param("worldId"),
      patchId: context.req.param("patchId"),
    });
    return context.json({ projectPatch }, 201);
  });

  if (webDistDir) {
    app.get("/assets/*", async (context) => serveWebFile(context.req.path, webDistDir));
    app.get("*", async (context) => {
      if (context.req.path.startsWith("/api/")) {
        return context.json({ ok: false, error: { code: "not_found", message: "Not found" } }, 404);
      }
      return serveWebFile("/index.html", webDistDir);
    });
  }

  return app;
}

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

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1];
}

function extensionAccessError(message: string) {
  return {
    ok: false,
    error: {
      code: "extension_access_denied",
      message,
    },
  };
}

async function serveWebFile(requestPath: string, webDistDir: string): Promise<Response> {
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

function createEventStream(service: RealmApplicationService, initialSeq: number): ReadableStream {
  const encoder = new TextEncoder();
  let lastSeq = initialSeq;
  let interval: ReturnType<typeof setInterval> | undefined;

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
      interval = setInterval(sendPending, 500);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });
}
