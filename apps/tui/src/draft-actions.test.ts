import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { editDraft, renderDraftCopyDetails, renderDraftDetails } from "./draft-actions.ts";
import { saveFailedDraft } from "./draft-store.ts";
import { t } from "./i18n.ts";

describe("TUI draft actions", () => {
  test("renders, edits, and prints copyable draft details", async () => {
    const draftsDir = await mkdtemp(path.join(os.tmpdir(), "realm-tui-draft-actions-"));
    const dictionary = t("en");
    const saved = await saveFailedDraft(
      {
        content: "original message",
        error: "network down",
        identity: "owner",
        roomId: "main",
        roomName: "All Hands",
        worldId: "cultivation",
        worldName: "Cultivation",
      },
      draftsDir,
    );

    const details = await renderDraftDetails(saved.record.id, draftsDir, dictionary);
    expect(details).toContain("network down");
    expect(details).toContain(":edit-draft");
    expect(details).toContain("original message");

    const edited = await editDraft(saved.record.id, "edited message", draftsDir, dictionary);
    expect(edited).toContain("updated");

    const copyable = await renderDraftCopyDetails(saved.record.id, draftsDir, dictionary);
    expect(copyable).toContain('"content": "edited message"');
    expect(copyable).toContain(saved.filePath);
  });
});
