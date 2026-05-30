/**
 * Stable, idSchema-safe id derivation for NL-minted roles and worlds.
 *
 * Both derivers are DETERMINISTIC for the same input (no process-counter, no
 * module-level mutable state, no side effects) so a reload or a second process
 * re-mints the SAME id for the same name and the `.agents/{roles,worlds}/<id>/`
 * paths stay reproducible. They share one slug/hash core so role and world ids
 * slug identically.
 */

/**
 * Derive a STABLE, idSchema-safe id for a role from its resolved name.
 *
 * Deterministic for the same input (same as {@link deriveStableWorldId}) — no
 * process-counter, no module-level mutable state, no side effects. A reload or a
 * second process must re-mint the SAME id for the same name so the role's
 * `.agents/roles/<id>/` path is reproducible:
 *   - ASCII names keep a readable kebab slug ("Stock Analyst" -> stock-analyst).
 *   - Chinese / non-ASCII names have no safe kebab slug, so we fall back to a
 *     deterministic hash token (云遥 -> role-1a2b3c4d), mirroring world ids.
 *     Identical names hash identically; distinct names hash to distinct tokens
 *     (collision-resistant), so two CJK names never collapse onto one path.
 * The `role-` prefix guarantees an ascii-leading, space-free segment, so the
 * result always matches idSchema (`^[a-zA-Z0-9][a-zA-Z0-9._:-]*$`).
 */
export function deriveStableRoleId(name: string): string {
  const slug = kebabSlug(name);
  return slug.length > 0 ? slug : `role-${fnv1aHex(name)}`;
}

/**
 * Derive a STABLE, UNIQUE, idSchema-safe id for a world from its resolved name.
 *
 * Unlike {@link deriveStableRoleId}, this must be DETERMINISTIC for the same
 * input: `resolveCreatedWorldId` re-derives the id from the goal as a fallback
 * and compares it against the `.agents/worlds/<id>/world.yaml` path the patch
 * wrote, so a process-counter token (non-deterministic across reloads) would
 * break that match. We instead hash the name:
 *   - ASCII names keep a readable kebab slug plus a short hash suffix so two
 *     names that slug-collide still get distinct ids ("Stock Council" ->
 *     world-stock-council-3a9f1c2e).
 *   - Chinese / non-ASCII names have no safe kebab slug, so we fall back to a
 *     pure hash token (赛博修真世界 -> world-7b41e90a). Distinct names hash to
 *     distinct tokens (collision-resistant); identical names hash identically.
 * The result always matches idSchema (`^[a-zA-Z0-9][a-zA-Z0-9._:-]*$`): the
 * `world-` prefix guarantees an ascii-leading, space-free, path-safe segment.
 */
export function deriveStableWorldId(name: string): string {
  const hash = fnv1aHex(name);
  const slug = kebabSlug(name);
  return slug.length > 0 ? `world-${slug}-${hash}` : `world-${hash}`;
}

/**
 * Lowercase a name into an ascii kebab slug, dropping every non-`[a-z0-9]` run to
 * a single hyphen and trimming edge hyphens. Returns an empty string when the
 * name has no ascii alphanumerics (e.g. a pure-CJK name), signalling the caller
 * to fall back to a hash token. Shared by the role and world id derivers so both
 * slug the same way.
 */
function kebabSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic FNV-1a 32-bit hash, rendered as a fixed 8-char lowercase hex
 * token. Stable across processes and platforms (depends only on the input
 * bytes), zero-dependency, and ascii — exactly what an id segment needs.
 */
function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 via Math.imul + >>> 0.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
