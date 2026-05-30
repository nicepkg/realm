import { useCallback, useEffect, useState } from "react";
import type { TrustCapabilities } from "./trust-elevation-confirm-dialog.tsx";
import type { RealmAppController } from "./types.ts";

type TrustTier = "read-only" | "run-roles" | "elevated-tools";

type TrustState =
  | { status: "loading" }
  | { status: "ready"; tier: TrustTier }
  | { status: "error" };

/**
 * World Manager trust controller (EP-R2-2 / MC-R2-3). Owns the trust tier, the
 * confirmation-gate open state, the project.security-derived capabilities, and
 * the elevate / revert handlers. Extracted from the page so the elevation gate
 * and the revert path live in one tested unit and the page stays under budget.
 *
 * Elevation (read-only → run-roles) is the most security-sensitive write, so it
 * NEVER fires from `openTrustConfirm` — only an explicit `confirmTrust` calls
 * `setTrust('run-roles')`. Reverting only removes capability, so `revertTrust`
 * is a direct one-call drop with no confirmation (lowering is always safe).
 */
export function useWorldManagerTrust(app: RealmAppController, capabilities: TrustCapabilities) {
  const { client } = app;
  const [trust, setTrust] = useState<TrustState>({ status: "loading" });
  const [elevating, setElevating] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const policy = await client.getEffectivePolicy();
      setTrust({ status: "ready", tier: policy.trustTier });
    } catch {
      setTrust({ status: "error" });
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The banner action only opens the gate; it does not elevate.
  const openConfirm = useCallback(() => {
    setFailed(false);
    setConfirmOpen(true);
  }, []);

  const cancelConfirm = useCallback(() => setConfirmOpen(false), []);

  const confirmTrust = useCallback(async () => {
    setElevating(true);
    setFailed(false);
    try {
      const response = await client.setTrust("run-roles");
      setTrust({ status: "ready", tier: response.trustTier });
      setConfirmOpen(false);
    } catch {
      // Surface the error on the banner (still read-only) and close the dialog so
      // the user can retry from the same place (recovery).
      setFailed(true);
      setConfirmOpen(false);
    } finally {
      setElevating(false);
    }
  }, [client]);

  const revertTrust = useCallback(async () => {
    setReverting(true);
    setFailed(false);
    try {
      const response = await client.setTrust("read-only");
      setTrust({ status: "ready", tier: response.trustTier });
    } catch {
      setFailed(true);
    } finally {
      setReverting(false);
    }
  }, [client]);

  return {
    cancelConfirm,
    capabilities,
    confirmOpen,
    confirmTrust,
    elevating,
    failed,
    isReadOnly: trust.status === "ready" && trust.tier === "read-only",
    isReady: trust.status === "ready",
    openConfirm,
    revertTrust,
    reverting,
    tier: trust.status === "ready" ? trust.tier : undefined,
  };
}
