export type ContextBucket =
  | "system"
  | "roleMemory"
  | "roomRecentMessages"
  | "stateView"
  | "retrievedHistory"
  | "toolManifest"
  | "reserve";

export type ContextBudgetAllocation = Record<ContextBucket, number>;

export type ContextBudgetPolicy = {
  maxInputTokens: number;
  allocation: ContextBudgetAllocation;
};

export type ContextItem = {
  id: string;
  bucket: Exclude<ContextBucket, "reserve">;
  title: string;
  text: string;
  priority?: number;
};

export type IncludedContextSection = ContextItem & {
  estimatedTokens: number;
};

export type OmittedContextSummary = {
  id: string;
  bucket: ContextItem["bucket"];
  title: string;
  estimatedTokens: number;
  reason: "bucket_budget_exceeded" | "global_budget_exceeded" | "empty";
};

export type CompiledContextPack = {
  maxInputTokens: number;
  totalEstimatedTokens: number;
  sections: IncludedContextSection[];
  omitted: OmittedContextSummary[];
};

export const defaultContextBudgetPolicy: ContextBudgetPolicy = {
  maxInputTokens: 24_000,
  allocation: {
    system: 4_000,
    roleMemory: 3_000,
    roomRecentMessages: 6_000,
    stateView: 3_000,
    retrievedHistory: 5_000,
    toolManifest: 2_000,
    reserve: 1_000,
  },
};

export class ContextBudgetBroker {
  compile(input: { items: ContextItem[]; policy?: ContextBudgetPolicy }): CompiledContextPack {
    const policy = normalizePolicy(input.policy ?? defaultContextBudgetPolicy);
    const ordered = [...input.items].sort(
      (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
    );
    const usedByBucket = emptyAllocation();
    const globalLimit = Math.max(0, policy.maxInputTokens - policy.allocation.reserve);
    const sections: IncludedContextSection[] = [];
    const omitted: OmittedContextSummary[] = [];
    let totalEstimatedTokens = 0;

    for (const item of ordered) {
      const estimatedTokens = estimateTokens(item.text);
      if (estimatedTokens === 0) {
        omitted.push(omission(item, estimatedTokens, "empty"));
        continue;
      }
      if (usedByBucket[item.bucket] + estimatedTokens > policy.allocation[item.bucket]) {
        omitted.push(omission(item, estimatedTokens, "bucket_budget_exceeded"));
        continue;
      }
      if (totalEstimatedTokens + estimatedTokens > globalLimit) {
        omitted.push(omission(item, estimatedTokens, "global_budget_exceeded"));
        continue;
      }
      usedByBucket[item.bucket] += estimatedTokens;
      totalEstimatedTokens += estimatedTokens;
      sections.push({ ...item, estimatedTokens });
    }

    return {
      maxInputTokens: policy.maxInputTokens,
      totalEstimatedTokens,
      sections,
      omitted,
    };
  }
}

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function formatContextPack(pack: CompiledContextPack): string {
  const sections = pack.sections.map((section) =>
    [`## ${section.title}`, section.text.trim()].join("\n"),
  );

  if (pack.omitted.length > 0) {
    sections.push(
      [
        "## Omitted Context",
        ...pack.omitted.map(
          (item) => `- ${item.bucket}:${item.id} (${item.estimatedTokens} tokens): ${item.reason}`,
        ),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function normalizePolicy(policy: ContextBudgetPolicy): ContextBudgetPolicy {
  const allocation = { ...policy.allocation };
  const allocationTotal = Object.values(allocation).reduce((sum, value) => sum + value, 0);
  if (allocationTotal > policy.maxInputTokens) {
    throw new Error("Context budget allocation exceeds max input tokens");
  }
  return { maxInputTokens: policy.maxInputTokens, allocation };
}

function emptyAllocation(): ContextBudgetAllocation {
  return {
    system: 0,
    roleMemory: 0,
    roomRecentMessages: 0,
    stateView: 0,
    retrievedHistory: 0,
    toolManifest: 0,
    reserve: 0,
  };
}

function omission(
  item: ContextItem,
  estimatedTokens: number,
  reason: OmittedContextSummary["reason"],
): OmittedContextSummary {
  return {
    id: item.id,
    bucket: item.bucket,
    title: item.title,
    estimatedTokens,
    reason,
  };
}
