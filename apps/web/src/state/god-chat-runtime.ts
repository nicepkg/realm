/**
 * God-chat RUNTIME helpers — the React-free, network-free pieces that the brain
 * (`god-chat-model.ts` + `use-god-chat.ts`) leans on. Kept under the 500-line
 * budget by housing the two heaviest concerns here and re-exporting the rest:
 *
 *  - F3: backend error / denial reason → zh-CN operator copy (+ trust flag).
 *  - F4: assistant-planner English proposal title/summary → zh-CN display copy.
 *  - F2: a create-world preview faithfully lists the inhabitants the goal named
 *    (宗门/对手/师父 …) and honestly flags that the bare world will NOT yet
 *    contain them — so the preview reflects the real outcome ("说了 A 只做 B")
 *    instead of the thin generic summary.
 *  - F1: role-turn streaming + room-message reconciliation lives in
 *    `god-chat-role-turn.ts` (re-exported below) so this file stays in budget.
 *
 * Everything here is pure and deterministically unit-testable; the model file
 * re-exports these so existing import sites keep working.
 */

import { detectWorldStructureClues } from "@realm/assistant";

// --- Backend error → zh-CN copy (F3) ----------------------------------------

/**
 * Classification of a raw backend error/reason string into zh-CN copy plus a
 * `trustRelated` flag the hook uses to decide whether to append an inline
 * trust-elevation CTA (F2). Kept pure so it is unit-testable in isolation and so
 * NO untranslated English sentence ever reaches the UI.
 */
export type BackendErrorInfo = { text: string; trustRelated: boolean };

/**
 * Map a backend error message / denial reason to operator-facing zh-CN copy.
 * Known codes/phrases (trust gate, version conflict, timeout, policy/allowlist,
 * not-found) get a precise translation; anything unmatched falls back to a calm
 * zh-CN prefix that still carries the raw detail for support, so the UI never
 * shows a bare English sentence. `trustRelated` marks the read-only/trust gate so
 * the caller can offer the one-tap elevation card.
 */
export function classifyBackendError(raw: string | undefined): BackendErrorInfo {
  const detail = (raw ?? "").trim();
  const normalized = detail.toLowerCase();
  if (detail.length === 0) {
    return { text: "操作失败，原因未知，请稍后重试。", trustRelated: false };
  }
  // Trust / read-only gate — the most common write rejection on a fresh project.
  if (
    normalized.includes("read-only") ||
    normalized.includes("read only") ||
    normalized.includes("raise trust") ||
    normalized.includes("trusted for") ||
    normalized.includes("trust tier")
  ) {
    return { text: "当前为只读模式，无法写入。", trustRelated: true };
  }
  if (
    normalized.includes("not in the allowlist") ||
    normalized.includes("policy") ||
    normalized.includes("denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed")
  ) {
    return { text: "这一步被安全策略拦下了，当前权限不允许该操作。", trustRelated: true };
  }
  if (
    normalized.includes("version") &&
    (normalized.includes("conflict") ||
      normalized.includes("mismatch") ||
      normalized.includes("stale"))
  ) {
    return { text: "世界状态已被其他改动更新（版本冲突），请刷新后重试。", trustRelated: false };
  }
  if (normalized.includes("conflict")) {
    return { text: "操作与当前状态冲突，请刷新后重试。", trustRelated: false };
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return { text: "操作超时，请稍后重试。", trustRelated: false };
  }
  if (normalized.includes("not found") || normalized.includes("404")) {
    return { text: "目标不存在或已被移除。", trustRelated: false };
  }
  if (
    normalized.includes("network") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("econnrefused")
  ) {
    return { text: "网络异常，连不上后端，请检查服务后重试。", trustRelated: false };
  }
  if (normalized.includes("unauthorized") || normalized.includes("401")) {
    return { text: "鉴权失败，请重新登录后重试。", trustRelated: false };
  }
  // Unknown code: keep the raw detail but wrap it so it reads as Chinese.
  return { text: `操作失败：${detail}`, trustRelated: false };
}

// --- Config-proposal display localization (F4) -------------------------------

/**
 * The assistant planner emits English proposal titles/summaries (e.g.
 * "Create world Assistant World", "Add role 云遥"). We DO NOT touch the planner
 * (the YAML config semantics must stay intact); instead we localize the DISPLAY
 * copy here so the preview card + success feedback read as natural zh-CN and no
 * English world title leaks into a Chinese sentence (F4).
 *
 * Each rule pulls the meaningful name (the world/role/rule label) out of a known
 * English template and re-renders it in Chinese. Names are intentionally kept
 * verbatim — only the surrounding scaffolding is translated. Anything that
 * matches no template keeps its original text but gains a calm Chinese prefix so
 * it still flows inside a Chinese clause.
 */
const PROPOSAL_TITLE_RULES: { pattern: RegExp; render: (name: string) => string }[] = [
  {
    pattern: /^create a sandbox world(?:[:\s-]+(.*))?$/i,
    render: (n) => (n ? `创建沙盒世界「${n}」` : "创建一个沙盒世界"),
  },
  { pattern: /^create world[:\s-]+(.+)$/i, render: (n) => `创建世界「${n}」` },
  {
    pattern: /^create a world(?:[:\s-]+(.*))?$/i,
    render: (n) => (n ? `创建世界「${n}」` : "创建一个世界"),
  },
  { pattern: /^add role[:\s-]+(.+)$/i, render: (n) => `新增角色「${n}」` },
  {
    pattern: /^add a role(?:[:\s-]+(.*))?$/i,
    render: (n) => (n ? `新增角色「${n}」` : "新增一个角色"),
  },
  { pattern: /^create role[:\s-]+(.+)$/i, render: (n) => `新增角色「${n}」` },
  { pattern: /^add rule[:\s-]+(.+)$/i, render: (n) => `新增规则「${n}」` },
  {
    pattern: /^add a rule(?:[:\s-]+(.*))?$/i,
    render: (n) => (n ? `新增规则「${n}」` : "新增一条规则"),
  },
  { pattern: /^set rule[:\s-]+(.+)$/i, render: (n) => `设定规则「${n}」` },
  {
    pattern: /^update world(?:[:\s-]+(.*))?$/i,
    render: (n) => (n ? `更新世界「${n}」` : "更新世界配置"),
  },
];

/** True for a string that is already (mostly) Chinese — leave it untouched. */
function hasChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/** Localize a planner-emitted proposal title to zh-CN display copy (F4). */
export function localizeProposalTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return "配置改动";
  }
  for (const rule of PROPOSAL_TITLE_RULES) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      return rule.render((match[1] ?? "").trim());
    }
  }
  if (hasChinese(trimmed)) {
    return trimmed;
  }
  // No template hit and no Chinese: keep the original (likely a proper name) but
  // frame it so it reads naturally inside the Chinese preview.
  return `配置改动：${trimmed}`;
}

/**
 * Localize a planner-emitted proposal summary to zh-CN display copy (F4), and —
 * when the original operator `goal` is supplied (F2) — make a create-world
 * preview FAITHFUL: append an explicit "本次将创建 … / 本次不创建 …" note that
 * lists the inhabitants the goal named (宗门/对手/师父 …) which the bare world
 * will NOT yet contain. This stops the "说了 A 只做 B" gap where the operator
 * asks for a sect + rival + master but the preview only mentions a world + room.
 *
 * The note is purely a DISPLAY concern (it does not touch the planner's YAML
 * semantics — the world patch still legitimately creates only a world + 全员房间),
 * and it is fully backward-compatible: with no `goal`, or for a non-world summary,
 * or when the goal named no inhabitants, the summary is returned unchanged.
 */
export function localizeProposalSummary(summary: string, goal?: string): string {
  const base = localizeProposalSummaryCore(summary);
  const note = goal === undefined ? undefined : worldCreationFaithfulNote(summary, goal);
  return note ? `${base}\n${note}` : base;
}

/** F4-only localization of a proposal summary (no F2 faithfulness note). */
function localizeProposalSummaryCore(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length === 0) {
    return "（无摘要）";
  }
  for (const rule of PROPOSAL_TITLE_RULES) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      return rule.render((match[1] ?? "").trim());
    }
  }
  if (hasChinese(trimmed)) {
    return trimmed;
  }
  return `将执行：${trimmed}`;
}

/**
 * True when a proposal summary is the deterministic create-world summary
 * (`创建一个{mode}世界，并附带一个全员房间。`). Detected by its two stable markers
 * (`世界` + `全员房间`) so it survives the mode word changing (对局/推演/沙盒 …)
 * without coupling to the planner's exact phrasing.
 */
function isCreateWorldSummary(summary: string): boolean {
  return summary.includes("世界") && summary.includes("全员房间");
}

/**
 * F2 — build the faithful "本次将创建 … / 本次不创建 …" note for a create-world
 * preview. Reuses the shared `detectWorldStructureClues` planner detector (the
 * SAME source of truth the post-creation honest follow-up uses) so the preview
 * and the after-the-fact message can never disagree about which inhabitants were
 * named but not built. Returns undefined when this is not a create-world summary
 * or the goal named no inhabitants (the bare world fully satisfies the goal).
 */
function worldCreationFaithfulNote(summary: string, goal: string): string | undefined {
  if (!isCreateWorldSummary(summary)) {
    return undefined;
  }
  const clues = detectWorldStructureClues(goal);
  if (clues.length === 0) {
    return undefined;
  }
  return `本次将创建：世界 + 全员房间；本次不创建：${clues.join("、")}（确认后我再单独建）`;
}

// --- Role-turn streaming + reconciliation (F1) ------------------------------

// Add-role de-duplication (P2) lives in `god-chat-dedup.ts` to keep this file under
// the 500-line budget; re-exported so import sites can reach it via the runtime layer.
export { extractAddRoleName, findRoleByDisplayName } from "@/state/god-chat-dedup.ts";
// The role-turn streaming + room-message reconciliation brain lives in
// `god-chat-role-turn.ts` to keep this file under the 500-line budget. It folds a
// role's `turn.delta` stream and any posted role message back into the NL
// conversation as exactly ONE `role-speech` bubble (killing both the
// delta+completed same-batch race and the double-bubble race). Re-exported here
// so existing import sites that reach these via the runtime layer keep working.
export {
  findPostedTwinForStream,
  findTurnTerminal,
  roleSpeechPostedTurn,
  roleSpeechSettledTurn,
  roleSpeechStreamingTurn,
  runTurnAcceptedFeedback,
  runTurnFailureFeedback,
  type SettleRunTurnInput,
  type SettleRunTurnResult,
  selectRoleMessagesToFold,
  settleRunTurn,
  type TurnTerminal,
} from "@/state/god-chat-role-turn.ts";

// --- World-state inspect answering (read-only, zh-CN) ------------------------

// The world-state inspect answerer lives in `god-chat-inspect.ts` to keep this
// file under the 500-line budget. Re-exported here so existing import sites that
// reach for `answerWorldState` via the model/runtime layer keep working.
export { answerWorldState } from "@/state/god-chat-inspect.ts";
