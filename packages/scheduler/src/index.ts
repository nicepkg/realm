import type { StatePatchOperation } from "@realm/core";

export type RandomNaturalEventInput = {
  worldId: string;
  roleIds: string[];
  seed?: string | number;
};

export type RandomNaturalEventPlan = {
  title: string;
  description: string;
  severity: "minor" | "major" | "critical";
  targetRoleIds: string[];
  operations: StatePatchOperation[];
};

type NaturalEventTemplate = (input: {
  roleId: string | undefined;
  seedHash: number;
}) => RandomNaturalEventPlan;

const templates: [NaturalEventTemplate, ...NaturalEventTemplate[]] = [
  ({ roleId }) => ({
    title: "Unexpected Windfall",
    description: roleId
      ? `${roleId} receives a temporary opportunity.`
      : "The world receives a temporary opportunity.",
    severity: "minor",
    targetRoleIds: roleId ? [roleId] : [],
    operations: roleId
      ? [
          {
            op: "set",
            path: `/privateState/roles/${escapePointer(roleId)}/fortune`,
            value: "windfall",
          },
        ]
      : [{ op: "set", path: "/publicState/worldEvent", value: "windfall" }],
  }),
  ({ roleId }) => ({
    title: "Training Accident",
    description: roleId
      ? `${roleId} suffers a setback and needs recovery.`
      : "A setback affects the whole world.",
    severity: "major",
    targetRoleIds: roleId ? [roleId] : [],
    operations: roleId
      ? [
          {
            op: "set",
            path: `/privateState/roles/${escapePointer(roleId)}/condition`,
            value: "injured",
          },
        ]
      : [{ op: "set", path: "/publicState/worldEvent", value: "setback" }],
  }),
  () => ({
    title: "Sudden Storm",
    description: "The environment shifts and everyone must adapt.",
    severity: "minor",
    targetRoleIds: [],
    operations: [{ op: "set", path: "/publicState/weather", value: "storm" }],
  }),
];

export function buildRandomNaturalEvent(input: RandomNaturalEventInput): RandomNaturalEventPlan {
  const seedHash = hashSeed(input.seed ?? `${Date.now()}:${Math.random()}`);
  const template = templates[seedHash % templates.length] ?? templates[0];
  const roleId =
    input.roleIds.length > 0 ? input.roleIds[seedHash % input.roleIds.length] : undefined;
  return template({ roleId, seedHash });
}

function hashSeed(seed: string | number): number {
  const value = String(seed);
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
