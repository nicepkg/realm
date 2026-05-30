/**
 * Trust-command glue split out of realm-tui-app.ts to keep that file under the
 * 500-line ceiling. The `:trust` command is resolved before `parseTuiCommand`
 * (like `/whereami`) and does not need a `TuiCommand` kind, so its matcher lives
 * here rather than in the command parser.
 */

/**
 * Recognizes `:trust` / `trust` (with an optional tier argument) and returns the
 * raw argument string ("" when bare). Returns undefined for anything else so the
 * caller falls through to normal command parsing.
 */
export function matchTrustCommand(trimmed: string): string | undefined {
  const match = /^(?::trust|trust)(?:\s+(.*))?$/.exec(trimmed);
  if (!match) {
    return undefined;
  }
  return (match[1] ?? "").trim();
}
