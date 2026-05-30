import type { ConfigPatchProposal, RoleSummary } from "@realm/api-contract";
import { type IntentStateOperation, inferRoleFromGoal } from "@realm/assistant";
import type {
  ChatCard,
  PendingProposal,
  StagedConfig,
  StagedWrite,
} from "@/state/god-chat-model.ts";
import { roleName } from "@/state/god-chat-model.ts";
import { localizeProposalSummary, localizeProposalTitle } from "@/state/god-chat-runtime.ts";

/**
 * God-chat preview + result FEEDBACK composition (zh-CN). Pure + React-free: turns
 * a staged proposal into its inline preview card / intro line, and a confirmed
 * write into its result feedback turn. Also owns the state-patch JSON-pointer
 * humanizer. Split out of `god-chat-model.ts` to keep both files under the
 * 500-line budget; the model file re-exports these so existing import sites keep
 * working.
 */

type GodAction = "kill" | "mute" | "revive";

const GOD_ACTION_LABEL: Record<GodAction, string> = {
  kill: "移出世界",
  mute: "禁言",
  revive: "解禁",
};

// --- Preview cards (awaiting confirm) ---------------------------------------

/**
 * Build the inline preview card describing a staged proposal before confirm.
 * `roles` is threaded in so a state-patch preview renders role ids in the JSON
 * pointer as display names (顾辰风) rather than a bare id (guchenfeng).
 */
export function previewCard(proposal: PendingProposal, roles: RoleSummary[] = []): ChatCard {
  switch (proposal.kind) {
    case "config":
      return {
        detail: `${configPreviewBody(proposal)}\n风险等级：${riskLabel(proposal.proposal.riskLevel)}`,
        kind: "config",
        title: localizeProposalTitle(proposal.proposal.title),
        variant: "preview",
      };
    case "god": {
      const actionText = `对「${proposal.targetRoleName}」执行：${GOD_ACTION_LABEL[proposal.action]}`;
      return {
        detail: `${actionText}${reasonLine(actionText, proposal.reason)}`,
        kind: "god",
        title: "神谕裁决",
        variant: "preview",
      };
    }
    case "state-patch": {
      const actionText = describeOperations(proposal.operations, roles);
      return {
        detail: `${actionText}${reasonLine(actionText, proposal.reason)}`,
        kind: "state-patch",
        title: "属性 / 状态调整",
        variant: "preview",
      };
    }
    case "run-turn":
      return {
        detail: `让「${proposal.roleName}」在当前房间发言。`,
        kind: "run-turn",
        title: "推进角色回合",
        variant: "preview",
      };
    case "trust":
      return {
        detail: "当前项目为只读模式，无法运行角色或写入。提升到「运行角色」后即可继续。",
        kind: "trust",
        title: "提升信任等级",
        variant: "preview",
      };
  }
}

/** Operator-facing zh-CN line shown above the preview card. */
export function previewIntroText(proposal: PendingProposal): string {
  switch (proposal.kind) {
    case "config":
      return "我准备了一份配置改动，确认后写入。";
    case "god":
      return "这是一次会改变世界的裁决，确认后生效。";
    case "state-patch":
      return "这会修改角色 / 世界状态，确认后写入。";
    case "run-turn":
      return "确认后我会推进这个角色的回合。";
    case "trust":
      return proposal.retry
        ? "当前为只读模式，刚才的操作被拦下了。要我把信任等级提升到「运行角色」并继续吗？"
        : "当前为只读模式，要我把信任等级提升到「运行角色」吗？";
  }
}

/**
 * Compose the body line of a config preview card. For an add-role proposal we
 * break out the distilled role identity (云遥 · 炼丹师 · 谨慎/爱钱) so the card
 * faithfully shows WHO will be created instead of the thin generic summary
 * ("为「云遥」创建一个项目角色配置。"). Falls back to the localized proposal summary
 * for world / non-role proposals or when no role traits could be distilled.
 *
 * The role fields are re-distilled from the original operator `goal` via the
 * shared `inferRoleFromGoal` planner (the same logic that staged the proposal),
 * so the preview matches exactly what gets written — no backend coupling, no
 * duplicated parsing of the YAML payload.
 */
function configPreviewBody(proposal: StagedConfig): string {
  // Pass the operator goal so a create-world summary gains the faithful
  // "本次将创建 … / 本次不创建 …" note when the goal named inhabitants (F2). The
  // goal is ignored for non-world summaries, so add-role keeps its plain summary.
  const summaryLine = localizeProposalSummary(proposal.proposal.summary, proposal.goal);
  if (!isAddRoleProposal(proposal.proposal)) {
    return summaryLine;
  }
  const roleLine = roleIdentityLine(proposal.goal);
  // Keep the localized summary as the lead-in and append the distilled identity
  // on its own line so the card reads: "为「云遥」创建…" + "云遥 · 炼丹师 · 谨慎/爱钱".
  return roleLine ? `${summaryLine}\n${roleLine}` : summaryLine;
}

/**
 * True when a config proposal creates a role. Detected from the declared
 * `role.create` capability (robust across deterministic + model-backed planners),
 * falling back to a role.yaml file operation path so the signal survives even if
 * a future planner omits the capability annotation.
 */
function isAddRoleProposal(proposal: ConfigPatchProposal): boolean {
  if (proposal.requiredCapabilities.includes("role.create")) {
    return true;
  }
  return proposal.operations.some((operation) => operation.path.includes("/roles/"));
}

/**
 * Distill "云遥 · 炼丹师 · 谨慎/爱钱" from the operator goal. Reuses the planner's
 * `inferRoleFromGoal` so the displayName / occupation / traits match the staged
 * proposal exactly, then renders them as a single calm dot-separated line.
 * Returns undefined when nothing beyond a bare name could be distilled (so the
 * caller keeps the plain summary rather than echoing a redundant name).
 */
function roleIdentityLine(goal: string): string | undefined {
  const role = inferRoleFromGoal(goal);
  const { occupation, traits } = parseRoleSummary(role.summary, role.displayName);
  const parts = [role.displayName];
  if (occupation) {
    parts.push(occupation);
  }
  if (traits.length > 0) {
    parts.push(traits.join("/"));
  }
  // A lone displayName adds nothing the title doesn't already carry.
  return parts.length > 1 ? parts.join(" · ") : undefined;
}

/**
 * Parse a distilled role summary back into its occupation + trait fields. The
 * planner emits one of:
 *   - "{name}，{occupation}。{trait}，{trait}。"
 *   - "{name}，{occupation}。"
 *   - "{name}，{trait}，{trait}。"
 *   - "{name}，由对话设定的自定义角色。"  (no real fields)
 * We strip the leading "{name}，", then split the remainder into 。-delimited
 * sentences: the FIRST sentence is the occupation only when it is a single
 * profession-like clause (no inner 、/，); everything else is treated as traits.
 */
function parseRoleSummary(
  summary: string,
  displayName: string,
): { occupation?: string; traits: string[] } {
  const namePrefix = `${displayName}，`;
  const body = summary.startsWith(namePrefix) ? summary.slice(namePrefix.length) : summary;
  const sentences = body
    .split("。")
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return { traits: [] };
  }
  // The generic placeholder carries no real occupation/traits.
  if (sentences.length === 1 && sentences[0] === "由对话设定的自定义角色") {
    return { traits: [] };
  }
  let occupation: string | undefined;
  let traitSentences = sentences;
  // First sentence is the occupation only when it is a single clause (no inner
  // separators) — otherwise the whole body is a trait list ("孤傲，护短").
  const first = sentences[0] as string;
  if (!first.includes("，") && !first.includes("、")) {
    occupation = first;
    traitSentences = sentences.slice(1);
  }
  const traits = traitSentences
    .flatMap((sentence) => sentence.split(/[，、]/u))
    .map((trait) => trait.trim())
    .filter(Boolean);
  return { occupation, traits };
}

// --- Result feedback (after confirm) ----------------------------------------

/** zh-CN feedback turn after a successful config apply. */
export function configResultFeedback(
  proposal: StagedConfig,
  changedPaths: string[],
): { text: string; card: ChatCard } {
  const paths = changedPaths.length > 0 ? changedPaths.join("、") : "（无文件变更）";
  return {
    card: { detail: paths, kind: "config", title: "配置已写入", variant: "result" },
    // The localized title already carries its own 「」 around the world/role name
    // (e.g. 创建世界「助理世界」); wrapping it again would double-nest into
    // 「创建世界「助理世界」」. Use a colon lead-in so the quotes stay single-layer.
    text: `已应用配置：${localizeProposalTitle(proposal.proposal.title)}。`,
  };
}

/** zh-CN feedback turn after a god ruling. */
export function godResultFeedback(
  proposal: Extract<StagedWrite, { kind: "god" }>,
  committed: boolean,
): { text: string; card: ChatCard } {
  const action = GOD_ACTION_LABEL[proposal.action];
  const status = committed ? "已生效" : "未生效（版本冲突或被拒绝）";
  return {
    card: {
      detail: `对「${proposal.targetRoleName}」执行：${action}（${status}）`,
      kind: "god",
      title: "神谕裁决",
      variant: "result",
    },
    text: `裁决${committed ? "已" : "未"}对「${proposal.targetRoleName}」生效。`,
  };
}

/** zh-CN feedback turn after a state patch. */
export function statePatchResultFeedback(
  proposal: Extract<StagedWrite, { kind: "state-patch" }>,
  committed: boolean,
  roles: RoleSummary[] = [],
): { text: string; card: ChatCard } {
  const status = committed ? "已写入" : "未写入（版本冲突或被拒绝）";
  return {
    card: {
      detail: `${describeOperations(proposal.operations, roles)}（${status}）`,
      kind: "state-patch",
      title: "状态调整",
      variant: "result",
    },
    text: `状态调整${committed ? "已" : "未"}生效。`,
  };
}

// --- Small helpers -----------------------------------------------------------

/**
 * Build the trailing `\n理由：<reason>` line for a preview card, but only when the
 * reason actually ADDS information. `intent.reason` is the raw operator command,
 * which the assistant frequently echoes verbatim into the action text — so a
 * naive append reads as a duplicate (e.g. action「…禁言」+「理由：…把他禁言」).
 * We suppress the line when the reason is empty/whitespace, or when either of the
 * two strings already contains the other (the action already conveys the reason,
 * or vice-versa). For a PARTIAL overlap — a reason that ends in the imperative
 * action clause ("云遥作弊，把她禁言") whose verb already appears in `actionText` —
 * we strip just the trailing imperative clause so 理由 carries only the
 * justification ("云遥作弊"). Returns "" (no line) or the full "\n理由：<reason>"
 * segment.
 */
function reasonLine(actionText: string, reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (actionText.includes(trimmed) || trimmed.includes(actionText.trim())) {
    return "";
  }
  const justification = stripImperativeClause(actionText, trimmed);
  if (justification.length === 0) {
    // Nothing meaningful survives the strip — the reason was pure imperative echo.
    return "";
  }
  return `\n理由：${justification}`;
}

/**
 * The verbs an operator command can echo back into the reason. These mirror the
 * action labels (禁言 / 移出世界 / 解禁) plus the common colloquial synonyms the
 * assistant may surface (封禁 / 赦免). Used only to recognise a trailing imperative
 * clause; the canonical action verb shown in the card still comes from
 * `GOD_ACTION_LABEL`.
 */
const IMPERATIVE_ACTION_VERBS = ["移出世界", "禁言", "封禁", "解禁", "赦免"] as const;

/** Connective punctuation that joins a justification to its imperative clause. */
const CLAUSE_CONNECTIVES = "，、。";

/**
 * Strip a trailing imperative action clause from `reason` when its verb is already
 * shown in `actionText`. An imperative clause is a final "把<对象><verb>" segment
 * ("把她禁言") whose verb matches the action verb the card already renders — so the
 * verb would otherwise read as both the action AND inside its own justification.
 *
 * We only strip when the clause's verb is present in `actionText` (the card
 * already conveys it). The clause plus any trailing connective punctuation
 * (，、。) is removed, leaving the bare justification ("云遥作弊"). When no such
 * clause is found, the reason is returned trimmed and unchanged.
 */
function stripImperativeClause(actionText: string, reason: string): string {
  const verb = IMPERATIVE_ACTION_VERBS.find(
    (candidate) => reason.endsWith(candidate) && actionText.includes(candidate),
  );
  if (!verb) {
    return reason;
  }
  // Locate the "把" that opens the trailing imperative clause ending in this verb.
  const clauseStart = reason.lastIndexOf("把");
  if (clauseStart < 0) {
    return reason;
  }
  const head = reason.slice(0, clauseStart);
  // Drop any connective punctuation that joined the justification to the clause.
  let end = head.length;
  while (end > 0 && CLAUSE_CONNECTIVES.includes(head[end - 1] as string)) {
    end -= 1;
  }
  return head.slice(0, end).trim();
}

function riskLabel(risk: "low" | "medium" | "high"): string {
  return { high: "高", low: "低", medium: "中" }[risk];
}

/**
 * zh-CN labels for the well-known top-level state containers a JSON pointer can
 * address. Kept local to the patch-path humanizer (the inspect answer owns its
 * own STATE_CONTAINER_LABELS in the runtime file): both maps are tiny and stable,
 * so a small duplication is cheaper than coupling two files through a shared
 * export. Any container NOT here keeps its raw segment verbatim.
 */
const PATCH_CONTAINER_LABELS: Record<string, string> = {
  derivedState: "推演结果",
  hiddenState: "天机",
  metaState: "运行元数据",
  privateState: "角色私密",
  publicState: "世界全景",
};

/**
 * Translate a raw JSON pointer (e.g. `/privateState/roles/guchenfeng/conditions`)
 * into a zh-CN reading path so a state-patch card never exposes a bare pointer.
 * Rules, applied segment by segment:
 *  - a known container segment → its zh-CN label (角色私密 / 世界全景 / …)
 *  - the `roles` segment immediately followed by a role id → 角色「<displayName>」
 *    (the role id is resolved against `roles`, falling back to the raw id)
 *  - any other segment (author/engine field like `conditions` / `qi`) is an
 *    author-meaningful name and is kept VERBATIM — we never invent a translation.
 * Segments are joined with `·` so the result reads like 角色私密·角色「顾辰风」·conditions.
 */
export function humanizePatchPath(path: string, roles: RoleSummary[]): string {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return path;
  }
  const parts: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] as string;
    if (segment === "roles" && index + 1 < segments.length) {
      const roleId = segments[index + 1] as string;
      parts.push(`角色「${roleName(roles, roleId)}」`);
      index += 1; // consume the role-id segment we just rendered
      continue;
    }
    parts.push(PATCH_CONTAINER_LABELS[segment] ?? segment);
  }
  return parts.join("·");
}

/** Human-readable zh-CN summary of a single state-patch operation. */
function describeOperation(operation: IntentStateOperation, roles: RoleSummary[]): string {
  const where = humanizePatchPath(operation.path, roles);
  switch (operation.op) {
    case "set":
      return `设置 ${where} = ${stringifyValue(operation.value)}`;
    case "increment":
      return `${where} 变化 ${operation.amount > 0 ? "+" : ""}${operation.amount}`;
    case "append":
      return `向 ${where} 追加 ${stringifyValue(operation.value)}`;
    default: {
      // Exhaustive over the IntentStateOperation union; this asserts at the type
      // level that every op variant is handled above.
      const exhaustive: never = operation;
      return String(exhaustive);
    }
  }
}

/**
 * Human-readable zh-CN summary of a list of state-patch operations. `roles` is
 * threaded through so each operation's JSON pointer renders role ids as the
 * author's display name (顾辰风) instead of a bare id (guchenfeng).
 */
export function describeOperations(
  operations: IntentStateOperation[],
  roles: RoleSummary[],
): string {
  return operations.map((operation) => describeOperation(operation, roles)).join("；");
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/** A state-patch result is a "committed" or "duplicate" terminal success. */
export function isWriteCommitted(status: string): boolean {
  return status === "committed" || status === "duplicate";
}
