import {
  simulationBackgroundStartRequestSchema,
  simulationControlRequestSchema,
  simulationForkRequestSchema,
  simulationResumeRequestSchema,
  simulationRunRequestSchema,
} from "@realm/api-contract";
import type { RealmApplicationService } from "@realm/app-service";
import type { Hono } from "hono";

export function registerSimulationRoutes(app: Hono, service: RealmApplicationService): void {
  app.get("/api/worlds/:worldId/simulation/status", async (context) =>
    context.json(await service.worldSimulation.getStatus(context.req.param("worldId"))),
  );
  app.post("/api/worlds/:worldId/simulation/ticks", async (context) => {
    const request = simulationRunRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldSimulation.runTicks(context.req.param("worldId"), request),
      201,
    );
  });
  app.post("/api/worlds/:worldId/simulation/pause", async (context) => {
    const request = simulationControlRequestSchema.parse(await context.req.json());
    return context.json(await service.worldSimulation.pause(context.req.param("worldId"), request));
  });
  app.post("/api/worlds/:worldId/simulation/resume", async (context) => {
    const request = simulationResumeRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldSimulation.resume(context.req.param("worldId"), request),
    );
  });
  app.get("/api/worlds/:worldId/simulation/export", async (context) => {
    const afterSeq = Number.parseInt(context.req.query("afterSeq") ?? "0", 10);
    return context.json(
      await service.worldSimulation.exportWorld(
        context.req.param("worldId"),
        Number.isNaN(afterSeq) ? 0 : afterSeq,
      ),
    );
  });
  app.post("/api/worlds/:worldId/simulation/forks", async (context) => {
    const request = simulationForkRequestSchema.parse(await context.req.json());
    return context.json(
      await service.worldSimulation.forkWorld(context.req.param("worldId"), request),
      201,
    );
  });
  app.post("/api/worlds/:worldId/simulation/background", async (context) => {
    const request = simulationBackgroundStartRequestSchema.parse(await context.req.json());
    return context.json(
      service.worldSimulation.startBackground(context.req.param("worldId"), request),
      202,
    );
  });
  app.post("/api/simulation/background/:runId/stop", (context) =>
    context.json(service.worldSimulation.stopBackground(context.req.param("runId"))),
  );
}
