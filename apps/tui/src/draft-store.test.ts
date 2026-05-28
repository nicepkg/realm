import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteDraft, listDrafts, loadDraft, saveFailedDraft } from "./draft-store.ts";

describe("TUI draft store", () => {
  test("persists, lists, loads, and deletes failed send drafts", async () => {
    const draftsDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-drafts-"));
    const saved = await saveFailedDraft(
      {
        content: "message body",
        error: "network down",
        identity: "owner",
        roomId: "main",
        roomName: "All Hands",
        worldId: "cultivation",
        worldName: "Cultivation",
      },
      draftsDir,
    );

    expect(saved.filePath).toContain(saved.record.id);
    expect(saved.record.error).toBe("network down");

    const listed = await listDrafts(draftsDir);
    expect(listed.map((draft) => draft.record.id)).toEqual([saved.record.id]);

    const loaded = await loadDraft(saved.record.id, draftsDir);
    expect(loaded?.record.content).toBe("message body");

    await deleteDraft(saved.record.id, draftsDir);
    expect(await listDrafts(draftsDir)).toEqual([]);
  });
});
