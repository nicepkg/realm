import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectLayout } from "@realm/config";
import type { Capability } from "@realm/core";
import { assertSafePathSegment } from "./support.ts";

export type RoleMemoryInput = {
  roleId: string;
};

export type RoleMemoryWriteInput = RoleMemoryInput & {
  content: string;
};

export type RoleMemoryServiceOptions = {
  root: string;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class RoleMemoryService {
  constructor(private readonly options: RoleMemoryServiceOptions) {}

  async readRoleMemory(input: RoleMemoryInput): Promise<{ content: string }> {
    this.options.assertAllowed("memory.read");
    assertSafePathSegment(input.roleId, "roleId");
    const memoryPath = this.roleMemoryPath(input.roleId);
    try {
      return { content: await readFile(memoryPath, "utf8") };
    } catch {
      return { content: "" };
    }
  }

  async writeRoleMemory(input: RoleMemoryWriteInput): Promise<{ bytes: number }> {
    this.options.assertAllowed("memory.write");
    assertSafePathSegment(input.roleId, "roleId");
    const memoryPath = this.roleMemoryPath(input.roleId);
    await mkdir(path.dirname(memoryPath), { recursive: true });
    await writeFile(memoryPath, input.content, "utf8");
    this.options.appendAudit({
      actorId: input.roleId,
      action: "memory.write",
      target: memoryPath,
      reason: "Role memory updated through Realm controlled tool.",
    });
    return { bytes: new TextEncoder().encode(input.content).byteLength };
  }

  private roleMemoryPath(roleId: string): string {
    return path.join(projectLayout(this.options.root).stateDir, "roles", roleId, "memory.md");
  }
}
