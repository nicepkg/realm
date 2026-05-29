import type { RoleSummary } from "@realm/api-contract";
import type { TuiDictionary } from "./i18n.ts";

export type TuiPendingIdentitySwitch = {
  identity: string;
  identityLabel: string;
};

export function createIdentitySwitchConfirmation(
  identity: string,
  roles: RoleSummary[],
): TuiPendingIdentitySwitch | undefined {
  if (identity === "owner") {
    return undefined;
  }
  const role = roles.find((candidate) => candidate.id === identity);
  if (!role) {
    return undefined;
  }
  return {
    identity,
    identityLabel: role.displayName,
  };
}

/**
 * Identity takeover is a dangerous L2 action answered in the same composer
 * textbox used for normal chat. A bare "y"/"yes"/"confirm" — or a reflexive
 * line that happens to start with one — must NOT commit a takeover by
 * accidental Enter. Mirror the God-action bar: require typing the exact target
 * role id to confirm. Only an explicit n/no/cancel aborts; anything else stays
 * pending so stray chat never confirms.
 */
export function decideIdentitySwitchConfirmation(
  input: string,
  pending: TuiPendingIdentitySwitch,
): "confirm" | "cancel" | "pending" {
  const normalized = input.trim();
  if (normalized === pending.identity) {
    return "confirm";
  }
  const lower = normalized.toLowerCase();
  if (lower === "n" || lower === "no" || lower === "cancel") {
    return "cancel";
  }
  return "pending";
}

export function formatIdentitySwitchConfirmation(
  pending: TuiPendingIdentitySwitch,
  dict: TuiDictionary,
): string {
  return [
    dict.identitySwitchPrompt(pending.identityLabel, pending.identity),
    dict.identitySwitchOperatorNote,
    dict.confirmTypeRoleId(pending.identity),
  ].join(" ");
}
