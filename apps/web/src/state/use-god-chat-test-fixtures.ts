import type { ConfigPatchProposal, Message, RoleSummary } from "@realm/api-contract";
import type { GodChatContext, StagedConfig } from "@/state/god-chat-model.ts";

/**
 * Shared fixtures for the god-chat controller contract tests. The routing/answer
 * suites (`use-god-chat.test.ts`) and the hook-branch suites (`use-god-chat-hook.test.ts`)
 * both build the same two-role world, so the builders live here once.
 */

export const roles: RoleSummary[] = [
  { displayName: "顾辰风", id: "guchenfeng", model: "default", source: "config" },
  { displayName: "云遥", id: "yunyao", model: "default", source: "config" },
];

export function context(overrides: Partial<GodChatContext> = {}): GodChatContext {
  return {
    roles,
    roomId: "main",
    rooms: [{ id: "main" }],
    worldId: "cultivation",
    worldState: { state: { qi: 100, season: "spring" }, version: 3 },
    ...overrides,
  };
}

export function msg(id: string, authorId: string, roomId: string, content: string): Message {
  return {
    authorId,
    content,
    createdAt: new Date().toISOString(),
    displayedAuthorId: authorId,
    id,
    roomId,
    worldId: "cultivation",
  };
}

export function operation(
  action: "create" | "update" | "delete",
  path: string,
): ConfigPatchProposal["operations"][number] {
  return { action, nextContent: null, nextHash: null, path, previousHash: null };
}

export function stagedWorld(
  goal: string,
  operations: ConfigPatchProposal["operations"],
): StagedConfig {
  return {
    goal,
    kind: "config",
    proposal: {
      createdAt: new Date().toISOString(),
      id: "patch-1",
      operations,
      requiredCapabilities: ["world.create"],
      riskLevel: "low",
      riskReasons: [],
      summary: "创建一个游戏世界。",
      title: "Create world 修真世界",
      typedConfirmation: null,
    },
  };
}
