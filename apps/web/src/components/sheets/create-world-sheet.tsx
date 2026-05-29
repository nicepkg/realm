import type { ConfigPatchProposal } from "@realm/api-contract";
import { FileText } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/index.tsx";
import type { StringMessageKey } from "@/i18n/messages.ts";
import { worldModeLabel } from "@/view-models/labels.ts";
import type {
  ConfigActionSheetKind,
  PatchAppliedHandler,
  PatchApplyResult,
  PatchRevisionInput,
  WorldMode,
} from "./config-action-types.ts";
import { PatchPreview } from "./patch-preview.tsx";

const WORLD_PRESETS = [
  {
    id: "cultivation",
    mode: "game",
    nameKey: "sheet.createWorld.preset.cultivation.title",
    roomNameKey: "sheet.createWorld.preset.cultivation.roomName",
  },
  {
    id: "workflow",
    mode: "workflow",
    nameKey: "sheet.createWorld.preset.workflow.title",
    roomNameKey: "sheet.createWorld.preset.workflow.roomName",
  },
  {
    id: "blank",
    mode: "sandbox",
    nameKey: "sheet.createWorld.preset.blank.title",
    roomNameKey: "sheet.createWorld.preset.blank.roomName",
  },
] as const satisfies Array<{
  id: "blank" | "cultivation" | "workflow";
  mode: WorldMode;
  nameKey: StringMessageKey;
  roomNameKey: StringMessageKey;
}>;

export function CreateWorldSheet({
  app,
  initialTab,
  onOpenChange,
  onPatchApplied,
  onWorldCreated,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  /**
   * Which tab the sheet opens on. The Manager threads this so its "Create World"
   * (preset) and "Import" buttons map 1:1 to a distinct landing tab instead of
   * firing the identical handler under different labels (mapping).
   */
  initialTab?: "import" | "preset";
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
  onPatchApplied: PatchAppliedHandler;
  onWorldCreated?: (worldId: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<WorldMode>("sandbox");
  const [roomName, setRoomName] = useState(() => t("workspace.allHands"));
  const [proposal, setProposal] = useState<ConfigPatchProposal | undefined>();
  const [busy, setBusy] = useState(false);
  // Which button kicked off the current async write, so only that control shows
  // its pending label + spinner (apply/revise feedback lives in PatchPreview).
  const [pending, setPending] = useState<"preview" | "import" | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [importTemplateId, setImportTemplateId] = useState("");
  const [importBody, setImportBody] = useState("");
  const worldId = slugify(name);
  const canPreview = Boolean(name.trim() && worldId);
  const canImport = Boolean(
    name.trim() && worldId && (importTemplateId.trim() || importBody.trim()),
  );

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPreview) {
      return;
    }
    setBusy(true);
    setPending("preview");
    setError(undefined);
    try {
      const response = await app.client.proposeWorld({
        id: worldId,
        mode,
        name: name.trim(),
        roleIds: app.state.roles.map((role) => role.id),
        roomName: roomName.trim() || t("workspace.allHands"),
      });
      setProposal(response.patch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }

  /**
   * Import path: route a template id or a pasted `.agents` template body through
   * the assistant proposal so it goes through the same reviewed patch-preview as
   * preset creation (validate → proposal → patch preview). Errors surface inline.
   */
  async function previewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canImport) {
      setError(t("sheet.createWorld.importInvalid"));
      return;
    }
    setBusy(true);
    setPending("import");
    setError(undefined);
    try {
      const goal = importBody.trim()
        ? `Create world "${name.trim()}" (id ${worldId}) from this .agents template:\n${importBody.trim()}`
        : `Create world "${name.trim()}" (id ${worldId}) from the template "${importTemplateId.trim()}".`;
      const response = await app.client.proposeAssistantConfig({ goal });
      setProposal(response.patch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }

  async function applyProposal(confirmation?: string): Promise<PatchApplyResult> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    setError(undefined);
    try {
      return await app.client.applyConfigPatch(proposal.id, { confirmation });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function reviseProposal(input: PatchRevisionInput): Promise<ConfigPatchProposal> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await app.client.reviseConfigPatch(proposal.id, input);
      setProposal(response.patch);
      return response.patch;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function finishWorldCreation(
    appliedProposal: ConfigPatchProposal,
    result: PatchApplyResult,
  ) {
    onPatchApplied(appliedProposal, result);
    await app.reload();
    await app.selectWorld(worldId);
    onWorldCreated?.(worldId);
    onOpenChange(undefined);
    setProposal(undefined);
    setName("");
    setRoomName(t("workspace.allHands"));
  }

  function applyPreset(preset: (typeof WORLD_PRESETS)[number]) {
    setName(t(preset.nameKey));
    setMode(preset.mode);
    setRoomName(t(preset.roomNameKey));
    setProposal(undefined);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen ? "create-world" : undefined)}
    >
      <SheetContent className="max-h-screen w-[480px] max-w-[94vw] overflow-y-auto border-[var(--realm-line)] bg-white">
        <SheetHeader>
          <SheetTitle>{t("sheet.createWorld.title")}</SheetTitle>
          <SheetDescription>{t("sheet.createWorld.description")}</SheetDescription>
        </SheetHeader>
        {/* `key` forces a fresh uncontrolled Tabs each time the sheet opens, so
         * the active tab honors the intent the caller threaded in (`initialTab`)
         * rather than sticking on whatever was last selected. */}
        <Tabs className="px-4" defaultValue={initialTab ?? "preset"} key={`${open}:${initialTab}`}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger data-testid="create-world-tab-preset" value="preset">
              {t("sheet.createWorld.tabPreset")}
            </TabsTrigger>
            <TabsTrigger data-testid="create-world-tab-import" value="import">
              {t("sheet.createWorld.tabImport")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="import">
            <form className="space-y-4 pt-3" onSubmit={previewImport}>
              <p className="text-[12px] text-[var(--realm-fg-muted)]">
                {t("sheet.createWorld.importHelp")}
              </p>
              <label className="block space-y-1" htmlFor="create-world-import-name">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createWorld.name")}
                </span>
                <Input
                  id="create-world-import-name"
                  autoComplete="off"
                  data-testid="create-world-import-name"
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  value={name}
                />
              </label>
              <label className="block space-y-1" htmlFor="create-world-import-template">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createWorld.importTemplateId")}
                </span>
                <Input
                  id="create-world-import-template"
                  autoComplete="off"
                  data-testid="create-world-import-template"
                  onChange={(event) => {
                    setImportTemplateId(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  value={importTemplateId}
                />
              </label>
              <label className="block space-y-1" htmlFor="create-world-import-body">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createWorld.importPaste")}
                </span>
                <textarea
                  id="create-world-import-body"
                  className="min-h-32 w-full resize-y rounded-[6px] border border-[var(--realm-line)] bg-[#fbfbfc] p-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[#07c160]"
                  data-testid="create-world-import-body"
                  onChange={(event) => {
                    setImportBody(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  spellCheck={false}
                  value={importBody}
                />
              </label>
              <Button
                data-testid="create-world-import-preview"
                disabled={!canImport || busy}
                type="submit"
              >
                {pending === "import" ? (
                  <Spinner data-testid="create-world-import-preview-spinner" />
                ) : (
                  <FileText className="size-4" />
                )}
                {pending === "import"
                  ? t("sheet.createWorld.previewing")
                  : t("sheet.createWorld.importValidate")}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="preset">
            <form className="space-y-4 pt-3" onSubmit={preview}>
              <section className="space-y-2" aria-label={t("sheet.createWorld.presets")}>
                <div className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createWorld.presets")}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {WORLD_PRESETS.map((preset) => (
                    <button
                      className="min-h-[82px] rounded-lg bg-[#f7f7f8] p-3 text-left transition hover:bg-[#eeeeef] focus-visible:outline-[#07c160]"
                      data-testid={`create-world-preset-${preset.id}`}
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      type="button"
                    >
                      <span className="block font-medium text-[13px] text-[var(--realm-fg)]">
                        {t(`sheet.createWorld.preset.${preset.id}.title`)}
                      </span>
                      <span className="mt-1 block text-[11px] text-[var(--realm-fg-muted)] leading-4">
                        {t(`sheet.createWorld.preset.${preset.id}.body`)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <label className="block space-y-1" htmlFor="create-world-name">
                <span className="text-[12px] text-[var(--realm-fg-muted)]">
                  {t("sheet.createWorld.name")}
                </span>
                <Input
                  id="create-world-name"
                  autoComplete="off"
                  data-testid="create-world-name"
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    setProposal(undefined);
                  }}
                  value={name}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1" htmlFor="create-world-mode">
                  <span className="text-[12px] text-[var(--realm-fg-muted)]">
                    {t("sheet.createWorld.mode")}
                  </span>
                  <Select value={mode} onValueChange={(value) => setMode(value as WorldMode)}>
                    <SelectTrigger id="create-world-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["sandbox", "workflow", "debate", "game", "simulation"].map((item) => (
                        <SelectItem key={item} value={item}>
                          {worldModeLabel(t, item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-1" htmlFor="create-world-room">
                  <span className="text-[12px] text-[var(--realm-fg-muted)]">
                    {t("sheet.createWorld.room")}
                  </span>
                  <Input
                    id="create-world-room"
                    autoComplete="off"
                    data-testid="create-world-room"
                    onChange={(event) => {
                      setRoomName(event.currentTarget.value);
                      setProposal(undefined);
                    }}
                    value={roomName}
                  />
                </label>
              </div>
              <div className="rounded-lg bg-[#f7f7f8] p-3 text-[12px] text-[var(--realm-fg-muted)]">
                <span className="font-medium text-[var(--realm-fg)]">
                  {t("sheet.createWorld.id")}
                </span>{" "}
                {worldId || "-"}
              </div>
              <Button
                data-testid="create-world-preview"
                disabled={!canPreview || busy}
                type="submit"
              >
                {pending === "preview" ? (
                  <Spinner data-testid="create-world-preview-spinner" />
                ) : (
                  <FileText className="size-4" />
                )}
                {pending === "preview"
                  ? t("sheet.createWorld.previewing")
                  : t("sheet.config.preview")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        {error ? (
          <div
            className="mx-4 mt-3 rounded-md bg-[#fff4e5] p-2 text-[#7a4a00] text-[12px]"
            data-testid="create-world-error"
          >
            <div className="font-medium">{t("sheet.createWorld.failed")}</div>
            <div>{error}</div>
          </div>
        ) : null}
        <PatchPreview
          busy={busy}
          proposal={proposal}
          onApplied={finishWorldCreation}
          onApply={applyProposal}
          onReject={() => setProposal(undefined)}
          onRevise={reviseProposal}
          onRollback={(historyId) => app.client.rollbackConfig(historyId)}
        />
      </SheetContent>
    </Sheet>
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
