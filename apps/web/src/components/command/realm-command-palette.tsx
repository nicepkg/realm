import {
  ArrowLeft,
  Bot,
  ContactRound,
  MessageCircle,
  MessageCirclePlus,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { RealmAppController } from "@/app/types.ts";
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
  onOpenSettings: () => void;
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
  onOpenChange,
  onOpenSettings,
  open,
}: RealmCommandPaletteProps) {
  const { t } = useI18n();
  const runCommand = (command: () => void) => {
    command();
    onOpenChange(false);
  };
  const requestIdentityChange = (identity: string, label: string) => {
    if (identity === app.identity) {
      return;
    }
    if (identity === "owner") {
      app.setIdentity("owner");
      return;
    }
    if (
      window.confirm(`${t("workspace.takeoverConfirm")} ${label}. ${t("workspace.identityAudit")}`)
    ) {
      app.setIdentity(identity);
    }
  };

  return (
    <CommandDialog
      className="max-w-2xl border-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_48px_rgba(0,0,0,0.14)]"
      description={t("command.description")}
      open={open}
      title={t("command.title")}
      onOpenChange={onOpenChange}
    >
      <CommandInput placeholder={t("command.search")} />
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
            disabled={!app.selectedRole || app.turnStatus === "running"}
            value="run selected role turn"
            onSelect={() => runCommand(() => void app.runSelectedRoleTurn())}
          >
            <Play className="size-4" />
            <span>{t("command.runRole")}</span>
          </CommandItem>
          <CommandItem
            data-testid="command-open-god"
            value="request god adjudication"
            onSelect={() => runCommand(onOpenGod)}
          >
            <ShieldCheck className="size-4" />
            <span>{t("command.openGod")}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        {mode === "workspace" ? (
          <>
            <CommandGroup heading={t("command.group.sendAs")}>
              <CommandItem
                data-testid="command-send-as-owner"
                value="send as owner boss"
                onSelect={() => runCommand(() => requestIdentityChange("owner", t("common.boss")))}
              >
                <ContactRound className="size-4" />
                <span className="min-w-0 flex-1 truncate">{t("common.boss")}</span>
                {app.identity === "owner" ? (
                  <CommandShortcut>{t("common.active")}</CommandShortcut>
                ) : null}
              </CommandItem>
              {app.state.roles.map((role) => (
                <CommandItem
                  data-testid={`command-send-as-${role.id}`}
                  key={role.id}
                  value={`send as identity ${role.id} ${role.displayName}`}
                  onSelect={() =>
                    runCommand(() => requestIdentityChange(role.id, role.displayName))
                  }
                >
                  <Bot className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
                  <CommandShortcut>
                    {app.identity === role.id ? t("common.active") : role.id}
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
              <CommandShortcut>{world.mode.type}</CommandShortcut>
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
              <span className="min-w-0 flex-1 truncate">{room.name}</span>
              <CommandShortcut>{room.type}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={t("command.group.roles")}>
          {app.state.roles.map((role) => (
            <CommandItem
              key={role.id}
              value={`role ${role.id} ${role.displayName} ${role.model}`}
              onSelect={() =>
                runCommand(() => {
                  app.setRunRoleId(role.id);
                  app.setActiveSection("roles");
                  onEnterWorkspace(app.selectedWorld?.id);
                })
              }
            >
              <Bot className="size-4" />
              <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
              <CommandShortcut>{role.model ?? "default"}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
