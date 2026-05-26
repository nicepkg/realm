import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { PiAllowedSkill, PiSessionStartInput } from "./types.ts";

export function buildRealmAgentTools(input: PiSessionStartInput): AgentTool[] {
  const baseUrl = input.env?.REALM_EXTENSION_BASE_URL ?? "http://127.0.0.1:3737";
  const token = input.env?.REALM_EXTENSION_TOKEN;
  const worldId = input.env?.REALM_EXTENSION_WORLD_ID ?? input.worldId;
  const roleId = input.env?.REALM_EXTENSION_ROLE_ID ?? input.roleId;

  const tools: AgentTool[] = [
    {
      name: "realm_state_query",
      label: "Realm State Query",
      description: "Query visible Realm state for the current role.",
      parameters: Type.Object({
        path: Type.Optional(Type.String({ description: "Optional JSON Pointer path." })),
      }),
      async execute(toolCallId, params, signal) {
        const args = params as { path?: unknown };
        const payload = await postJson(
          baseUrl,
          "/api/extension/state-query",
          {
            toolCallId,
            worldId,
            roleId,
            path: typeof args.path === "string" ? args.path : undefined,
          },
          token,
          signal,
        );
        return textResult(JSON.stringify(payload.state, null, 2), payload);
      },
    },
    {
      name: "realm_memory_read",
      label: "Realm Memory Read",
      description: "Read the current role's private Realm memory.",
      parameters: Type.Object({}),
      async execute(toolCallId, _params, signal) {
        const payload = await postJson(
          baseUrl,
          "/api/extension/memory-read",
          { toolCallId, worldId, roleId },
          token,
          signal,
        );
        return textResult(String(payload.content ?? ""), payload);
      },
    },
    {
      name: "realm_memory_write",
      label: "Realm Memory Write",
      description: "Replace the current role's private Realm memory.",
      parameters: Type.Object({
        content: Type.String({ description: "Complete memory content to store." }),
      }),
      async execute(toolCallId, params, signal) {
        const args = params as { content?: unknown };
        const payload = await postJson(
          baseUrl,
          "/api/extension/memory-write",
          {
            toolCallId,
            worldId,
            roleId,
            content: requireString(args.content, "content"),
          },
          token,
          signal,
        );
        return textResult(`Memory written (${payload.bytes ?? 0} bytes).`, payload);
      },
    },
  ];

  const allowedSkills = input.allowedSkills ?? skillsFromPaths(input.allowedSkillPaths);
  if (allowedSkills.length > 0) {
    tools.push(buildSkillReadTool(allowedSkills));
  }

  return tools;
}

function buildSkillReadTool(allowedSkills: PiAllowedSkill[]): AgentTool {
  const index = indexAllowedSkills(allowedSkills);
  return {
    name: "realm_skill_read",
    label: "Realm Skill Read",
    description: "Read one callable Realm skill that is explicitly available to this role.",
    parameters: Type.Object({
      name: Type.String({ description: "Callable skill id (`scope:name`) or unique skill name." }),
    }),
    async execute(_toolCallId, params, signal) {
      const args = params as { name?: unknown };
      const requestedSkill = requireString(args.name, "name");
      const skill = resolveAllowedSkill(index, requestedSkill);
      if (!skill) {
        throw new Error(`Skill is not available to this role: ${requestedSkill}`);
      }
      if (signal?.aborted) {
        throw new Error("Skill read aborted");
      }
      const content = await readFile(path.join(skill.path, "SKILL.md"), "utf8");
      return textResult([`# Callable skill: ${skill.id}`, "", content.trim()].join("\n"), {
        id: skill.id,
        name: skill.name,
        scope: skill.scope,
        ...(skill.contentHash ? { contentHash: skill.contentHash } : {}),
      });
    },
  };
}

type SkillIndex = {
  byId: Map<string, PiAllowedSkill>;
  byName: Map<string, PiAllowedSkill | "ambiguous">;
};

function skillsFromPaths(allowedSkillPaths: string[]): PiAllowedSkill[] {
  const skills: PiAllowedSkill[] = [];
  for (const skillPath of allowedSkillPaths) {
    const resolvedPath = path.resolve(skillPath);
    const skillName = path.basename(resolvedPath);
    skills.push({
      id: skillName,
      name: skillName,
      scope: "path",
      path: resolvedPath,
    });
  }
  return skills;
}

function indexAllowedSkills(allowedSkills: PiAllowedSkill[]): SkillIndex {
  const byId = new Map<string, PiAllowedSkill>();
  const byName = new Map<string, PiAllowedSkill | "ambiguous">();
  for (const skill of allowedSkills) {
    const resolvedSkill = { ...skill, path: path.resolve(skill.path) };
    if (!byId.has(resolvedSkill.id)) {
      byId.set(resolvedSkill.id, resolvedSkill);
    }
    const existing = byName.get(resolvedSkill.name);
    if (!existing) {
      byName.set(resolvedSkill.name, resolvedSkill);
    } else if (existing !== "ambiguous" && existing.id !== resolvedSkill.id) {
      byName.set(resolvedSkill.name, "ambiguous");
    }
  }
  return { byId, byName };
}

function resolveAllowedSkill(
  index: SkillIndex,
  requestedSkill: string,
): PiAllowedSkill | undefined {
  const byId = index.byId.get(requestedSkill);
  if (byId) {
    return byId;
  }
  const byName = index.byName.get(requestedSkill);
  if (byName === "ambiguous") {
    throw new Error(`Skill name is ambiguous; use a scoped skill id: ${requestedSkill}`);
  }
  return byName;
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  token: string | undefined,
  signal: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

function textResult(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function readErrorMessage(payload: Record<string, unknown>, status: number): string {
  const error = payload.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return `Realm tool request failed with ${status}`;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}
