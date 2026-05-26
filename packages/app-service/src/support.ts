import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const OWNER_ID = "owner";

export const DEFAULT_ALLOWED_CAPABILITIES = [
  "message.send",
  "room.create",
  "turn.run",
  "role.impersonate",
  "config.read",
  "role.create",
  "world.create",
  "state.query",
  "state.patch.propose",
  "state.patch.admin",
  "god.admin",
  "memory.read",
  "memory.write",
  "trace.read",
] as const;

export function assertSafePathSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) {
    throw new Error(`${label} is not a safe Realm identifier: ${value}`);
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function humanizeId(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function readJsonPointer(target: unknown, pointer: string): unknown {
  if (pointer === "") {
    return target;
  }
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: ${pointer}`);
  }
  let current = target;
  for (const part of pointer
    .slice(1)
    .split("/")
    .map((value) => value.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

export async function resolvePiExtensionPaths(configuredPath?: string): Promise<string[]> {
  if (configuredPath) {
    return [configuredPath];
  }

  const defaultPath = fileURLToPath(new URL("../../pi-extension/src/index.ts", import.meta.url));
  return (await pathExists(defaultPath)) ? [defaultPath] : [];
}
