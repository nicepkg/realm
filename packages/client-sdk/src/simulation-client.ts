import {
  simulationBackgroundRunResponseSchema,
  simulationBackgroundStartRequestSchema,
  simulationControlRequestSchema,
  simulationControlResponseSchema,
  simulationExportResponseSchema,
  simulationForkRequestSchema,
  simulationForkResponseSchema,
  simulationResumeRequestSchema,
  simulationRunRequestSchema,
  simulationRunResponseSchema,
  simulationStatusResponseSchema,
} from "@realm/api-contract";
import type { z } from "zod";
import { type RealmClientOptions, RealmHttpTransport } from "./http.ts";

export class RealmSimulationClient extends RealmHttpTransport {
  constructor(options: RealmClientOptions = {}) {
    super(options);
  }

  async getStatus(worldId: string): Promise<z.infer<typeof simulationStatusResponseSchema>> {
    return this.get(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/status`,
      simulationStatusResponseSchema,
    );
  }

  async runTicks(
    worldId: string,
    input: z.input<typeof simulationRunRequestSchema>,
  ): Promise<z.infer<typeof simulationRunResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/ticks`,
      simulationRunRequestSchema.parse(input),
      simulationRunResponseSchema,
    );
  }

  async pause(
    worldId: string,
    input: z.input<typeof simulationControlRequestSchema>,
  ): Promise<z.infer<typeof simulationControlResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/pause`,
      simulationControlRequestSchema.parse(input),
      simulationControlResponseSchema,
    );
  }

  async resume(
    worldId: string,
    input: z.input<typeof simulationResumeRequestSchema>,
  ): Promise<z.infer<typeof simulationControlResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/resume`,
      simulationResumeRequestSchema.parse(input),
      simulationControlResponseSchema,
    );
  }

  async exportWorld(
    worldId: string,
    afterSeq = 0,
  ): Promise<z.infer<typeof simulationExportResponseSchema>> {
    return this.get(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/export?afterSeq=${afterSeq}`,
      simulationExportResponseSchema,
    );
  }

  async fork(
    worldId: string,
    input: z.input<typeof simulationForkRequestSchema>,
  ): Promise<z.infer<typeof simulationForkResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/forks`,
      simulationForkRequestSchema.parse(input),
      simulationForkResponseSchema,
    );
  }

  async startBackground(
    worldId: string,
    input: z.input<typeof simulationBackgroundStartRequestSchema>,
  ): Promise<z.infer<typeof simulationBackgroundRunResponseSchema>> {
    return this.post(
      `/api/worlds/${encodeURIComponent(worldId)}/simulation/background`,
      simulationBackgroundStartRequestSchema.parse(input),
      simulationBackgroundRunResponseSchema,
    );
  }

  async stopBackground(
    runId: string,
  ): Promise<z.infer<typeof simulationBackgroundRunResponseSchema>> {
    return this.post(
      `/api/simulation/background/${encodeURIComponent(runId)}/stop`,
      {},
      simulationBackgroundRunResponseSchema,
    );
  }
}
