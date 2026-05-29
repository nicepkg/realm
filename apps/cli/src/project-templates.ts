import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type projectLayout, writeYamlFile } from "@realm/config";
import { detectInitLocale, type InitLocale } from "./init-locale.ts";
import { type TemplateStrings, templateStrings } from "./project-template-strings.ts";

type Layout = ReturnType<typeof projectLayout>;

type RoleTemplate = {
  id: string;
  displayName: string;
  summary: string;
  prompt: string;
};

type WorldSkillTemplate = {
  id: string;
  title: string;
  body: string;
};

export const projectTemplateIds = ["cultivation", "software-company"] as const;

export type ProjectTemplateId = (typeof projectTemplateIds)[number];

/**
 * Write a built-in template. Display strings (world / room / role / event
 * names) are seeded in the operator's locale — Chinese under a `zh*` system,
 * English otherwise — while every `id` and `mode.type` enum stays stable and
 * English so config, routing, and i18n keys never shift. The `locale` argument
 * exists for tests; production callers let it auto-detect like the TUI does.
 */
export async function writeTemplate(
  layout: Layout,
  template: string,
  locale: InitLocale = detectInitLocale(),
): Promise<void> {
  const strings = templateStrings(locale);
  if (template === "cultivation") {
    await writeCultivationTemplate(layout, strings);
    return;
  }
  if (template === "software-company") {
    await writeSoftwareCompanyTemplate(layout, strings);
    return;
  }
  throw new Error(`Unknown template: ${template}`);
}

async function writeCultivationTemplate(layout: Layout, strings: TemplateStrings): Promise<void> {
  const worldDir = path.join(layout.worldsDir, "cultivation");
  await mkdir(worldDir, { recursive: true });
  await writeCultivationWorld(worldDir, strings.cultivation);
  await Promise.all(cultivationRoles(strings.cultivation).map((role) => writeRole(layout, role)));
}

async function writeSoftwareCompanyTemplate(
  layout: Layout,
  strings: TemplateStrings,
): Promise<void> {
  const worldDir = path.join(layout.worldsDir, "software-company");
  await mkdir(worldDir, { recursive: true });
  await writeSoftwareCompanyWorld(worldDir, strings.softwareCompany);
  await Promise.all([
    ...softwareCompanyRoles(strings.softwareCompany).map((role) => writeRole(layout, role)),
    ...softwareCompanySkills(strings.softwareCompany).map((skill) =>
      writeWorldSkill(worldDir, skill),
    ),
  ]);
}

async function writeCultivationWorld(
  worldDir: string,
  strings: TemplateStrings["cultivation"],
): Promise<void> {
  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "cultivation",
    name: strings.worldName,
    mode: { type: "game", time: { kind: "manual" } },
    rooms: { main: { type: "world-main", name: strings.roomMain } },
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
        leijun: { name: strings.roles.leijun.displayName, realm: strings.roles.leijun.realm },
        guchenfeng: {
          name: strings.roles.guchenfeng.displayName,
          realm: strings.roles.guchenfeng.realm,
        },
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
  await writeYamlFile(path.join(worldDir, "state.schema.yaml"), baseStateSchema());
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
        title: strings.events["minor-fortune"].title,
        severity: "minor",
        target: "random-role",
      },
    ],
  });
  await writeYamlFile(path.join(worldDir, "god.yaml"), {
    version: 1,
    id: "god",
    role: strings.godRole,
  });
  await writeYamlFile(path.join(worldDir, "roles.yaml"), {
    version: 1,
    roles: [
      { id: "leijun", model: "default" },
      { id: "guchenfeng", model: "default" },
    ],
  });
}

async function writeSoftwareCompanyWorld(
  worldDir: string,
  strings: TemplateStrings["softwareCompany"],
): Promise<void> {
  const roleRefs = softwareCompanyRoles(strings).map((role) => ({ id: role.id, model: "default" }));
  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "software-company",
    name: strings.worldName,
    mode: { type: "workflow", time: { kind: "manual" } },
    rooms: {
      main: { type: "world-main", name: strings.rooms.main },
      triage: { type: "group", name: strings.rooms.triage },
      reviews: { type: "group", name: strings.rooms.reviews },
      god: { type: "god-channel", name: strings.rooms.god },
    },
    roles: roleRefs,
    god: {
      id: "workflow-god",
      model: "default",
      permissions: {
        canPatchWorkflowState: true,
        canCreateReviewEvents: true,
        canRequestHumanApproval: true,
      },
    },
  });
  await writeYamlFile(
    path.join(worldDir, "initial-state.yaml"),
    softwareCompanyInitialState(strings),
  );
  await writeYamlFile(path.join(worldDir, "state.schema.yaml"), baseStateSchema());
  await writeYamlFile(path.join(worldDir, "visibility.yaml"), {
    version: 1,
    roles: {
      canRead: [
        "/publicState",
        "/privateState/roles/{roleId}",
        "/derivedState",
        "/metaState/workflow",
      ],
      cannotRead: ["/hiddenState", "/privateState/roles/{otherRoleId}"],
    },
    god: { canRead: ["/"], canPatch: ["/"] },
    owner: { canRead: ["/"], canPatch: ["/"] },
  });
  await writeYamlFile(path.join(worldDir, "rules.yaml"), {
    version: 1,
    workflow: {
      artifactLifecycle: ["draft", "review", "approved", "implemented", "verified"],
      taskLifecycle: ["todo", "in-progress", "blocked", "done"],
      reviewLifecycle: ["requested", "changes-requested", "approved"],
      requireExpectedVersionForStatePatches: true,
    },
    tools: {
      include: [
        "message.send",
        "room.create",
        "turn.run",
        "state.query",
        "state.patch.propose",
        "memory.read",
        "memory.write",
        "trace.read",
        "config.read",
        "fs.private.read",
        "fs.private.write",
        "fs.private.list",
        "fs.project.read",
      ],
      requireApproval: ["fs.project.write", "shell.run", "network.fetch", "config.write"],
      denyByDefault: ["fs.project.write", "shell.run", "network.fetch"],
    },
  });
  await writeYamlFile(path.join(worldDir, "events.yaml"), {
    version: 1,
    workflowEvents: [
      {
        id: "scope-change",
        title: strings.events["scope-change"].title,
        severity: "medium",
        target: "current-task",
      },
      {
        id: "test-failure",
        title: strings.events["test-failure"].title,
        severity: "high",
        target: "implementation",
      },
      {
        id: "release-risk",
        title: strings.events["release-risk"].title,
        severity: "high",
        target: "release",
      },
    ],
  });
  await writeYamlFile(path.join(worldDir, "god.yaml"), {
    version: 1,
    id: "workflow-god",
    role: strings.godRole,
  });
  await writeYamlFile(path.join(worldDir, "roles.yaml"), { version: 1, roles: roleRefs });
}

async function writeRole(layout: Layout, input: RoleTemplate): Promise<void> {
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

async function writeWorldSkill(worldDir: string, input: WorldSkillTemplate): Promise<void> {
  const skillDir = path.join(worldDir, "skills", input.id);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [`# ${input.title}`, "", input.body, ""].join("\n"),
    "utf8",
  );
}

function baseStateSchema(): Record<string, unknown> {
  return {
    version: 1,
    schema: {
      publicState: { type: "object" },
      privateState: { type: "object" },
      hiddenState: { type: "object" },
      derivedState: { type: "object" },
      metaState: { type: "object" },
    },
  };
}

function softwareCompanyInitialState(
  strings: TemplateStrings["softwareCompany"],
): Record<string, unknown> {
  const roles = softwareCompanyRoles(strings);
  return {
    publicState: {
      project: {
        phase: "planning",
        objective: strings.objective,
      },
      artifacts: [],
      tasks: [],
      reviews: [],
      approvals: [],
      risks: [],
      roles: Object.fromEntries(
        roles.map((role) => [
          role.id,
          { name: role.displayName, status: "available", currentTask: null },
        ]),
      ),
    },
    privateState: {
      roles: Object.fromEntries(roles.map((role) => [role.id, { workingNotes: [], concerns: [] }])),
    },
    hiddenState: {
      ownerNotes: [],
      suppressedRisks: [],
    },
    derivedState: {
      openTaskCount: 0,
      pendingReviewCount: 0,
      approvedArtifactCount: 0,
    },
    metaState: {
      workflow: {
        currentSprint: "p7-development-workflow",
        approvalRequiredFor: ["fs.project.write", "shell.run", "network.fetch", "config.write"],
      },
      roles: Object.fromEntries(roles.map((role) => [role.id, { alive: true, muted: false }])),
    },
  };
}

/** Stable role id order for the cultivation template. */
const CULTIVATION_ROLE_IDS = ["leijun", "guchenfeng"] as const;

/** Stable role id order for the software-company template. */
const SOFTWARE_COMPANY_ROLE_IDS = [
  "product-manager",
  "architect",
  "engineer",
  "qa",
  "test-expert",
  "security-reviewer",
  "doc-writer",
  "release-manager",
] as const;

/** Stable world-skill id order for the software-company template. */
const SOFTWARE_COMPANY_SKILL_IDS = ["artifact-template", "review-checklist"] as const;

/**
 * Build the cultivation role templates for a locale. Ids stay English/stable;
 * only the display name / summary / prompt come from the localized table.
 */
function cultivationRoles(strings: TemplateStrings["cultivation"]): RoleTemplate[] {
  return CULTIVATION_ROLE_IDS.map((id) => {
    const role = strings.roles[id];
    return { id, displayName: role.displayName, summary: role.summary, prompt: role.prompt };
  });
}

/** Build the software-company role templates for a locale (ids stable). */
function softwareCompanyRoles(strings: TemplateStrings["softwareCompany"]): RoleTemplate[] {
  return SOFTWARE_COMPANY_ROLE_IDS.map((id) => {
    const role = strings.roles[id];
    return { id, displayName: role.displayName, summary: role.summary, prompt: role.prompt };
  });
}

/** Build the software-company world skills for a locale (ids stable). */
function softwareCompanySkills(strings: TemplateStrings["softwareCompany"]): WorldSkillTemplate[] {
  return SOFTWARE_COMPANY_SKILL_IDS.map((id) => {
    const skill = strings.skills[id];
    return { id, title: skill.title, body: skill.body };
  });
}
