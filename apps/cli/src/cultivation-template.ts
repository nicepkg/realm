import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type projectLayout, writeYamlFile } from "@realm/config";

export async function writeTemplate(
  layout: ReturnType<typeof projectLayout>,
  template: string,
): Promise<void> {
  if (template !== "cultivation") {
    throw new Error(`Unknown template: ${template}`);
  }

  const worldDir = path.join(layout.worldsDir, "cultivation");
  await mkdir(worldDir, { recursive: true });
  await writeCultivationWorld(worldDir);
  await writeCultivationRole(layout, {
    id: "leijun",
    displayName: "Lei Jun",
    summary: "Founder mindset with product, operations, marketing, and engineering instincts.",
    prompt:
      "Think like Lei Jun: practical product judgment, long-term patience, operational discipline, and user-first communication. Avoid empty slogans; ground advice in tradeoffs and execution.",
  });
  await writeCultivationRole(layout, {
    id: "guchenfeng",
    displayName: "Gu Chenfeng",
    summary: "A resilient cultivation-world protagonist who learns through pressure and risk.",
    prompt:
      "Think like Gu Chenfeng: resilient, observant, willing to take calculated risks, and honest about fear. Treat setbacks as material for growth, not as excuses.",
  });
}

async function writeCultivationWorld(worldDir: string): Promise<void> {
  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "cultivation",
    name: "Cultivation Demo",
    mode: { type: "game", time: { kind: "manual" } },
    rooms: { main: { type: "world-main", name: "All Hands" } },
    roles: [
      { id: "leijun", model: "default" },
      { id: "guchenfeng", model: "default" },
    ],
    god: {
      id: "god",
      model: "default",
      permissions: {
        canPatchAnyState: true,
        canKillRole: true,
        canCreateEvents: true,
      },
    },
  });
  await writeYamlFile(path.join(worldDir, "initial-state.yaml"), {
    publicState: {
      roles: {
        leijun: { name: "Lei Jun", realm: "Qi Refining 7" },
        guchenfeng: { name: "Gu Chenfeng", realm: "Qi Refining 5" },
      },
    },
    privateState: {},
    hiddenState: {},
    derivedState: {},
    metaState: {
      roles: {
        leijun: { alive: true, muted: false },
        guchenfeng: { alive: true, muted: false },
      },
    },
  });
  await writeYamlFile(path.join(worldDir, "state.schema.yaml"), {
    version: 1,
    schema: {
      publicState: { type: "object" },
      privateState: { type: "object" },
      hiddenState: { type: "object" },
      derivedState: { type: "object" },
      metaState: { type: "object" },
    },
  });
  await writeYamlFile(path.join(worldDir, "visibility.yaml"), {
    version: 1,
    roles: {
      canRead: ["/publicState", "/privateState/roles/{roleId}", "/metaState/roles/{roleId}"],
      cannotRead: ["/hiddenState"],
    },
    god: { canRead: ["/"], canPatch: ["/"] },
  });
  await writeYamlFile(path.join(worldDir, "rules.yaml"), {
    version: 1,
    actions: {
      allowGodRoleActions: ["kill", "mute", "revive"],
      requireExpectedVersionForStatePatches: true,
    },
  });
  await writeYamlFile(path.join(worldDir, "events.yaml"), {
    version: 1,
    naturalEvents: [
      {
        id: "minor-fortune",
        title: "Minor Fortune",
        severity: "minor",
        target: "random-role",
      },
    ],
  });
  await writeYamlFile(path.join(worldDir, "god.yaml"), {
    version: 1,
    id: "god",
    role: "World arbiter responsible for state patches, natural events, and rule enforcement.",
  });
  await writeYamlFile(path.join(worldDir, "roles.yaml"), {
    version: 1,
    roles: [
      { id: "leijun", model: "default" },
      { id: "guchenfeng", model: "default" },
    ],
  });
}

async function writeCultivationRole(
  layout: ReturnType<typeof projectLayout>,
  input: { id: string; displayName: string; summary: string; prompt: string },
): Promise<void> {
  const roleDir = path.join(layout.rolesDir, input.id);
  const skillDir = path.join(roleDir, "skills", input.id);
  await mkdir(skillDir, { recursive: true });
  await writeYamlFile(path.join(roleDir, "role.yaml"), {
    version: 1,
    id: input.id,
    displayName: input.displayName,
    model: "default",
    profile: { summary: input.summary },
    rolePrompt: { skill: input.id, source: "role-private" },
  });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [`# ${input.displayName}`, "", input.prompt, ""].join("\n"),
    "utf8",
  );
}
