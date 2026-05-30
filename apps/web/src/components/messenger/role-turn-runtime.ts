import { useEffect, useState } from "react";
import type { RealmAppController } from "../../app/types.ts";

/**
 * Live runtime kind backing role turns. `adapterKind === "fake"` means replies
 * are simulated by the deterministic mock adapter rather than a real provider —
 * the preview gate surfaces this so an operator never spends provider tokens (or
 * mistakes a mock reply for a real one) without knowing which runtime is active.
 *
 * The controller does not surface runtime info (it is a server-side fact), so
 * this reads it directly through the SDK — the same `getHealth` path the World
 * Manager uses (DISC-R2-5). It stays `undefined` while loading or on error so a
 * transient health fetch never mislabels the runtime; the dialog simply omits
 * the row until the truth is known.
 */
export function useRuntimeInfo(app: RealmAppController): { adapterKind: string } | undefined {
  const { client } = app;
  const [runtime, setRuntime] = useState<{ adapterKind: string } | undefined>(undefined);

  // Re-read whenever the realm reloads (a settings/provider change can flip the
  // active adapter under us), keyed on the event count like useProjectTrust.
  const eventCount = app.state.events.length;
  useEffect(() => {
    // eventCount is read here so it is a genuine effect dependency: re-fetch the
    // runtime after each realm reload (mirrors useProjectTrust).
    void eventCount;
    let cancelled = false;
    void client
      .getHealth()
      .then((health) => {
        if (!cancelled) {
          setRuntime(health.runtime);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntime(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, eventCount]);

  return runtime;
}
