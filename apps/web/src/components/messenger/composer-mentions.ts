import type { RoleSummary, Room } from "@realm/api-contract";
import { roomMembersForAvatar } from "./messenger-primitives.tsx";

// ---------------------------------------------------------------------------
// Mention helpers (pure functions, kept co-located with the composer so it
// stays the single source of truth for its own drafting behavior).
// ---------------------------------------------------------------------------

export type MentionCandidate = { id: string; label: string };
export type MentionTrigger = { query: string; start: number; end: number };

/**
 * Detect an in-progress "@mention" immediately before the caret. The "@" must
 * start a word (line start or after whitespace) so emails / mid-word "@" never
 * trigger, and the token after "@" may not contain whitespace — a space commits
 * the mention and closes the popover.
 */
export function detectMentionTrigger(value: string, caret: number): MentionTrigger | null {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  const before = upToCaret[at - 1];
  if (before !== undefined && !/\s/.test(before)) {
    return null;
  }
  const query = upToCaret.slice(at + 1);
  if (/\s/.test(query)) {
    return null;
  }
  return { end: caret, query, start: at };
}

/** Mention candidates = the active room's role members (never the owner). */
export function mentionCandidates(
  room: Room | undefined,
  roles: RoleSummary[],
): MentionCandidate[] {
  if (!room) {
    return [];
  }
  return roomMembersForAvatar(room, roles)
    .filter((member) => member.id !== "owner")
    .map((member) => ({ id: member.id, label: member.label }));
}

/** Case-insensitive substring filter on display label and role id. */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return candidates;
  }
  return candidates.filter(
    (candidate) =>
      candidate.label.toLowerCase().includes(needle) || candidate.id.toLowerCase().includes(needle),
  );
}

/**
 * Replace the active "@query" slice with "@<label> " and return the new draft
 * plus the caret position that should follow the inserted text.
 */
export function applyMention(
  value: string,
  trigger: MentionTrigger,
  candidate: MentionCandidate,
): { caret: number; value: string } {
  const insert = `@${candidate.label} `;
  const next = value.slice(0, trigger.start) + insert + value.slice(trigger.end);
  return { caret: trigger.start + insert.length, value: next };
}

export function resizeComposer(textarea: HTMLTextAreaElement | null, contentLength?: number) {
  if (!textarea) {
    return;
  }
  textarea.style.height = contentLength === 0 ? "40px" : "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
}
