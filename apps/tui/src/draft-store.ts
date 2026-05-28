import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type TuiDraftRecord = {
  content: string;
  createdAt: string;
  error: string;
  id: string;
  identity: string;
  roomId: string;
  roomName: string;
  worldId: string;
  worldName: string;
};

export type SavedTuiDraft = {
  filePath: string;
  record: TuiDraftRecord;
};

export async function saveFailedDraft(
  input: Omit<TuiDraftRecord, "createdAt" | "id">,
  draftsDir?: string,
): Promise<SavedTuiDraft> {
  const record: TuiDraftRecord = {
    ...input,
    createdAt: new Date().toISOString(),
    id: `draft-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  };
  const directory = resolveDraftsDir(draftsDir);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${record.id}.json`);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { filePath, record };
}

export async function listDrafts(draftsDir?: string): Promise<SavedTuiDraft[]> {
  const directory = resolveDraftsDir(draftsDir);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const drafts = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(directory, entry);
        const record = JSON.parse(await readFile(filePath, "utf8")) as TuiDraftRecord;
        return { filePath, record };
      }),
  );
  return drafts.sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
}

export async function loadDraft(
  id: string,
  draftsDir?: string,
): Promise<SavedTuiDraft | undefined> {
  const filePath = path.join(resolveDraftsDir(draftsDir), `${safeDraftId(id)}.json`);
  try {
    const record = JSON.parse(await readFile(filePath, "utf8")) as TuiDraftRecord;
    return { filePath, record };
  } catch {
    return undefined;
  }
}

export async function deleteDraft(id: string, draftsDir?: string): Promise<void> {
  await rm(path.join(resolveDraftsDir(draftsDir), `${safeDraftId(id)}.json`), { force: true });
}

export async function updateDraftContent(
  id: string,
  content: string,
  draftsDir?: string,
): Promise<SavedTuiDraft | undefined> {
  const draft = await loadDraft(id, draftsDir);
  if (!draft) {
    return undefined;
  }
  const updated: TuiDraftRecord = { ...draft.record, content };
  await writeFile(draft.filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return { filePath: draft.filePath, record: updated };
}

export function resolveDraftsDir(draftsDir?: string): string {
  if (draftsDir) {
    return draftsDir;
  }
  const realmHome = process.env.REALM_HOME || path.join(os.homedir(), ".realm");
  return path.join(realmHome, "drafts");
}

function safeDraftId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "");
}
