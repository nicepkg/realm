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
import { useI18n } from "@/i18n/index.tsx";
import type {
  ConfigActionSheetKind,
  PatchAppliedHandler,
  PatchApplyResult,
  WorldMode,
} from "./config-action-types.ts";
import { PatchPreview } from "./patch-preview.tsx";

const WORLD_PRESETS = [
  {
    id: "cultivation",
    mode: "game",
    name: "Cultivation Demo",
    roomName: "All Hands",
  },
  {
    id: "workflow",
    mode: "workflow",
    name: "Software Team",
    roomName: "Standup",
  },
  {
    id: "blank",
    mode: "sandbox",
    name: "Blank Sandbox",
    roomName: "All Hands",
  },
] as const satisfies Array<{
  id: "blank" | "cultivation" | "workflow";
  mode: WorldMode;
  name: string;
  roomName: string;
}>;

export function CreateWorldSheet({
  app,
  onOpenChange,
  onPatchApplied,
  onWorldCreated,
  open,
}: {
  app: RealmAppController;
  open: boolean;
  onOpenChange: (open: ConfigActionSheetKind | undefined) => void;
  onPatchApplied: PatchAppliedHandler;
  onWorldCreated?: (worldId: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<WorldMode>("sandbox");
  const [roomName, setRoomName] = useState("All Hands");
  const [proposal, setProposal] = useState<ConfigPatchProposal | undefined>();
  const [busy, setBusy] = useState(false);
  const worldId = slugify(name);
  const canPreview = Boolean(name.trim() && worldId);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPreview) {
      return;
    }
    setBusy(true);
    try {
      const response = await app.client.proposeWorld({
        id: worldId,
        mode,
        name: name.trim(),
        roleIds: app.state.roles.map((role) => role.id),
        roomName: roomName.trim() || "All Hands",
      });
      setProposal(response.patch);
    } finally {
      setBusy(false);
    }
  }

  async function applyProposal(confirmation?: string): Promise<PatchApplyResult> {
    if (!proposal) {
      throw new Error("No proposal loaded.");
    }
    setBusy(true);
    try {
      return await app.client.applyConfigPatch(proposal.id, { confirmation });
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
    setRoomName("All Hands");
  }

  function applyPreset(preset: (typeof WORLD_PRESETS)[number]) {
    setName(preset.name);
    setMode(preset.mode);
    setRoomName(preset.roomName);
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
        <form className="space-y-4 px-4" onSubmit={preview}>
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
                      {item}
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
            <span className="font-medium text-[var(--realm-fg)]">{t("sheet.createWorld.id")}</span>{" "}
            {worldId || "-"}
          </div>
          <Button data-testid="create-world-preview" disabled={!canPreview || busy} type="submit">
            <FileText className="size-4" />
            {t("sheet.config.preview")}
          </Button>
        </form>
        <PatchPreview
          busy={busy}
          proposal={proposal}
          onApplied={finishWorldCreation}
          onApply={applyProposal}
          onReject={() => setProposal(undefined)}
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
