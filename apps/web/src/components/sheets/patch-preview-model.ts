import type { ConfigPatchProposal } from "@realm/api-contract";

export type PatchOperationSummary = {
  create: number;
  update: number;
  delete: number;
  total: number;
};

export function summarizePatchOperations(
  operations: ConfigPatchProposal["operations"],
): PatchOperationSummary {
  const summary: PatchOperationSummary = { create: 0, delete: 0, total: 0, update: 0 };
  for (const operation of operations) {
    summary[operation.action] += 1;
    summary.total += 1;
  }
  return summary;
}

export function buildRawPatchText(proposal: ConfigPatchProposal): string {
  return proposal.operations.map(formatOperationDiff).join("\n");
}

export function buildConflictPatchText(
  proposal: ConfigPatchProposal,
  error: string | undefined,
): string {
  const conflictPath = configConflictPath(error);
  const operations = conflictPath
    ? proposal.operations.filter((operation) => operation.path === conflictPath)
    : [];
  return operations.map(formatOperationDiff).join("\n");
}

export function configConflictPath(error: string | undefined): string | undefined {
  const match = error?.match(/Config conflict at (.+)$/i);
  return match?.[1]?.trim();
}

export function isConflictError(error: string | undefined): boolean {
  return Boolean(error?.toLowerCase().includes("config conflict"));
}

function formatOperationDiff(operation: ConfigPatchProposal["operations"][number]): string {
  const lines = [
    `diff --realm ${operation.path}`,
    `# action: ${operation.action}`,
    `# previous: ${operation.previousHash ?? "none"}`,
    `# next: ${operation.nextHash ?? "none"}`,
  ];

  if (operation.action === "delete") {
    return [...lines, `--- a/${operation.path}`, "+++ /dev/null", "@@", "-<deleted>"].join("\n");
  }

  const from = operation.action === "create" ? "/dev/null" : `a/${operation.path}`;
  const body = (operation.nextContent ?? "")
    .split(/\r?\n/)
    .map((line) => `+${line}`)
    .join("\n");
  return [...lines, `--- ${from}`, `+++ b/${operation.path}`, "@@", body].join("\n");
}
