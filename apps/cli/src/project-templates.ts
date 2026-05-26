import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type projectLayout, writeYamlFile } from "@realm/config";

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

export async function writeTemplate(layout: Layout, template: string): Promise<void> {
  if (template === "cultivation") {
    await writeCultivationTemplate(layout);
    return;
  }
  if (template === "software-company") {
    await writeSoftwareCompanyTemplate(layout);
    return;
  }
  throw new Error(`Unknown template: ${template}`);
}

async function writeCultivationTemplate(layout: Layout): Promise<void> {
  const worldDir = path.join(layout.worldsDir, "cultivation");
  await mkdir(worldDir, { recursive: true });
  await writeCultivationWorld(worldDir);
  await Promise.all(cultivationRoles.map((role) => writeRole(layout, role)));
}

async function writeSoftwareCompanyTemplate(layout: Layout): Promise<void> {
  const worldDir = path.join(layout.worldsDir, "software-company");
  await mkdir(worldDir, { recursive: true });
  await writeSoftwareCompanyWorld(worldDir);
  await Promise.all([
    ...softwareCompanyRoles.map((role) => writeRole(layout, role)),
    ...softwareCompanySkills.map((skill) => writeWorldSkill(worldDir, skill)),
  ]);
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

async function writeSoftwareCompanyWorld(worldDir: string): Promise<void> {
  const roleRefs = softwareCompanyRoles.map((role) => ({ id: role.id, model: "default" }));
  await writeYamlFile(path.join(worldDir, "world.yaml"), {
    version: 1,
    id: "software-company",
    name: "Software Company",
    mode: { type: "workflow", time: { kind: "manual" } },
    rooms: {
      main: { type: "world-main", name: "All Hands" },
      triage: { type: "group", name: "Triage" },
      reviews: { type: "group", name: "Review Room" },
      god: { type: "god-channel", name: "God / Workflow Judge" },
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
  await writeYamlFile(path.join(worldDir, "initial-state.yaml"), softwareCompanyInitialState());
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
      { id: "scope-change", title: "Scope Change", severity: "medium", target: "current-task" },
      { id: "test-failure", title: "Test Failure", severity: "high", target: "implementation" },
      { id: "release-risk", title: "Release Risk", severity: "high", target: "release" },
    ],
  });
  await writeYamlFile(path.join(worldDir, "god.yaml"), {
    version: 1,
    id: "workflow-god",
    role: [
      "Adjudicate workflow state without doing implementation work directly.",
      "Track tasks, artifacts, reviews, approvals, and risks through structured patches.",
      "Require explicit owner approval before project writes, shell commands, or risky tool use.",
    ],
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

function softwareCompanyInitialState(): Record<string, unknown> {
  return {
    publicState: {
      project: {
        phase: "planning",
        objective: "Discuss, implement, review, verify, and document project changes.",
      },
      artifacts: [],
      tasks: [],
      reviews: [],
      approvals: [],
      risks: [],
      roles: Object.fromEntries(
        softwareCompanyRoles.map((role) => [
          role.id,
          { name: role.displayName, status: "available", currentTask: null },
        ]),
      ),
    },
    privateState: {
      roles: Object.fromEntries(
        softwareCompanyRoles.map((role) => [role.id, { workingNotes: [], concerns: [] }]),
      ),
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
      roles: Object.fromEntries(
        softwareCompanyRoles.map((role) => [role.id, { alive: true, muted: false }]),
      ),
    },
  };
}

const cultivationRoles: RoleTemplate[] = [
  {
    id: "leijun",
    displayName: "Lei Jun",
    summary: "Founder mindset with product, operations, marketing, and engineering instincts.",
    prompt:
      "Think like Lei Jun: practical product judgment, long-term patience, operational discipline, and user-first communication. Avoid empty slogans; ground advice in tradeoffs and execution.",
  },
  {
    id: "guchenfeng",
    displayName: "Gu Chenfeng",
    summary: "A resilient cultivation-world protagonist who learns through pressure and risk.",
    prompt:
      "Think like Gu Chenfeng: resilient, observant, willing to take calculated risks, and honest about fear. Treat setbacks as material for growth, not as excuses.",
  },
];

const softwareCompanyRoles: RoleTemplate[] = [
  {
    id: "product-manager",
    displayName: "Product Manager",
    summary: "Clarifies user goals, scope, acceptance criteria, and tradeoffs.",
    prompt:
      "Act as a pragmatic product manager. Convert vague requests into concrete outcomes, user journeys, constraints, acceptance criteria, and release tradeoffs. Keep scope honest and call out missing decisions.",
  },
  {
    id: "architect",
    displayName: "Architect",
    summary: "Designs maintainable architecture boundaries and integration contracts.",
    prompt:
      "Act as a senior software architect. Protect cohesion, dependency direction, runtime boundaries, extension points, and migration paths. Prefer explicit interfaces over hidden coupling.",
  },
  {
    id: "engineer",
    displayName: "Engineer",
    summary: "Implements small, testable, maintainable changes.",
    prompt:
      "Act as a senior implementation engineer. Favor small vertical slices, readable names, focused modules, and tests that prove behavior. Never hide risk behind vague implementation notes.",
  },
  {
    id: "qa",
    displayName: "QA",
    summary: "Finds edge cases, broken flows, and acceptance gaps.",
    prompt:
      "Act as a QA specialist. Think in workflows, regressions, edge cases, data loss, recovery, accessibility, and cross-platform behavior. Ask how a real user would break the change.",
  },
  {
    id: "test-expert",
    displayName: "Test Expert",
    summary: "Designs unit, integration, smoke, and manual verification strategy.",
    prompt:
      "Act as a test strategy expert. Separate unit, integration, end-to-end, smoke, and manual checks. Tie every important requirement to evidence that would prove it.",
  },
  {
    id: "security-reviewer",
    displayName: "Security Reviewer",
    summary: "Reviews trust boundaries, secrets, tool access, and unsafe defaults.",
    prompt:
      "Act as a security reviewer. Focus on secrets, policy bypass, prompt/tool injection, path traversal, shell/network access, auditability, and unsafe defaults. Recommend narrow mitigations.",
  },
  {
    id: "doc-writer",
    displayName: "Doc Writer",
    summary: "Turns behavior into clear docs, examples, and release notes.",
    prompt:
      "Act as a technical documentation writer. Explain the user path first, then concepts, then reference details. Keep docs accurate, concrete, and easy to scan.",
  },
  {
    id: "release-manager",
    displayName: "Release Manager",
    summary: "Coordinates verification, changelog, packaging, and release readiness.",
    prompt:
      "Act as a release manager. Track readiness, test evidence, known risks, rollback options, packaging, versioning, and whether the release can be shipped responsibly.",
  },
];

const softwareCompanySkills: WorldSkillTemplate[] = [
  {
    id: "artifact-template",
    title: "Artifact Template",
    body: [
      "Use this skill when drafting a spec, task brief, review request, or release note.",
      "Always include: context, decision, constraints, acceptance evidence, risks, and owner.",
      "Keep artifacts short enough to be reviewed in chat, then expand only when needed.",
    ].join("\n"),
  },
  {
    id: "review-checklist",
    title: "Review Checklist",
    body: [
      "Use this skill when reviewing a proposed implementation or plan.",
      "Check: requirement fit, boundary quality, DRY/SOLID, cross-platform behavior, tests, docs, rollback, and observability.",
      "Separate blocking issues from follow-up improvements.",
    ].join("\n"),
  },
];
