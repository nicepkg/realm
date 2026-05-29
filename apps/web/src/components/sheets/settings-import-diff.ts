import type { RealmAppController } from "@/app/types.ts";
import type { SettingsSnapshot } from "@/view-models/settings-view-model.ts";

/**
 * The shape returned by the settings export endpoint. Importing accepts the
 * same `{ project, user }` slice; the server is the source of truth for full
 * validation, so this stays a structural alias rather than re-deriving zod.
 */
export type ExportBundle = Awaited<ReturnType<RealmAppController["client"]["exportSettings"]>>;

type ImportBundle = Pick<ExportBundle, "project" | "user">;

/**
 * High-risk top-level policy sections that an import can silently overwrite.
 * `network` / `projectShell` / `requireTrust` live under project.security;
 * `provider` covers the user default provider + the provider roster.
 */
export type PolicySectionKey = "network" | "projectShell" | "requireTrust" | "provider";

/**
 * Parse a pasted export bundle. Accepts the full export envelope or a bare
 * `{ project, user }` object. Throwing here keeps the caller's error box as the
 * single failure surface; the server still re-validates the full shape on apply.
 */
export function parseImportBundle(raw: string): ImportBundle {
  const parsed = JSON.parse(raw) as Partial<ImportBundle>;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid settings bundle");
  }
  return {
    project: parsed.project as ImportBundle["project"],
    user: parsed.user as ImportBundle["user"],
  };
}

/**
 * Diff the parsed bundle against the live snapshot and return the high-risk
 * sections whose effective value would change. A section is only flagged when
 * the bundle actually carries that field AND it differs from current — a bundle
 * that omits a field cannot change it, so it is never reported.
 */
export function computeAffectedPolicySections(
  current: SettingsSnapshot,
  bundle: ImportBundle,
): PolicySectionKey[] {
  const affected: PolicySectionKey[] = [];
  const nextSecurity = bundle.project?.security;
  const currentSecurity = current.project.security;

  if (
    nextSecurity?.allowNetworkByDefault !== undefined &&
    nextSecurity.allowNetworkByDefault !== currentSecurity.allowNetworkByDefault
  ) {
    affected.push("network");
  }
  if (
    nextSecurity?.allowProjectShellByDefault !== undefined &&
    nextSecurity.allowProjectShellByDefault !== currentSecurity.allowProjectShellByDefault
  ) {
    affected.push("projectShell");
  }
  if (
    nextSecurity?.requireTrust !== undefined &&
    nextSecurity.requireTrust !== currentSecurity.requireTrust
  ) {
    affected.push("requireTrust");
  }
  if (providerChanged(current, bundle.user)) {
    affected.push("provider");
  }
  return affected;
}

/**
 * Provider is "changed" when the default provider flips or the provider roster
 * (ids + key envs + default models + enabled flags) differs. Order-insensitive
 * comparison via a stable serialized signature.
 */
function providerChanged(current: SettingsSnapshot, nextUser: ImportBundle["user"]): boolean {
  if (!nextUser) {
    return false;
  }
  if (
    nextUser.defaultProvider !== undefined &&
    nextUser.defaultProvider !== current.user.defaultProvider
  ) {
    return true;
  }
  if (nextUser.defaultModel !== undefined && nextUser.defaultModel !== current.user.defaultModel) {
    return true;
  }
  if (nextUser.providers !== undefined) {
    return (
      providerRosterSignature(nextUser.providers) !==
      providerRosterSignature(current.user.providers)
    );
  }
  return false;
}

function providerRosterSignature(providers: SettingsSnapshot["user"]["providers"]): string {
  return providers
    .map((p) =>
      JSON.stringify({
        id: p.id,
        apiKeyEnv: p.apiKeyEnv ?? null,
        baseUrl: p.baseUrl ?? null,
        defaultModel: p.defaultModel ?? null,
        displayName: p.displayName ?? null,
        enabled: p.enabled,
      }),
    )
    .sort()
    .join("|");
}

export function affectsHighRiskPolicy(affected: PolicySectionKey[]): boolean {
  return affected.length > 0;
}
