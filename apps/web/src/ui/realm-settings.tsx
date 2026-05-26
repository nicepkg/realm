import type { RealmHttpClient } from "@realm/client-sdk";
import type {
  ModelProviderConfig,
  ProjectConfig,
  SkillPolicy,
  UserConfig,
} from "@realm/config/schemas";
import { KeyRound, Save, Settings2, ShieldCheck, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

type SettingsSnapshot = Awaited<ReturnType<RealmHttpClient["getSettings"]>>;

export function SettingsPanel({
  client,
  onSaved,
}: {
  client: RealmHttpClient;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SettingsSnapshot | undefined>();
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setDraft(await client.getSettings());
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }

  async function saveUser() {
    if (!draft) {
      return;
    }
    await save(() => client.updateUserSettings(draft.user));
  }

  async function saveProject() {
    if (!draft) {
      return;
    }
    await save(() => client.updateProjectSettings(draft.project));
  }

  async function save(action: () => Promise<SettingsSnapshot>) {
    try {
      setStatus("saving");
      setDraft(await action());
      setStatus("ready");
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }

  if (!draft) {
    return (
      <section className="space-y-3" data-testid="settings-panel">
        <PanelTitle icon={<Settings2 size={16} aria-hidden="true" />} title="Settings" />
        <p className="text-sm text-zinc-500">
          {status === "error" ? (error ?? "Failed to load settings.") : "Loading settings..."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="settings-panel">
      <PanelTitle icon={<Settings2 size={16} aria-hidden="true" />} title="Settings" />
      {error ? <p className="text-realm-danger text-xs">{error}</p> : null}
      <UserSettingsForm
        user={draft.user}
        path={draft.paths.userConfigPath}
        saving={status === "saving"}
        onChange={(user) => setDraft({ ...draft, user })}
        onSave={saveUser}
      />
      <ProjectSettingsForm
        project={draft.project}
        path={draft.paths.projectConfigPath}
        saving={status === "saving"}
        onChange={(project) => setDraft({ ...draft, project })}
        onSave={saveProject}
      />
    </section>
  );
}

function UserSettingsForm({
  onChange,
  onSave,
  path,
  saving,
  user,
}: {
  user: UserConfig;
  path: string;
  saving: boolean;
  onChange: (user: UserConfig) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <PanelTitle icon={<KeyRound size={15} aria-hidden="true" />} title="User Models" />
      <p className="mt-2 truncate text-[11px] text-zinc-500">{path}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TextField
          label="Default provider"
          value={user.defaultProvider}
          onChange={(defaultProvider) => onChange({ ...user, defaultProvider })}
          testId="settings-default-provider"
        />
        <TextField
          label="Default model"
          value={user.defaultModel}
          onChange={(defaultModel) => onChange({ ...user, defaultModel })}
          testId="settings-default-model"
        />
      </div>
      <div className="mt-3 space-y-2">
        {user.providers.map((provider, index) => (
          <ProviderRow
            key={`${provider.id}-${index}`}
            provider={provider}
            onChange={(nextProvider) =>
              onChange({
                ...user,
                providers: replaceAt(user.providers, index, nextProvider),
              })
            }
            onRemove={() =>
              onChange({
                ...user,
                providers: user.providers.filter((_, candidate) => candidate !== index),
              })
            }
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange({ ...user, providers: [...user.providers, emptyProvider()] })}
          data-testid="settings-provider-add"
        >
          Add Provider
        </Button>
        <SaveButton saving={saving} onSave={onSave} testId="settings-user-save" />
      </div>
    </section>
  );
}

function ProjectSettingsForm({
  onChange,
  onSave,
  path,
  project,
  saving,
}: {
  project: ProjectConfig;
  path: string;
  saving: boolean;
  onChange: (project: ProjectConfig) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-md border border-realm-border bg-[#fafafa] p-3">
      <PanelTitle icon={<ShieldCheck size={15} aria-hidden="true" />} title="Project Policy" />
      <p className="mt-2 truncate text-[11px] text-zinc-500">{path}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TextField
          label="Project name"
          value={project.project.name}
          onChange={(name) => onChange({ ...project, project: { name } })}
          testId="settings-project-name"
        />
        <TextField
          label="Default world"
          value={project.defaults.world}
          onChange={(world) => onChange({ ...project, defaults: { ...project.defaults, world } })}
          testId="settings-default-world"
        />
      </div>
      <SecurityToggles
        project={project}
        onChange={(security) => onChange({ ...project, security })}
      />
      <SkillPolicyEditor
        title="Global skills"
        policy={project.skills.global}
        onChange={(global) => onChange({ ...project, skills: { ...project.skills, global } })}
      />
      <SkillPolicyEditor
        title="Project skills"
        policy={project.skills.project}
        onChange={(projectPolicy) =>
          onChange({ ...project, skills: { ...project.skills, project: projectPolicy } })
        }
      />
      <SaveButton saving={saving} onSave={onSave} testId="settings-project-save" />
    </section>
  );
}

function ProviderRow({
  onChange,
  onRemove,
  provider,
}: {
  provider: ModelProviderConfig;
  onChange: (provider: ModelProviderConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-realm-border bg-white p-2">
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Provider"
          value={provider.id}
          onChange={(id) => onChange({ ...provider, id })}
        />
        <TextField
          label="Key env"
          value={provider.apiKeyEnv ?? ""}
          onChange={(apiKeyEnv) => onChange(withOptional(provider, "apiKeyEnv", apiKeyEnv))}
        />
        <TextField
          label="Model"
          value={provider.defaultModel ?? ""}
          onChange={(defaultModel) =>
            onChange(withOptional(provider, "defaultModel", defaultModel))
          }
        />
        <TextField
          label="Base URL"
          value={provider.baseUrl ?? ""}
          onChange={(baseUrl) => onChange(withOptional(provider, "baseUrl", baseUrl))}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-2 text-zinc-600">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(event) => onChange({ ...provider, enabled: event.target.checked })}
          />
          Enabled
        </label>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function SecurityToggles({
  onChange,
  project,
}: {
  project: ProjectConfig;
  onChange: (security: ProjectConfig["security"]) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <PanelTitle icon={<Wifi size={15} aria-hidden="true" />} title="Runtime Access" />
      {securityFields.map(([key, label]) => (
        <label key={key} className="flex items-center justify-between text-sm">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(project.security[key])}
            onChange={(event) => onChange({ ...project.security, [key]: event.target.checked })}
            data-testid={securityTestIds[key]}
          />
        </label>
      ))}
    </div>
  );
}

const securityFields: Array<[keyof ProjectConfig["security"], string]> = [
  ["requireTrust", "Require trust"],
  ["allowProjectShellByDefault", "Project shell"],
  ["allowNetworkByDefault", "Network"],
];

const securityTestIds: Record<keyof ProjectConfig["security"], string> = {
  requireTrust: "settings-require-trust",
  allowProjectShellByDefault: "settings-project-shell",
  allowNetworkByDefault: "settings-network",
};

function SkillPolicyEditor({
  onChange,
  policy,
  title,
}: {
  title: string;
  policy?: SkillPolicy;
  onChange: (policy: SkillPolicy) => void;
}) {
  const current = policy ?? { mode: "blacklist", include: [], exclude: [] };
  return (
    <div className="mt-3 space-y-2">
      <div className="font-medium text-sm">{title}</div>
      <select
        className="w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm"
        value={current.mode}
        onChange={(event) =>
          onChange({ ...current, mode: event.target.value as SkillPolicy["mode"] })
        }
      >
        <option value="blacklist">Blacklist</option>
        <option value="allowlist">Allowlist</option>
      </select>
      <TextField
        label="Include"
        value={current.include.join(",")}
        onChange={(include) => onChange({ ...current, include: splitCsv(include) })}
      />
      <TextField
        label="Exclude"
        value={current.exclude.join(",")}
        onChange={(exclude) => onChange({ ...current, exclude: splitCsv(exclude) })}
      />
    </div>
  );
}

function TextField({
  label,
  onChange,
  testId,
  value,
}: {
  label: string;
  value: string;
  testId?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      />
    </label>
  );
}

function SaveButton({
  onSave,
  saving,
  testId,
}: {
  saving: boolean;
  testId: string;
  onSave: () => void;
}) {
  return (
    <Button size="sm" variant="primary" onClick={onSave} disabled={saving} data-testid={testId}>
      <Save size={14} aria-hidden="true" />
      {saving ? "Saving" : "Save"}
    </Button>
  );
}

function emptyProvider(): ModelProviderConfig {
  return { id: "custom", enabled: true };
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, candidate) => (candidate === index ? value : item));
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withOptional<K extends "apiKeyEnv" | "baseUrl" | "defaultModel">(
  provider: ModelProviderConfig,
  key: K,
  value: string,
): ModelProviderConfig {
  return value.trim() ? { ...provider, [key]: value.trim() } : omitKey(provider, key);
}

function omitKey<K extends keyof ModelProviderConfig>(
  provider: ModelProviderConfig,
  key: K,
): ModelProviderConfig {
  const next = { ...provider };
  delete next[key];
  return next;
}
