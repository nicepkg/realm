import type { RealmHttpClient } from "@realm/client-sdk";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

export function SettingsPortabilityPanel({
  client,
  onImported,
}: {
  client: RealmHttpClient;
  onImported: () => void;
}) {
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState<string | undefined>();

  async function exportSettings() {
    const exported = await client.exportSettings();
    setPayload(JSON.stringify({ user: exported.user, project: exported.project }, null, 2));
    setStatus("Exported without raw secrets.");
  }

  async function importSettings() {
    const imported = JSON.parse(payload) as unknown;
    await client.importSettings(imported as Parameters<RealmHttpClient["importSettings"]>[0]);
    setStatus("Imported settings.");
    onImported();
  }

  return (
    <section className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <PanelTitle icon={<Download size={15} aria-hidden="true" />} title="Import / Export" />
      <textarea
        className="mt-3 min-h-28 w-full resize-y rounded-md border border-realm-border bg-white px-2 py-1.5 font-mono text-[11px] text-zinc-800"
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        placeholder="Settings JSON without raw API keys"
        data-testid="settings-portability-json"
      />
      {status ? <p className="mt-2 text-[11px] text-zinc-500">{status}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={exportSettings}>
          <Download size={14} aria-hidden="true" />
          Export
        </Button>
        <Button size="sm" variant="primary" onClick={importSettings} disabled={!payload.trim()}>
          <Upload size={14} aria-hidden="true" />
          Import
        </Button>
      </div>
    </section>
  );
}
