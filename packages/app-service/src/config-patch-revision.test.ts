import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "@realm/config";
import { RealmApplicationService } from "./index.ts";

describe("RealmApplicationService config patch revision", () => {
  test("revises editable config patches against the current file hashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "realm-app-config-revise-"));
    await initProject(root, "demo");
    const service = new RealmApplicationService({ root, trustTier: "run-roles" });

    const proposal = await service.proposeRole({
      id: "qa",
      displayName: "QA",
      model: "default",
      summary: "Regression reviewer.",
    });
    const rolePath = path.join(root, ".agents", "roles", "qa", "role.yaml");
    await mkdir(path.dirname(rolePath), { recursive: true });
    await writeFile(rolePath, "version: 1\nid: qa\ndisplayName: Existing QA\n", "utf8");

    const revised = await service.reviseConfigPatch(proposal.id, {
      operations: [
        {
          path: ".agents/roles/qa/role.yaml",
          nextContent: "version: 1\nid: qa\ndisplayName: Edited QA\nmodel: default\n",
        },
      ],
    });

    expect(revised.id).not.toBe(proposal.id);
    expect(revised.operations[0]?.action).toBe("update");
    expect(revised.operations[0]?.previousHash).not.toBe(proposal.operations[0]?.previousHash);

    await service.applyConfigPatch(revised.id);
    expect(await readFile(rolePath, "utf8")).toContain("Edited QA");
  });
});
