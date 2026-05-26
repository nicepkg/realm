import {
  randomWorldEventRequestSchema,
  tickWorldEventRequestSchema,
  worldEventConditionRequestSchema,
  worldEventTriggerRequestSchema,
} from "@realm/api-contract";
import type { RealmApplicationService } from "@realm/app-service";
import type { Hono } from "hono";

export function registerWorldEventRoutes(app: Hono, service: RealmApplicationService): void {
  app.get("/api/worlds/:worldId/events/replay", (context) => {
    const afterSeq = Number.parseInt(context.req.query("afterSeq") ?? "0", 10);
    return context.json(
      service.worldEvents.getReplay({
        worldId: context.req.param("worldId"),
        afterSeq: Number.isNaN(afterSeq) ? 0 : afterSeq,
      }),
    );
  });

  app.post("/api/worlds/:worldId/events/manual", async (context) => {
    const request = worldEventTriggerRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldEvents.triggerManualEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });

  app.post("/api/worlds/:worldId/events/god-adjudicated", async (context) => {
    const request = worldEventTriggerRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldEvents.triggerGodAdjudicatedEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });

  app.post("/api/worlds/:worldId/events/random", async (context) => {
    const request = randomWorldEventRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldEvents.triggerRandomEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });

  app.post("/api/worlds/:worldId/events/tick", async (context) => {
    const request = tickWorldEventRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldEvents.triggerTick({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });

  app.post("/api/worlds/:worldId/events/condition", async (context) => {
    const request = worldEventConditionRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldEvents.triggerConditionEvent({
        ...request,
        worldId: context.req.param("worldId"),
      }),
      201,
    );
  });
}
