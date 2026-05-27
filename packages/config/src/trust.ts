import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { userConfigDir } from "./layout.ts";

export const projectTrustTierSchema = z.enum(["read-only", "run-roles", "elevated-tools"]);

export type ProjectTrustTier = z.infer<typeof projectTrustTierSchema>;

export type ProjectTrustRecord = {
  root: string;
  tier: ProjectTrustTier;
  trustedAt: string;
};

const trustStoreSchema = z.object({
  version: z.literal(1),
  projects: z.record(
    z.string(),
    z.object({
      root: z.string().min(1),
      tier: projectTrustTierSchema,
      trustedAt: z.string().datetime({ offset: true }),
    }),
  ),
});

type TrustStore = z.infer<typeof trustStoreSchema>;

export async function readProjectTrust(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProjectTrustRecord | undefined> {
  const store = await loadTrustStore(env);
  return store.projects[projectTrustKey(root)];
}

export async function trustProject(
  root: string,
  tier: ProjectTrustTier,
  env: NodeJS.ProcessEnv = process.env,
  clock: () => Date = () => new Date(),
): Promise<ProjectTrustRecord> {
  projectTrustTierSchema.parse(tier);
  const store = await loadTrustStore(env);
  const record: ProjectTrustRecord = {
    root: path.resolve(root),
    tier,
    trustedAt: clock().toISOString(),
  };
  store.projects[projectTrustKey(root)] = record;
  await saveTrustStore(store, env);
  return record;
}

export function trustStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(userConfigDir(env), "trust.json");
}

function projectTrustKey(root: string): string {
  return path.resolve(root);
}

async function loadTrustStore(env: NodeJS.ProcessEnv): Promise<TrustStore> {
  try {
    const raw = await readFile(trustStorePath(env), "utf8");
    return trustStoreSchema.parse(JSON.parse(raw));
  } catch {
    return { version: 1, projects: {} };
  }
}

async function saveTrustStore(store: TrustStore, env: NodeJS.ProcessEnv): Promise<void> {
  const filePath = trustStorePath(env);
  await writeFileAtomic(filePath, `${JSON.stringify(store, null, 2)}\n`);
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
