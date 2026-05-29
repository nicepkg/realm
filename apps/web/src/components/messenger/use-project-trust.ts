import { useCallback, useEffect, useState } from "react";
import type { RealmAppController } from "../../app/types.ts";

type TrustTier = "read-only" | "run-roles" | "elevated-tools";

type TrustState =
  | { status: "loading" }
  | { status: "ready"; tier: TrustTier }
  | { status: "error" };

/**
 * Read the effective project trust tier and expose a one-call elevation to
 * `run-roles`. The controller does not surface trust (it is computed by the
 * policy layer), so the composer reads it directly through the SDK — the same
 * `getEffectivePolicy` / `setTrust` path the World Manager uses. Centralized
 * here so the composer and the timeline share one source of truth (MC-2).
 *
 * `isReadOnly` is true ONLY when trust resolves to read-only. While loading or
 * on error we do NOT assume read-only, so a transient policy fetch never
 * silently locks an otherwise-usable composer.
 */
export function useProjectTrust(app: RealmAppController) {
  const { client } = app;
  const [trust, setTrust] = useState<TrustState>({ status: "loading" });
  const [raising, setRaising] = useState(false);
  const [raiseFailed, setRaiseFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const policy = await client.getEffectivePolicy();
      setTrust({ status: "ready", tier: policy.trustTier });
    } catch {
      setTrust({ status: "error" });
    }
  }, [client]);

  // Read on mount, then re-read whenever the realm reloads: a turn/send failure,
  // a god ruling, or an external `setTrust` can flip the tier under us. Keying on
  // the event count re-fetches after each reload so the gate never goes stale.
  // (eventCount is read here so it is a genuine effect dependency.)
  const eventCount = app.state.events.length;
  useEffect(() => {
    void eventCount;
    void refresh();
  }, [eventCount, refresh]);

  const raiseTrust = useCallback(async () => {
    setRaising(true);
    setRaiseFailed(false);
    try {
      const response = await client.setTrust("run-roles");
      setTrust({ status: "ready", tier: response.trustTier });
    } catch {
      setRaiseFailed(true);
    } finally {
      setRaising(false);
    }
  }, [client]);

  return {
    isReadOnly: trust.status === "ready" && trust.tier === "read-only",
    raiseFailed,
    raiseTrust,
    raising,
    tier: trust.status === "ready" ? trust.tier : undefined,
  };
}
