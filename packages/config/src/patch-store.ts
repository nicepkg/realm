import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Capability, type ConfigPatchProposal, configPatchProposalSchema } from "@realm/core";
import YAML from "yaml";
import { type ProjectLayout, projectLayout } from "./layout.ts";
import {
  type CreateRolePatchInput,
  type CreateWorldPatchInput,
  createRolePatchInputSchema,
  createWorldPatchInputSchema,
  type RoleConfig,
  type WorldConfig,
} from "./schemas.ts";

export type ConfigPatchApplyResult = {
  patchId: string;
  historyId: string;
  changedPaths: string[];
};

type ConfigHistoryManifest = {
  id: string;
  patchId: string;
  createdAt: string;
  files: Array<{
    path: string;
    previousHash: string | null;
    previousContent: string | null;
  }>;
};

export class FileConfigPatchStore {
  private readonly layout: ProjectLayout;

  constructor(
    root: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.layout = projectLayout(root);
  }

  async proposeRole(input: CreateRolePatchInput): Promise<ConfigPatchProposal> {
    const parsed = createRolePatchInputSchema.parse(input);
    const roleConfig: RoleConfig = {
      version: 1,
      id: parsed.id,
      displayName: parsed.displayName,
      model: parsed.model,
      profile: { summary: parsed.summary },
    };
    const relativePath = `.agents/roles/${parsed.id}/role.yaml`;
    const proposal = await this.createProposal({
      title: `Create role ${parsed.displayName}`,
      summary: `Create a project role config for ${parsed.displayName}.`,
      riskLevel: "low",
      requiredCapabilities: ["role.create"],
      files: [{ path: relativePath, action: "create", content: `${YAML.stringify(roleConfig)}\n` }],
    });
    await this.saveProposal(proposal);
    return proposal;
  }

  async proposeWorld(input: CreateWorldPatchInput): Promise<ConfigPatchProposal> {
    const parsed = createWorldPatchInputSchema.parse(input);
    const worldConfig: WorldConfig = {
      version: 1,
      id: parsed.id,
      name: parsed.name,
      mode: { type: parsed.mode, time: { kind: "manual" } },
      rooms: {
        main: { type: "world-main", name: parsed.roomName },
      },
      roles: parsed.roleIds.map((id) => ({ id, model: "default" })),
      god: {
        id: "god",
        model: "default",
        permissions: { canPatchAnyState: true, canKillRole: true, canCreateEvents: true },
      },
    };
    const initialState = {
      publicState: { roles: {} },
      privateState: {},
      hiddenState: {},
      derivedState: {},
      metaState: { roles: {} },
    };
    const proposal = await this.createProposal({
      title: `Create world ${parsed.name}`,
      summary: `Create a ${parsed.mode} world with a default all-member room.`,
      riskLevel: "low",
      requiredCapabilities: ["world.create"],
      files: [
        {
          path: `.agents/worlds/${parsed.id}/world.yaml`,
          action: "create",
          content: `${YAML.stringify(worldConfig)}\n`,
        },
        {
          path: `.agents/worlds/${parsed.id}/initial-state.yaml`,
          action: "create",
          content: `${YAML.stringify(initialState)}\n`,
        },
      ],
    });
    await this.saveProposal(proposal);
    return proposal;
  }

  async loadProposal(patchId: string): Promise<ConfigPatchProposal> {
    const proposalPath = this.proposalPath(patchId);
    const raw = await readFile(proposalPath, "utf8");
    return configPatchProposalSchema.parse(JSON.parse(raw));
  }

  async apply(patchId: string): Promise<ConfigPatchApplyResult> {
    const proposal = await this.loadProposal(patchId);
    const historyId = makeFilesystemId("history");
    const manifest: ConfigHistoryManifest = {
      id: historyId,
      patchId,
      createdAt: this.clock().toISOString(),
      files: [],
    };

    for (const operation of proposal.operations) {
      const targetPath = this.resolveAgentsPath(operation.path);
      const previousContent = await readTextIfExists(targetPath);
      const previousHash = previousContent === null ? null : hashText(previousContent);

      if (previousHash !== operation.previousHash) {
        throw new Error(`Config conflict at ${operation.path}`);
      }

      manifest.files.push({
        path: operation.path,
        previousHash,
        previousContent,
      });
    }

    await this.saveHistoryManifest(manifest);

    for (const operation of proposal.operations) {
      const targetPath = this.resolveAgentsPath(operation.path);
      if (operation.action === "delete") {
        await rm(targetPath, { force: true });
        continue;
      }
      if (operation.nextContent === null) {
        throw new Error(`Missing next content for ${operation.path}`);
      }
      await writeFileAtomic(targetPath, operation.nextContent);
    }

    return {
      patchId,
      historyId,
      changedPaths: proposal.operations.map((operation) => operation.path),
    };
  }

  async rollback(historyId: string): Promise<{ historyId: string; restoredPaths: string[] }> {
    const manifestPath = path.join(this.historyDir(historyId), "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ConfigHistoryManifest;

    for (const file of manifest.files) {
      const targetPath = this.resolveAgentsPath(file.path);
      if (file.previousContent === null) {
        await rm(targetPath, { force: true });
      } else {
        await writeFileAtomic(targetPath, file.previousContent);
      }
    }

    return {
      historyId,
      restoredPaths: manifest.files.map((file) => file.path),
    };
  }

  private async createProposal(input: {
    title: string;
    summary: string;
    riskLevel: "low" | "medium" | "high";
    requiredCapabilities: Capability[];
    files: Array<{ path: string; action: "create" | "update" | "delete"; content: string | null }>;
  }): Promise<ConfigPatchProposal> {
    const operations = await Promise.all(
      input.files.map(async (file) => {
        const targetPath = this.resolveAgentsPath(file.path);
        const previousContent = await readTextIfExists(targetPath);
        return {
          path: file.path,
          action: file.action === "create" && previousContent !== null ? "update" : file.action,
          previousHash: previousContent === null ? null : hashText(previousContent),
          nextHash: file.content === null ? null : hashText(file.content),
          nextContent: file.content,
        };
      }),
    );

    return {
      id: makeFilesystemId("patch"),
      title: input.title,
      summary: input.summary,
      riskLevel: input.riskLevel,
      requiredCapabilities: input.requiredCapabilities,
      operations,
      createdAt: this.clock().toISOString(),
    };
  }

  private async saveProposal(proposal: ConfigPatchProposal): Promise<void> {
    await mkdir(this.proposalDir(), { recursive: true });
    await writeFile(
      this.proposalPath(proposal.id),
      `${JSON.stringify(proposal, null, 2)}\n`,
      "utf8",
    );
  }

  private async saveHistoryManifest(manifest: ConfigHistoryManifest): Promise<void> {
    const historyDir = this.historyDir(manifest.id);
    await mkdir(historyDir, { recursive: true });
    await writeFile(
      path.join(historyDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  private proposalDir(): string {
    return path.join(this.layout.stateDir, "config-patches");
  }

  private proposalPath(patchId: string): string {
    return path.join(this.proposalDir(), `${patchId}.json`);
  }

  private historyDir(historyId: string): string {
    return path.join(this.layout.stateDir, "config-history", historyId);
  }

  private resolveAgentsPath(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
      throw new Error(`Config patch path must be project-relative: ${relativePath}`);
    }
    if (normalized !== ".agents" && !normalized.startsWith(`.agents${path.sep}`)) {
      throw new Error(`Config patch path must stay inside .agents: ${relativePath}`);
    }

    const absolutePath = path.resolve(this.layout.root, normalized);
    const relativeToAgents = path.relative(this.layout.agentsDir, absolutePath);
    if (relativeToAgents.startsWith("..") || path.isAbsolute(relativeToAgents)) {
      throw new Error(`Config patch path escapes .agents: ${relativePath}`);
    }
    return absolutePath;
  }
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeFilesystemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
