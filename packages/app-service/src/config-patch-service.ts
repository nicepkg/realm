import { randomUUID } from "node:crypto";
import { type ConfigAssistantPlanner, DeterministicConfigAssistantPlanner } from "@realm/assistant";
import type {
  ConfigPatchApplyInput,
  ConfigPatchRevisionInput,
  CreateRolePatchInput,
  CreateWorldPatchInput,
  FileConfigPatchStore,
} from "@realm/config";
import type { Capability, ConfigPatchProposal } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import { OWNER_ID } from "./support.ts";

type ConfigPatchServiceOptions = {
  eventStore: EventStore;
  clock: () => Date;
  patchStore: FileConfigPatchStore;
  planner?: ConfigAssistantPlanner;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class ConfigPatchService {
  private readonly planner: ConfigAssistantPlanner;

  constructor(private readonly options: ConfigPatchServiceOptions) {
    this.planner = options.planner ?? new DeterministicConfigAssistantPlanner();
  }

  async proposeRole(input: CreateRolePatchInput, worldId?: string): Promise<ConfigPatchProposal> {
    this.options.assertAllowed("role.create");
    const proposal = await this.options.patchStore.proposeRole(input, worldId);
    this.appendConfigPatchProposed(proposal);
    return proposal;
  }

  async proposeWorld(input: CreateWorldPatchInput): Promise<ConfigPatchProposal> {
    this.options.assertAllowed("world.create");
    const proposal = await this.options.patchStore.proposeWorld(input);
    this.appendConfigPatchProposed(proposal);
    return proposal;
  }

  async proposeAssistantConfig(input: {
    goal: string;
    worldId?: string;
  }): Promise<ConfigPatchProposal> {
    const plan = await this.planner.plan(input.goal);
    if (plan.kind === "world") {
      return this.proposeWorld(plan.world);
    }
    // Thread the active world id so an add-role plan ATTACHES the new role to the
    // world.yaml of the world the operator is currently in (a second update op),
    // not just a standalone project role.
    return this.proposeRole(plan.role, input.worldId);
  }

  async applyConfigPatch(
    patchId: string,
    input: ConfigPatchApplyInput = {},
  ): Promise<{ patchId: string; historyId: string; changedPaths: string[] }> {
    const proposal = await this.options.patchStore.loadProposal(patchId);
    for (const capability of proposal.requiredCapabilities) {
      this.options.assertAllowed(capability);
    }

    const result = await this.options.patchStore.apply(patchId, input);
    const createdAt = nowIso(this.options.clock());
    this.options.eventStore.append({
      eventId: makeId("event:config:patch:applied", randomUUID()),
      schemaVersion: 1,
      aggregateId: "config",
      idempotencyKey: `config-patch-applied:${patchId}`,
      createdAt,
      type: "config.patch.applied",
      patchId,
      historyId: result.historyId,
    });
    this.options.appendAudit({
      actorId: OWNER_ID,
      action: "config.patch.applied",
      target: patchId,
      reason: proposal.summary,
    });
    return result;
  }

  async reviseConfigPatch(
    patchId: string,
    input: ConfigPatchRevisionInput,
  ): Promise<ConfigPatchProposal> {
    const proposal = await this.options.patchStore.loadProposal(patchId);
    for (const capability of proposal.requiredCapabilities) {
      this.options.assertAllowed(capability);
    }
    const revised = await this.options.patchStore.revise(patchId, input);
    this.appendConfigPatchProposed(revised);
    this.options.appendAudit({
      actorId: OWNER_ID,
      action: "config.patch.revised",
      target: revised.id,
      reason: proposal.summary,
    });
    return revised;
  }

  async rollbackConfigHistory(
    historyId: string,
  ): Promise<{ historyId: string; restoredPaths: string[] }> {
    const result = await this.options.patchStore.rollback(historyId);
    this.options.appendAudit({
      actorId: OWNER_ID,
      action: "config.rollback",
      target: historyId,
      reason: "Restore previous config files from history.",
    });
    return result;
  }

  private appendConfigPatchProposed(proposal: ConfigPatchProposal): void {
    this.options.eventStore.append({
      eventId: makeId("event:config:patch:proposed", proposal.id),
      schemaVersion: 1,
      aggregateId: "config",
      idempotencyKey: `config-patch-proposed:${proposal.id}`,
      createdAt: proposal.createdAt,
      type: "config.patch.proposed",
      patch: proposal,
    });
  }
}
