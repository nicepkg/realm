import type { RoleSummary } from "@realm/api-contract";
import type { Suggestion } from "@/components/ai-elements";
import type { GodChatShellStrings } from "./god-chat-shell.tsx";

/**
 * Pure, React-free helpers for {@link GodChatShell}.
 *
 * Extracted so the shell file stays under the 500-line file-size guard while the
 * load-bearing pure logic (empty-state suggestion scoping, live-preview turn
 * resolution, streaming auto-scroll signal) stays deterministically
 * unit-testable. The shell re-exports these so existing test import paths
 * (`./god-chat-shell.tsx`) keep working. Type-only imports of
 * `GodChatShellStrings` / `Suggestion` avoid any runtime import cycle.
 */

/**
 * Build the empty-state starter chips from the active world's REAL members (F2).
 *
 * The total stays at ~3 calm chips: the generic create-world + inspect chips are
 * always kept, and the THIRD chip is world-scoped:
 *   - 0 members → the generic create-role chip (`strings.suggestions[1]`), which
 *     teaches the add-role flow and is valid in an empty world. No specific
 *     member name is ever referenced.
 *   - ≥1 member → a role-CONTROL chip templated from the FIRST scoped member's
 *     display name (deterministic — `roles` preserves pool order), replacing the
 *     create-role chip. This is what kills the hard-coded 顾辰风 ghost: the chip
 *     can only ever name a member that actually exists in the world.
 *
 * Pure (no React) so the F2 semantics are unit-testable without rendering. The
 * generic create-world / create-role / inspect chips come straight from
 * `strings.suggestions` (indices 0 / 1 / 2) so all copy stays in the i18n dict.
 */
export function buildSuggestions(
  roles: Pick<RoleSummary, "displayName">[],
  strings: GodChatShellStrings,
): Suggestion[] {
  const [createWorld, createRole, inspect] = strings.suggestions;
  const firstMember = roles[0];
  // Empty world: generic create-role chip (valid + teaches the add-role flow).
  // Populated world: template a REAL member into the role-control chip.
  const middle: Suggestion | undefined = firstMember
    ? {
        label: strings.roleControlChip.label.replaceAll("{name}", firstMember.displayName),
        prompt: strings.roleControlChip.prompt.replaceAll("{name}", firstMember.displayName),
      }
    : createRole;
  // `filter(isDefined)` narrows away the possibly-undefined destructured chips
  // (a malformed override could drop one) so the return type stays non-nullable.
  return [createWorld, middle, inspect].filter(isDefined);
}

/** Type-narrowing presence guard so `.filter` drops undefined AND narrows. */
function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Sum the detail length of the LAST streaming role-speech turn so the shell can
 * feed it to `ConversationAutoScroll` as a second growth signal. A streamed
 * bubble mutates its existing turn's `card.detail` in place (no new turn), so
 * this value grows token-by-token while `chat.turns.length` is flat — letting
 * the viewport keep tracking the bottom mid-stream. Returns 0 when no role
 * bubble is currently streaming.
 */
export function streamingDetailLength(
  turns: { card?: { variant: string; detail?: string; streaming?: boolean } }[],
): number {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const card = turns[index]?.card;
    if (card?.variant === "role-speech" && card.streaming) {
      return card.detail?.length ?? 0;
    }
  }
  return 0;
}

/**
 * Find the turn id of the single live preview card. The hook keeps at most one
 * `pendingProposal`; the live preview is the most recent turn carrying a
 * `preview` card of that proposal's kind. Returns undefined when nothing is
 * pending (so no card renders confirm/cancel).
 */
export function resolveLivePreviewTurnId(
  turns: { id: string; card?: { variant: string; kind: string } }[],
  pendingKind: string | undefined,
): string | undefined {
  if (!pendingKind) {
    return undefined;
  }
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const card = turn?.card;
    if (turn && card && card.variant === "preview" && card.kind === pendingKind) {
      return turn.id;
    }
  }
  return undefined;
}
