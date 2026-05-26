import {
  loadProjectConfig,
  loadRoleConfigs,
  loadWorldConfigs,
  type ProjectConfig,
} from "@realm/config";
import type { RoleSummary, WorldSummary } from "@realm/core";
import { humanizeId } from "./support.ts";

export class ConfigQueryService {
  constructor(private readonly root: string) {}

  async getProject(): Promise<{ root: string; name: string; defaultWorldId: string }> {
    const config = await loadProjectConfig(this.root);
    return {
      root: this.root,
      name: config.project.name,
      defaultWorldId: config.defaults.world,
    };
  }

  async getConfigStatus(): Promise<{ ok: boolean; errors: string[] }> {
    try {
      await loadProjectConfig(this.root);
      await loadWorldConfigs(this.root);
      await loadRoleConfigs(this.root);
      return { ok: true, errors: [] };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async getEffectiveConfig(): Promise<{
    project: Awaited<ReturnType<ConfigQueryService["getProject"]>>;
    worlds: WorldSummary[];
    roles: RoleSummary[];
  }> {
    return {
      project: await this.getProject(),
      worlds: await this.listWorlds(),
      roles: await this.listRoles(),
    };
  }

  async listWorlds(): Promise<WorldSummary[]> {
    const worlds = await loadWorldConfigs(this.root);
    return worlds.map((world) => {
      const defaultRoomId =
        Object.entries(world.rooms).find(([, room]) => room.type === "world-main")?.[0] ??
        Object.keys(world.rooms)[0] ??
        "main";
      return {
        id: world.id,
        name: world.name,
        mode: world.mode,
        defaultRoomId,
        roleIds: world.roles.map((role) => role.id),
      };
    });
  }

  async listRoles(): Promise<RoleSummary[]> {
    const roleConfigs = await loadRoleConfigs(this.root);
    const explicitRoles = new Map<string, RoleSummary>(
      roleConfigs.map((role) => [
        role.id,
        {
          id: role.id,
          displayName: role.displayName,
          model: role.model,
          source: "config" as const,
        },
      ]),
    );

    for (const world of await loadWorldConfigs(this.root)) {
      for (const role of world.roles) {
        if (!explicitRoles.has(role.id)) {
          explicitRoles.set(role.id, {
            id: role.id,
            displayName: humanizeId(role.id),
            model: role.model,
            source: "world",
          });
        }
      }
    }

    return [...explicitRoles.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}

export type ProjectSettings = ProjectConfig;
