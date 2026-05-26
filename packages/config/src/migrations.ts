import {
  defaultProjectConfig,
  defaultUserConfig,
  type ProjectConfig,
  projectConfigSchema,
  type UserConfig,
  userConfigSchema,
} from "./schemas.ts";

type PlainRecord = Record<string, unknown>;

export class UnsupportedConfigVersionError extends Error {
  constructor(scope: "project" | "user", version: unknown) {
    super(`Unsupported ${scope} config version: ${String(version)}`);
    this.name = "UnsupportedConfigVersionError";
  }
}

export function parseProjectConfig(value: unknown, fallbackName: string): ProjectConfig {
  const version = readVersion(value);
  if (version === 1) {
    return projectConfigSchema.parse(value);
  }
  if (version === undefined || version === 0) {
    const name = readProjectName(value) ?? fallbackName;
    return projectConfigSchema.parse(
      mergeRecords(defaultProjectConfig(name), value, { version: 1 }),
    );
  }
  throw new UnsupportedConfigVersionError("project", version);
}

export function parseUserConfig(value: unknown): UserConfig {
  const version = readVersion(value);
  if (version === 1) {
    return userConfigSchema.parse(value);
  }
  if (version === undefined || version === 0) {
    return userConfigSchema.parse(mergeRecords(defaultUserConfig(), value, { version: 1 }));
  }
  throw new UnsupportedConfigVersionError("user", version);
}

function readVersion(value: unknown): number | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  return typeof value.version === "number" ? value.version : undefined;
}

function readProjectName(value: unknown): string | undefined {
  if (!isPlainRecord(value) || !isPlainRecord(value.project)) {
    return undefined;
  }
  return typeof value.project.name === "string" ? value.project.name : undefined;
}

function mergeRecords(...records: unknown[]): PlainRecord {
  const merged: PlainRecord = {};
  for (const record of records) {
    if (!isPlainRecord(record)) {
      continue;
    }
    for (const [key, value] of Object.entries(record)) {
      const current = merged[key];
      merged[key] =
        isPlainRecord(current) && isPlainRecord(value) ? mergeRecords(current, value) : value;
    }
  }
  return merged;
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
