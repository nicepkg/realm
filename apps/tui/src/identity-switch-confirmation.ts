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

export function decideIdentitySwitchConfirmation(input: string): "confirm" | "cancel" | "pending" {
  const normalized = input.trim().toLowerCase();
  if (normalized === "y" || normalized === "yes" || normalized === "confirm") {
    return "confirm";
  }
  if (normalized === "n" || normalized === "no" || normalized === "cancel") {
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
    dict.identitySwitchConfirmHint,
  ].join(" ");
}
