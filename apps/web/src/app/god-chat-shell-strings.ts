import type { Suggestion } from "@/components/ai-elements";
import { defaultGodChatCardStrings, type GodChatCardStrings } from "./god-chat-cards.tsx";
import {
  defaultGodChatContextRailStrings,
  type GodChatContextRailStrings,
} from "./god-chat-context-rail.tsx";

/**
 * Localized copy for the {@link GodChatShell} chrome, plus its zh-CN defaults.
 *
 * Extracted from `god-chat-shell.tsx` so the shell stays under the 500-line
 * file-size guard. This is pure data/types (no React, no DOM) so it carries no
 * runtime cost and stays trivially testable. The shell re-exports both symbols,
 * so existing import paths (`./god-chat-shell.tsx`) keep working for tests and
 * sibling components (identity strip).
 */

/** Localized copy for the shell chrome. zh-CN defaults keep it usable before item 6's keys land. */
export type GodChatShellStrings = {
  advanced: string;
  placeholder: string;
  sendLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Shown in the identity strip when no world is selected. */
  noWorld: string;
  /** Shown in the identity strip when running on the mock/fake runtime. */
  mockRuntime: string;
  /**
   * The GENERIC empty-state starter chips — always valid regardless of world
   * scope (create-world, create-role, inspect). Each carries a `kind`:
   * create-world / create-role are `write` (picking prefills the composer; a
   * mutation is never auto-sent), while the inspect chip is `read` (picking sends
   * immediately — the NL-first "one tap, one answer"). The role-CONTROL chip is
   * NOT in here: it is derived at render time from the active world's real members
   * (see {@link buildSuggestions}) so it never references a non-existent role
   * (F2). When the world has ≥1 member, the create-role chip is swapped for a
   * control chip naming the first real member.
   */
  suggestions: Suggestion[];
  /**
   * Template for the role-control chip shown ONLY when the active world has
   * members. `{name}` is replaced with a real member's display name, so the chip
   * never references a ghost role (F2). zh-CN default mirrors the vision's
   * "让<角色>心生退意" example. A `write` chip — controlling a role is a mutation, so
   * picking it prefills rather than sends.
   */
  roleControlChip: { label: string; prompt: string };
  /**
   * Localized confirmation shown after a WRITE chip prefills the composer (e.g.
   * "已填入，按发送"), making the still-needed send press explicit so a pick never
   * reads as a dead click. Read chips bypass this (they send immediately).
   */
  suggestionPrefillHint: string;
  cards: GodChatCardStrings;
  rail: GodChatContextRailStrings;
};

export const defaultGodChatShellStrings: GodChatShellStrings = {
  advanced: "高级",
  cards: defaultGodChatCardStrings,
  emptyDescription: "用一句话创造世界、设定规则、操控角色，或问它现在发生了什么。",
  emptyTitle: "对「天道」说点什么",
  mockRuntime: "模拟运行时",
  noWorld: "尚未进入世界",
  placeholder: "对天道说……",
  rail: defaultGodChatContextRailStrings,
  // Template for the role-control chip — only rendered once the world has a real
  // member to name (F2). `{name}` is the first scoped member's display name.
  roleControlChip: {
    label: "让{name}心生退意",
    prompt: "让{name}此刻心生退意",
  },
  sendLabel: "发送",
  // GENERIC always-valid chips. The create-role chip teaches the add-role flow
  // and stays valid in an empty world; the literal "顾辰风" role-control chip was
  // removed — it is now derived from real members at render time (F2). The two
  // create chips are WRITE (prefill-then-send: a mutation is never auto-sent); the
  // inspect chip is READ (direct-send: NL-first one-tap answer, no write risk).
  suggestionPrefillHint: "已填入，按发送",
  suggestions: [
    {
      kind: "write",
      label: "创建一个修真世界",
      prompt: "创建一个有宗门、对手和师父的修真世界",
    },
    {
      kind: "write",
      label: "加一个角色",
      prompt: "加一个谨慎、爱钱的炼丹师，叫云遥",
    },
    {
      kind: "read",
      label: "现在世界什么状态？",
      prompt: "现在世界什么状态？",
    },
  ],
};
