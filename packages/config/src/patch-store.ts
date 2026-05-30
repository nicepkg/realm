import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type Capability,
  type ConfigPatchProposal,
  configPatchProposalSchema,
  idSchema,
} from "@realm/core";
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

export type ConfigPatchApplyInput = {
  confirmation?: string;
};

export type ConfigPatchRevisionInput = {
  operations: Array<{
    path: string;
    nextContent: string | null;
  }>;
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

  async proposeRole(input: CreateRolePatchInput, worldId?: string): Promise<ConfigPatchProposal> {
    const parsed = createRolePatchInputSchema.parse(input);
    const roleConfig: RoleConfig = {
      version: 1,
      id: parsed.id,
      displayName: parsed.displayName,
      model: parsed.model,
      profile: { summary: parsed.summary },
    };
    const relativePath = `.agents/roles/${parsed.id}/role.yaml`;
    const files: Array<{
      path: string;
      action: "create" | "update" | "delete";
      content: string | null;
    }> = [{ path: relativePath, action: "create", content: `${YAML.stringify(roleConfig)}\n` }];

    // When an active world is supplied AND its world.yaml exists, ATTACH the new
    // role as a member of that world (on-disk world membership is the source of
    // truth for the rail's 成员 list). Idempotent: re-adding an existing member
    // emits no world.yaml op. Absent world / missing manifest → standalone role
    // creation only, exactly as before (no regression).
    const worldAttachment = worldId ? await this.buildWorldAttachment(worldId, parsed.id) : null;
    if (worldAttachment) {
      files.push(worldAttachment);
    }

    const proposal = await this.createProposal({
      // Title stays English; the display layer (localizeProposalTitle) renders
      // it as 创建角色「displayName」(symmetric with world). The summary is
      // emitted in zh directly so the display layer passes it through verbatim
      // (no English残段) inside the zh-CN config patch card.
      title: `Create role ${parsed.displayName}`,
      summary: `为「${parsed.displayName}」创建一个项目角色配置。`,
      riskLevel: "low",
      // Only role.create is needed: attaching a member to an existing world is a
      // role operation, not world creation. Do NOT require world.create.
      requiredCapabilities: ["role.create"],
      files,
    });
    await this.saveProposal(proposal);
    return proposal;
  }

  /**
   * Read the active world's `world.yaml`, append the role to its `roles` list if
   * absent, and return a second `update` file op carrying the merged manifest.
   * Returns null when the world.yaml does not exist or the role is already a
   * member (idempotent re-add). The new entry mirrors proposeWorld's shape:
   * `{ id, model: "default" }`.
   */
  private async buildWorldAttachment(
    worldId: string,
    roleId: string,
  ): Promise<{ path: string; action: "update"; content: string } | null> {
    const relativePath = `.agents/worlds/${worldId}/world.yaml`;
    const existing = await readTextIfExists(this.resolveAgentsPath(relativePath));
    if (existing === null) {
      return null;
    }
    const parsed = YAML.parse(existing) as { roles?: Array<{ id: string; model: string }> };
    const roles = Array.isArray(parsed.roles) ? parsed.roles : [];
    if (roles.some((role) => role.id === roleId)) {
      return null;
    }
    parsed.roles = [...roles, { id: roleId, model: "default" }];
    return { path: relativePath, action: "update", content: `${YAML.stringify(parsed)}\n` };
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
      // Title stays English; the display layer (localizeProposalTitle) renders
      // it as 创建世界「name」. The summary is emitted in zh directly so the
      // display layer passes it through verbatim (no English残段).
      title: `Create world ${parsed.name}`,
      summary: `创建一个${worldModeLabel(parsed.mode)}世界，并附带一个全员房间。`,
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
    assertSafePathSegment(patchId, "patchId");
    const proposalPath = this.proposalPath(patchId);
    const raw = await readFile(proposalPath, "utf8");
    return configPatchProposalSchema.parse(JSON.parse(raw));
  }

  async revise(patchId: string, input: ConfigPatchRevisionInput): Promise<ConfigPatchProposal> {
    const proposal = await this.loadProposal(patchId);
    const revisions = new Map<string, string | null>();
    for (const operation of input.operations) {
      if (revisions.has(operation.path)) {
        throw new Error(`Duplicate config patch revision for ${operation.path}`);
      }
      revisions.set(operation.path, operation.nextContent);
    }

    const proposalPaths = new Set(proposal.operations.map((operation) => operation.path));
    for (const path of revisions.keys()) {
      if (!proposalPaths.has(path)) {
        throw new Error(`Cannot revise unknown config patch path: ${path}`);
      }
    }

    const revised = await this.createProposal({
      title: proposal.title,
      summary: proposal.summary,
      riskLevel: proposal.riskLevel,
      requiredCapabilities: proposal.requiredCapabilities,
      files: proposal.operations.map((operation) => {
        const nextContent = revisions.has(operation.path)
          ? (revisions.get(operation.path) ?? null)
          : operation.nextContent;
        if (operation.action === "delete" && nextContent !== null) {
          throw new Error(`Delete patch content must stay empty: ${operation.path}`);
        }
        if (operation.action !== "delete" && nextContent === null) {
          throw new Error(`Edited patch content is required for ${operation.path}`);
        }
        return {
          action: operation.action,
          content: nextContent,
          path: operation.path,
        };
      }),
    });
    await this.saveProposal(revised);
    return revised;
  }

  async apply(patchId: string, input: ConfigPatchApplyInput = {}): Promise<ConfigPatchApplyResult> {
    const proposal = await this.loadProposal(patchId);
    if (proposal.typedConfirmation && input.confirmation !== proposal.typedConfirmation) {
      throw new Error(`Type ${proposal.typedConfirmation} to apply this high-risk config patch.`);
    }
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
    assertSafePathSegment(historyId, "historyId");
    const manifestPath = path.join(this.historyDir(historyId), "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ConfigHistoryManifest;

    for (const file of manifest.files) {
      const targetPath = this.resolveAgentsPath(file.path);
      if (file.previousContent === null) {
        await rm(targetPath, { force: true });
        await pruneEmptyConfigDirs(path.dirname(targetPath), this.layout.agentsDir);
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

    const id = makeFilesystemId("patch");
    const risk = classifyConfigPatchRisk(operations, input.riskLevel);

    return {
      id,
      title: input.title,
      summary: input.summary,
      riskLevel: risk.level,
      riskReasons: risk.reasons,
      typedConfirmation: risk.level === "high" ? `APPLY ${id}` : null,
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

// zh-CN label for a world mode, used in the proposal summary so the display
// layer renders it verbatim instead of leaving an English残段.
const WORLD_MODE_LABELS: Record<CreateWorldPatchInput["mode"], string> = {
  debate: "辩论",
  workflow: "流程",
  game: "对局",
  simulation: "模拟",
  sandbox: "沙盒",
};

function worldModeLabel(mode: CreateWorldPatchInput["mode"]): string {
  return WORLD_MODE_LABELS[mode] ?? "沙盒";
}

function classifyConfigPatchRisk(
  operations: ConfigPatchProposal["operations"],
  fallback: ConfigPatchProposal["riskLevel"],
): { level: ConfigPatchProposal["riskLevel"]; reasons: string[] } {
  const reasons = new Set<string>();
  let score = riskScore(fallback);

  for (const operation of operations) {
    const normalizedPath = operation.path.replaceAll("\\", "/");
    if (operation.action === "delete") {
      score = Math.max(score, riskScore("high"));
      reasons.add("Deletes config files.");
    }
    if (operation.action === "update") {
      score = Math.max(score, riskScore("medium"));
      reasons.add("Modifies existing config.");
    }
    if (
      normalizedPath === ".agents/config.yaml" ||
      normalizedPath.endsWith("/config.yaml") ||
      normalizedPath.includes("config.local")
    ) {
      score = Math.max(score, riskScore("high"));
      reasons.add("Changes project, provider, or machine-local settings.");
    }
    if (
      normalizedPath.endsWith("/visibility.yaml") ||
      normalizedPath.endsWith("/rules.yaml") ||
      normalizedPath.endsWith("/god.yaml")
    ) {
      score = Math.max(score, riskScore("high"));
      reasons.add("Changes visibility, tool policy, or God permissions.");
    }
    if (normalizedPath.startsWith(".agents/worlds/") && operation.action === "update") {
      score = Math.max(score, riskScore("high"));
      reasons.add("Changes an existing world definition or state seed.");
    }
  }

  if (reasons.size === 0) {
    reasons.add("Creates new config files only.");
  }

  return {
    level: score === 2 ? "high" : score === 1 ? "medium" : "low",
    reasons: [...reasons],
  };
}

function riskScore(level: ConfigPatchProposal["riskLevel"]): number {
  if (level === "high") {
    return 2;
  }
  if (level === "medium") {
    return 1;
  }
  return 0;
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

async function pruneEmptyConfigDirs(startDir: string, agentsDir: string): Promise<void> {
  let currentDir = startDir;
  while (currentDir !== agentsDir && path.dirname(currentDir) !== agentsDir) {
    try {
      await rmdir(currentDir);
    } catch {
      return;
    }
    currentDir = path.dirname(currentDir);
  }
}

function assertSafePathSegment(value: string, label: string): void {
  idSchema.parse(value);
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error(`${label} must be a safe filesystem segment: ${value}`);
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeFilesystemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
