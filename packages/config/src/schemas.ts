import { roleAvatarSchema } from "@realm/core";
import { z } from "zod";

export const skillPolicySchema = z.object({
  mode: z.enum(["allowlist", "blacklist"]).default("blacklist"),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
});

export type SkillPolicy = z.infer<typeof skillPolicySchema>;

export const projectConfigSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string().min(1),
  }),
  defaults: z.object({
    world: z.string().min(1),
    modelProfile: z.string().min(1),
  }),
  skills: z
    .object({
      global: skillPolicySchema.optional(),
      project: skillPolicySchema.optional(),
    })
    .default({}),
  security: z.object({
    requireTrust: z.boolean(),
    allowProjectShellByDefault: z.boolean(),
    allowNetworkByDefault: z.boolean(),
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const modelProviderConfigSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
  apiKeyEnv: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
});

export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;

const defaultModelProviders: ModelProviderConfig[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-5",
    enabled: true,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4.6",
    enabled: true,
  },
  {
    id: "google",
    displayName: "Google",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    enabled: true,
  },
];

export const userConfigSchema = z.object({
  version: z.literal(1),
  defaultProvider: z.string().min(1).default("openai"),
  defaultModel: z.string().min(1).default("gpt-5"),
  providers: z.array(modelProviderConfigSchema).default(defaultModelProviders),
  web: z
    .object({
      host: z.string().default("127.0.0.1"),
      preferredPort: z.number().int().positive().default(3737),
      openBrowser: z.boolean().default(true),
    })
    .default({ host: "127.0.0.1", preferredPort: 3737, openBrowser: true }),
});

export type UserConfig = z.infer<typeof userConfigSchema>;

export function defaultUserConfig(): UserConfig {
  return userConfigSchema.parse({ version: 1 });
}

export const skillScopeSchema = z.enum([
  "role-prompt",
  "role-private",
  "world",
  "project",
  "global",
]);

export type SkillScope = z.infer<typeof skillScopeSchema>;

export const skillSourceSchema = z.enum(["project", "global", "role-private", "world"]);

export type SkillSource = z.infer<typeof skillSourceSchema>;

export type SkillIdentity = {
  id: string;
  name: string;
  scope: SkillScope;
  source: SkillSource;
  roleId?: string;
  worldId?: string;
  path: string;
  relativePath: string;
  contentHash: string;
};

export type LoadedSkill = SkillIdentity & {
  skillFilePath: string;
  content: string;
};

export const roomConfigSchema = z.object({
  type: z.enum(["world-main", "group", "dm", "god-channel", "system"]),
  name: z.string().min(1),
});

export type RoomConfig = z.infer<typeof roomConfigSchema>;

export const worldConfigSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.object({
    type: z.enum(["debate", "workflow", "game", "simulation", "sandbox"]),
    time: z.object({
      kind: z.enum(["manual", "tick", "realtime"]),
    }),
  }),
  rooms: z.record(z.string(), roomConfigSchema),
  roles: z.array(z.object({ id: z.string().min(1), model: z.string().min(1) })),
  god: z
    .object({
      id: z.string().min(1),
      model: z.string().min(1),
      permissions: z.record(z.string(), z.boolean()).default({}),
    })
    .optional(),
});

export type WorldConfig = z.infer<typeof worldConfigSchema>;

export const roleConfigSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  displayName: z.string().min(1),
  model: z.string().min(1),
  avatar: roleAvatarSchema.optional(),
  profile: z
    .object({
      summary: z.string().default(""),
    })
    .default({ summary: "" }),
  rolePrompt: z
    .object({
      skill: z.string().min(1),
      source: skillSourceSchema,
    })
    .optional(),
});

export type RoleConfig = z.infer<typeof roleConfigSchema>;

export const createRolePatchInputSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  model: z.string().min(1).default("default"),
  summary: z.string().default(""),
});

export type CreateRolePatchInput = z.infer<typeof createRolePatchInputSchema>;

export const createWorldPatchInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["debate", "workflow", "game", "simulation", "sandbox"]).default("sandbox"),
  roomName: z.string().min(1).default("All Hands"),
  roleIds: z.array(z.string().min(1)).default([]),
});

export type CreateWorldPatchInput = z.infer<typeof createWorldPatchInputSchema>;

export function defaultProjectConfig(name: string): ProjectConfig {
  return {
    version: 1,
    project: { name },
    defaults: {
      world: "cultivation",
      modelProfile: "default",
    },
    skills: {
      global: { mode: "blacklist", include: ["~/.realm/skills/**"], exclude: [] },
      project: { mode: "blacklist", include: [".agents/skills/**"], exclude: [] },
    },
    security: {
      requireTrust: true,
      allowProjectShellByDefault: false,
      allowNetworkByDefault: false,
    },
  };
}
