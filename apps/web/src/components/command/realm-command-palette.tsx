import {
  ArrowLeft,
  Bot,
  ContactRound,
  Database,
  MessageCircle,
  MessageCirclePlus,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import type { RealmAppController } from "@/app/types.ts";
import { canRunRoleTurn, runTurnBlockReason } from "@/components/messenger/role-turn-action.tsx";
import { TakeoverConfirmDialog } from "@/components/messenger/takeover-confirm-dialog.tsx";
import { useProjectTrust } from "@/components/messenger/use-project-trust.ts";
import { CreateRoleSheet } from "@/components/sheets/create-role-sheet.tsx";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useI18n } from "@/i18n/index.tsx";
import { roomDisplayName, worldModeLabel } from "@/view-models/labels.ts";
import { roomTypeLabel } from "@/view-models/realm-view-model.ts";

type RealmCommandPaletteProps = {
  app: RealmAppController;
  mode: "manager" | "workspace";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskAssistant: () => void;
  onEnterWorkspace: (worldId?: string) => void;
  onBackToWorlds: () => void;
  onCreateRoom: () => void;
  onCreateWorld: () => void;
  onOpenGod: () => void;
  onOpenWorldInspector: () => void;
  onInspectRole: (roleId: string) => void;
  onOpenSettings: () => void;
  onRequestRunTurn: () => void;
};

export function RealmCommandPalette({
  app,
  mode,
  onAskAssistant,
  onBackToWorlds,
  onCreateRoom,
  onCreateWorld,
  onEnterWorkspace,
  onOpenGod,
  onOpenWorldInspector,
  onOpenChange,
  onInspectRole,
  onOpenSettings,
  onRequestRunTurn,
  open,
}: RealmCommandPaletteProps) {
  const { t, locale } = useI18n();
  const [pendingRoleId, setPendingRoleId] = useState<string | undefined>();
  // The palette mounts its own Role Builder so "Create role" opens the same
  // reviewed CreateRoleSheet flow without threading a page prop (R6-2).
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const runCommand = (command: () => void) => {
    command();
    onOpenChange(false);
  };
  // The palette enforces the EXACT same run gate as the composer (role + room +
  // world present, not running, not read-only, role is a room member) so a
  // command-palette run can never start a turn the composer would have blocked
  // (MC6-2 + Don Norman: constraints). When blocked, the reason is shown inline.
  const trust = useProjectTrust(app);
  const canRunTurn = canRunRoleTurn(app, trust.isReadOnly);
  const runBlockReason = runTurnBlockReason(app, trust.isReadOnly, locale);
  // DISC-R7-5: name the resolved role on the run command so the operator confirms
  // WHOSE turn before the preview opens — the same named-target mental model the
  // composer row and empty CTA use. Falls back to the bare verb when no role is
  // resolved (the command is gated/disabled in that state anyway).
  const runTurnLabel = app.selectedRole
    ? t("workspace.runTurnCommand")(app.selectedRole.displayName)
    : t("command.runRole");
  // The palette must never direct-execute a turn — it is the most Enter-driven
  // surface in the app. Selecting "run role" closes the palette and asks the
  // shell to surface the SHARED run-turn preview, routing through the exact same
  // confirmation gate the composer uses (MC3-1 + Don Norman: error prevention).
  // The preview MUST live above the palette: the palette is unmounted while
  // closed, so a preview owned here would be torn down before it could render.
  const openRunPreview = () => {
    if (!canRunTurn || !app.selectedRole || !app.selectedRoom || !app.selectedWorld) {
      return;
    }
    // Close the palette first, then surface the preview, so the operator sees a
    // single focused confirmation rather than a dialog stacked over the palette.
    onOpenChange(false);
    onRequestRunTurn();
  };
  // Switching account from the palette mirrors the WeChat-style account switch:
  // it re-renders the whole messenger from that account's perspective. Boss
  // remains the audited real operator when a role account is chosen. Returning
  // to the owner is always safe, but taking over a role is an L2 dangerous
  // action, so it routes through the SAME gated dialog every other surface uses
  // (no more bare window.confirm with diverging copy).
  const requestIdentityChange = (identity: string) => {
    if (identity === app.viewerIdentity) {
      return;
    }
    if (identity === "owner") {
      app.setViewerIdentity("owner");
      return;
    }
    setPendingRoleId(identity);
  };

  return (
    <>
      <CommandDialog
        className="max-w-2xl border-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_48px_rgba(0,0,0,0.14)]"
        description={t("command.description")}
        open={open}
        title={t("command.title")}
        onOpenChange={onOpenChange}
      >
        <CommandInput data-testid="command-palette-input" placeholder={t("command.search")} />
        <CommandList className="max-h-[480px]">
          <CommandEmpty>{t("command.empty")}</CommandEmpty>
          <CommandGroup heading={t("command.group.navigation")}>
            {mode === "workspace" ? (
              <CommandItem value="back worlds manager" onSelect={() => runCommand(onBackToWorlds)}>
                <ArrowLeft className="size-4" />
                <span>{t("command.backToManager")}</span>
              </CommandItem>
            ) : null}
            <CommandItem
              value="open chats conversations"
              onSelect={() =>
                runCommand(() => {
                  app.setActiveSection("chats");
                  onEnterWorkspace(app.selectedWorld?.id);
                })
              }
            >
              <MessageCircle className="size-4" />
              <span>{t("command.openChats")}</span>
            </CommandItem>
            <CommandItem
              value="open roles contacts"
              onSelect={() =>
                runCommand(() => {
                  app.setActiveSection("roles");
                  onEnterWorkspace(app.selectedWorld?.id);
                })
              }
            >
              <ContactRound className="size-4" />
              <span>{t("command.openRoles")}</span>
            </CommandItem>
            <CommandItem
              value="open worlds"
              onSelect={() =>
                runCommand(() => {
                  app.setActiveSection("worlds");
                  onEnterWorkspace(app.selectedWorld?.id);
                })
              }
            >
              <UsersRound className="size-4" />
              <span>{t("command.openWorlds")}</span>
            </CommandItem>
            <CommandItem
              data-testid="command-open-settings"
              value="open settings"
              onSelect={() =>
                runCommand(() => {
                  onOpenSettings();
                })
              }
            >
              <Settings className="size-4" />
              <span>{t("command.openSettings")}</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading={t("command.group.actions")}>
            <CommandItem
              value="create world new workspace"
              onSelect={() => runCommand(onCreateWorld)}
            >
              <Plus className="size-4" />
              <span>{t("command.createWorld")}</span>
            </CommandItem>
            <CommandItem
              data-testid="command-ask-assistant"
              value="ask assistant config proposal"
              onSelect={() => runCommand(onAskAssistant)}
            >
              <Sparkles className="size-4" />
              <span>{t("command.askAssistant")}</span>
            </CommandItem>
            <CommandItem
              value="create room conversation group dm"
              onSelect={() => runCommand(onCreateRoom)}
            >
              <MessageCirclePlus className="size-4" />
              <span>{t("command.createRoom")}</span>
            </CommandItem>
            <CommandItem
              data-testid="command-create-role"
              value="create role agent character"
              onSelect={() =>
                runCommand(() => {
                  setCreateRoleOpen(true);
                })
              }
            >
              <UserPlus className="size-4" />
              <span>{t("command.createRole")}</span>
            </CommandItem>
            <CommandItem
              data-testid="command-run-role"
              disabled={!canRunTurn}
              value="run selected role turn"
              onSelect={openRunPreview}
            >
              <Play className="size-4" />
              <span className="min-w-0 flex-1 truncate">{runTurnLabel}</span>
              {!canRunTurn && runBlockReason ? (
                <span
                  className="truncate text-[12px] text-[var(--realm-fg-muted)]"
                  data-testid="command-run-role-reason"
                >
                  {runBlockReason}
                </span>
              ) : null}
            </CommandItem>
            <CommandItem
              data-testid="command-open-god"
              value="request god adjudication"
              onSelect={() => runCommand(onOpenGod)}
            >
              <ShieldCheck className="size-4" />
              <span>{t("command.openGod")}</span>
            </CommandItem>
            <CommandItem
              data-testid="command-open-world-inspector"
              value="open world state event inspector"
              onSelect={() => runCommand(onOpenWorldInspector)}
            >
              <Database className="size-4" />
              <span>{t("command.openInspector")}</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          {mode === "workspace" ? (
            <>
              <CommandGroup heading={t("command.group.sendAs")}>
                <CommandItem
                  data-testid="command-send-as-owner"
                  value="send as owner boss"
                  onSelect={() => runCommand(() => requestIdentityChange("owner"))}
                >
                  <ContactRound className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{t("common.boss")}</span>
                  {app.viewerIdentity === "owner" ? (
                    <CommandShortcut>{t("common.active")}</CommandShortcut>
                  ) : null}
                </CommandItem>
                {app.state.roles.map((role) => (
                  <CommandItem
                    data-testid={`command-send-as-${role.id}`}
                    key={role.id}
                    value={`send as identity ${role.id} ${role.displayName}`}
                    onSelect={() => runCommand(() => requestIdentityChange(role.id))}
                  >
                    <Bot className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
                    <CommandShortcut>
                      {app.viewerIdentity === role.id ? t("common.active") : role.id}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          <CommandGroup heading={t("command.group.worlds")}>
            {app.state.worlds.map((world) => (
              <CommandItem
                key={world.id}
                value={`world ${world.id} ${world.name} ${world.mode.type}`}
                onSelect={() =>
                  runCommand(() => {
                    void app.selectWorld(world.id);
                    onEnterWorkspace(world.id);
                  })
                }
              >
                <UsersRound className="size-4" />
                <span className="min-w-0 flex-1 truncate">{world.name}</span>
                <CommandShortcut>{worldModeLabel(t, world.mode.type)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading={t("command.group.rooms")}>
            {app.state.rooms.map((room) => (
              <CommandItem
                key={room.id}
                value={`room ${room.id} ${room.name} ${room.type}`}
                onSelect={() =>
                  runCommand(() => {
                    void app.selectRoom(room.id);
                    app.setActiveSection("chats");
                    onEnterWorkspace(app.selectedWorld?.id);
                  })
                }
              >
                <MessageCircle className="size-4" />
                <span className="min-w-0 flex-1 truncate">{roomDisplayName(t, room)}</span>
                <CommandShortcut>{roomTypeLabel(t, room.type)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading={t("command.group.roles")}>
            {app.state.roles.map((role) => (
              <CommandItem
                data-testid={`command-inspect-role-${role.id}`}
                key={role.id}
                value={`inspect role ${role.id} ${role.displayName} ${role.model}`}
                onSelect={() => runCommand(() => onInspectRole(role.id))}
              >
                <Bot className="size-4" />
                <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
                <CommandShortcut>{role.model ?? t("common.default")}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <TakeoverConfirmDialog
        app={app}
        onCancel={() => setPendingRoleId(undefined)}
        onConfirm={(id) => {
          app.setViewerIdentity(id);
          setPendingRoleId(undefined);
        }}
        pendingRoleId={pendingRoleId}
      />
      <CreateRoleSheet
        app={app}
        onOpenChange={setCreateRoleOpen}
        onPatchApplied={() => undefined}
        open={createRoleOpen}
      />
    </>
  );
}
