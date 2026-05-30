import type { RoleSummary } from "@realm/api-contract";
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
import { worldScopedRoles } from "@/state/use-god-chat-helpers.ts";
import { roomDisplayName, worldModeLabel } from "@/view-models/labels.ts";
import { roomTypeLabel } from "@/view-models/realm-view-model.ts";

/**
 * A palette role row: the role plus the name of its OWNING world when that name
 * is needed to disambiguate an otherwise-identical entry. `worldName` is only
 * populated in MANAGER mode for same-display-name collisions (e.g. two 云遥 that
 * live in different worlds); it stays undefined when the row is unambiguous.
 */
type PaletteRoleEntry = {
  role: RoleSummary;
  /** Owning world name, set ONLY to disambiguate a same-name collision. */
  worldName?: string;
};

/**
 * F1/F2 — resolve which roles the palette's 角色 + 发送身份 groups list, and how to
 * disambiguate them, keyed off the active-world scope.
 *
 * WORKSPACE mode: scope to the active world's MEMBERS via the SAME pure
 * `worldScopedRoles` source the context rail uses, so cross-world roles never
 * leak in (顾辰风/雷军 from 云岭 while standing in 赛博) and a duplicate display name
 * across worlds collapses to the single member that actually belongs here — no
 * world subtitle is needed because the scope already removes the ambiguity.
 *
 * MANAGER mode (no active world): keep the FULL project roster — that is the
 * point of the manager view — but when two roles share a display name, append
 * each one's owning-world name as a muted subtitle so the operator can tell the
 * 云岭 云遥 from the 赛博 云遥. Roles whose name is unique get no subtitle (no noise).
 *
 * Pure (no hooks, no `t`) so the scope + disambiguation semantics are unit-testable
 * and stay locked to /api/worlds membership rather than drifting in render code.
 */
export function resolvePaletteRoleEntries(
  app: RealmAppController,
  mode: "manager" | "workspace",
): PaletteRoleEntry[] {
  if (mode === "workspace") {
    // Active-world members only — identical source as the rail, so the palette
    // can never show a role the rail does not. Scoping alone kills the duplicate.
    const scoped = worldScopedRoles(app.state.roles, app.selectedWorld, app.selectedWorld?.id);
    return scoped.map((role) => ({ role }));
  }
  // Manager view: full roster, disambiguate same-name rows by owning world.
  const nameCounts = new Map<string, number>();
  for (const role of app.state.roles) {
    nameCounts.set(role.displayName, (nameCounts.get(role.displayName) ?? 0) + 1);
  }
  return app.state.roles.map((role) => {
    if ((nameCounts.get(role.displayName) ?? 0) <= 1) {
      return { role };
    }
    const owningWorld = app.state.worlds.find((world) => world.roleIds.includes(role.id));
    return { role, worldName: owningWorld?.name };
  });
}

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
  // F1/F2 — the SAME scoped+disambiguated role list feeds both the 角色 group and
  // the 发送身份 group so neither leaks cross-world roles nor lists indistinguishable
  // same-name duplicates. Computed once per render from the active-world scope.
  const roleEntries = resolvePaletteRoleEntries(app, mode);
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
              <CommandItem
                data-testid="command-back-to-worlds"
                value="back worlds manager"
                onSelect={() => runCommand(onBackToWorlds)}
              >
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
                {roleEntries.map(({ role, worldName }) => (
                  <CommandItem
                    data-testid={`command-send-as-${role.id}`}
                    key={role.id}
                    value={`send as identity ${role.id} ${role.displayName}${
                      worldName ? ` ${worldName}` : ""
                    }`}
                    onSelect={() => runCommand(() => requestIdentityChange(role.id))}
                  >
                    <Bot className="size-4" />
                    <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                      <span className="truncate">{role.displayName}</span>
                      {worldName ? (
                        <span
                          className="shrink-0 text-[12px] text-[var(--realm-fg-muted)]"
                          data-testid={`command-send-as-world-${role.id}`}
                        >
                          {t("command.roleInWorld")(worldName)}
                        </span>
                      ) : null}
                    </span>
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
            {roleEntries.map(({ role, worldName }) => (
              <CommandItem
                data-testid={`command-inspect-role-${role.id}`}
                key={role.id}
                value={`inspect role ${role.id} ${role.displayName} ${role.model}${
                  worldName ? ` ${worldName}` : ""
                }`}
                onSelect={() => runCommand(() => onInspectRole(role.id))}
              >
                <Bot className="size-4" />
                <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                  <span className="truncate">{role.displayName}</span>
                  {worldName ? (
                    <span
                      className="shrink-0 text-[12px] text-[var(--realm-fg-muted)]"
                      data-testid={`command-inspect-role-world-${role.id}`}
                    >
                      {t("command.roleInWorld")(worldName)}
                    </span>
                  ) : null}
                </span>
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
