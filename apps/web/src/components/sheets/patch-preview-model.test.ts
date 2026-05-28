import { describe, expect, test } from "bun:test";
import type { ConfigPatchProposal } from "@realm/api-contract";
import {
  buildConflictPatchText,
  buildRawPatchText,
  configConflictPath,
  isConflictError,
  summarizePatchOperations,
} from "./patch-preview-model.ts";

describe("patch preview model", () => {
  test("summarizes config patch operations", () => {
    expect(summarizePatchOperations(samplePatch.operations)).toEqual({
      create: 1,
      delete: 1,
      total: 3,
      update: 1,
    });
  });

  test("builds a readable raw patch from proposal operations", () => {
    const raw = buildRawPatchText(samplePatch);

    expect(raw).toContain("diff --realm .agents/worlds/demo/world.yaml");
    expect(raw).toContain("--- /dev/null");
    expect(raw).toContain("+name: Demo");
    expect(raw).toContain("# previous: old-hash");
    expect(raw).toContain("-<deleted>");
  });

  test("detects apply-time conflict errors", () => {
    expect(isConflictError("Config conflict at .agents/config.yaml")).toBe(true);
    expect(isConflictError("Type APPLY patch-1 to apply")).toBe(false);
  });

  test("extracts the conflicted file diff from a stale patch error", () => {
    const error = "Config conflict at .agents/config.yaml";

    expect(configConflictPath(error)).toBe(".agents/config.yaml");
    expect(buildConflictPatchText(samplePatch, error)).toContain(
      "diff --realm .agents/config.yaml",
    );
    expect(buildConflictPatchText(samplePatch, error)).toContain("# previous: old-hash");
    expect(buildConflictPatchText(samplePatch, error)).not.toContain("demo/world.yaml");
  });
});

const samplePatch: ConfigPatchProposal = {
  createdAt: "2026-05-28T00:00:00.000Z",
  id: "patch-1",
  operations: [
    {
      action: "create",
      nextContent: "name: Demo\n",
      nextHash: "new-hash",
      path: ".agents/worlds/demo/world.yaml",
      previousHash: null,
    },
    {
      action: "update",
      nextContent: "version: 2\n",
      nextHash: "next-hash",
      path: ".agents/config.yaml",
      previousHash: "old-hash",
    },
    {
      action: "delete",
      nextContent: null,
      nextHash: null,
      path: ".agents/worlds/old/world.yaml",
      previousHash: "delete-hash",
    },
  ],
  requiredCapabilities: ["world.create"],
  riskLevel: "high",
  riskReasons: ["Changes project, provider, or machine-local settings."],
  summary: "Create a world and update config.",
  title: "Demo patch",
  typedConfirmation: "APPLY patch-1",
};
