import {
  ChevronDown,
  ContactRound,
  Menu,
  MessageCircle,
  PlusCircle,
  Settings2,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { RealmAppController } from "../../app/types.ts";
import { GroupAvatarGrid, IdentityAvatar, RoomAvatar } from "./messenger-primitives.tsx";

export function MessengerSidebar({
  app,
  onCreateRoom,
  onOpenSettings,
}: {
  app: RealmAppController;
  onCreateRoom: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const isChatSection = app.activeSection === "chats" || app.activeSection === "settings";
  const title =
    app.activeSection === "roles"
      ? t("workspace.contacts")
      : app.activeSection === "worlds"
        ? t("common.worlds")
        : t("workspace.chats");
  const sectionCount =
    app.activeSection === "roles"
      ? app.state.roles.length
      : app.activeSection === "worlds"
        ? app.state.worlds.length
        : app.conversations.length;
  const sectionCountLabel =
    app.activeSection === "roles"
      ? t("workspace.roleCount")
      : app.activeSection === "worlds"
        ? t("workspace.worldCount")
        : t("workspace.pinnedChats");

  return (
    <aside
      className="hidden min-h-0 flex-col border-[var(--realm-line)] border-r bg-[#f7f7f8] md:flex"
      data-testid="conversation-sidebar"
    >
      <header className="shrink-0 border-[var(--realm-line)] border-b bg-[#f7f7f8]">
        <div className="relative flex h-16 items-center justify-center px-4">
          <h2 className="flex max-w-[72%] items-center justify-center gap-2 truncate text-center font-semibold text-[18px] leading-6">
            {isChatSection ? (
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border-2 border-[#b9b9bd] border-t-transparent"
              />
            ) : null}
            <span className="truncate">{isChatSection ? t("workspace.receiving") : title}</span>
          </h2>
          <button
            aria-label={t("common.create")}
            className="absolute right-5 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--realm-fg)] transition hover:bg-white"
            data-testid="sidebar-create-room"
            onClick={onCreateRoom}
            type="button"
          >
            <PlusCircle className="size-[19px]" />
          </button>
        </div>
        <div className="flex h-[52px] items-center justify-between border-[var(--realm-line)] border-t bg-[#f2f2f4] px-6 text-[14px] text-[var(--realm-fg-muted)]">
          <span className="flex min-w-0 items-center gap-6">
            <Menu className="size-[19px] shrink-0 text-[#8a8a8f]" />
            <span className="truncate">
              {sectionCount} {sectionCountLabel}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#b0b0b3]" />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {app.activeSection === "roles" ? <RoleRows app={app} /> : null}
        {app.activeSection === "worlds" ? <WorldRows app={app} /> : null}
        {app.activeSection === "chats" || app.activeSection === "settings" ? (
          <ConversationRows app={app} />
        ) : null}
      </div>
      <SidebarTabBar app={app} onOpenSettings={onOpenSettings} />
    </aside>
  );
}

function ConversationRows({ app }: { app: RealmAppController }) {
  return (
    <div className="bg-white">
      {app.conversations.map((conversation) => (
        <button
          className={cn(
            "relative grid h-[76px] w-full grid-cols-[46px_minmax(0,1fr)_64px] items-center gap-4 px-6 text-left transition after:absolute after:right-0 after:bottom-0 after:left-[88px] after:h-px after:bg-[var(--realm-line)] hover:bg-[#f3f3f4]",
            conversation.id === app.selectedRoom?.id && "bg-[#e3e3e5]",
          )}
          data-testid={`room-${conversation.id}`}
          key={conversation.id}
          onClick={() => void app.selectRoom(conversation.id)}
          type="button"
        >
          <span className="relative">
            <RoomAvatar room={conversation.room} roles={app.state.roles} size="lg" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-[16px] leading-5 text-[#1f1f21]">
              {conversation.title}
            </span>
            <span className="mt-1.5 block truncate text-[14px] leading-[18px] text-[#9b9ba1]">
              {conversation.lastMessage || conversation.subtitle}
            </span>
          </span>
          <span className="flex h-full flex-col items-end justify-start gap-1 pt-[13px]">
            <span className="whitespace-nowrap text-right text-[12px] text-[#b5b5ba] tabular-nums">
              {conversation.timestamp}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function RoleRows({ app }: { app: RealmAppController }) {
  const { t } = useI18n();
  return (
    <div className="bg-white">
      {app.state.roles.map((role) => (
        <button
          className={cn(
            "relative grid h-[76px] w-full grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-4 px-6 text-left transition after:absolute after:right-0 after:bottom-0 after:left-[88px] after:h-px after:bg-[var(--realm-line)] hover:bg-[#f3f3f4]",
            role.id === app.runRoleId && "bg-[#e3e3e5]",
          )}
          key={role.id}
          onClick={() => app.setRunRoleId(role.id)}
          type="button"
        >
          <IdentityAvatar
            identity={role.id}
            label={role.displayName}
            roles={app.state.roles}
            size="lg"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-[16px] text-[#1f1f21]">
              {role.displayName}
            </span>
            <span className="mt-1.5 block truncate text-[14px] text-[#9b9ba1]">
              {role.model ?? t("common.default")} · {role.id}
            </span>
          </span>
          <span className="h-2 w-2 rounded-full bg-[#d1d1d6]" title={t("workspace.inspect")} />
        </button>
      ))}
    </div>
  );
}

function WorldRows({ app }: { app: RealmAppController }) {
  const { t } = useI18n();

  return (
    <div className="bg-white">
      {app.state.worlds.map((world) => (
        <button
          className={cn(
            "relative grid h-[76px] w-full grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-4 px-6 text-left transition after:absolute after:right-0 after:bottom-0 after:left-[88px] after:h-px after:bg-[var(--realm-line)] hover:bg-[#f3f3f4]",
            world.id === app.selectedWorld?.id && "bg-[#e3e3e5]",
          )}
          key={world.id}
          onClick={() => void app.selectWorld(world.id)}
          type="button"
        >
          <GroupAvatarGrid
            label={world.name}
            members={[
              { id: "owner", label: t("common.boss") },
              ...world.roleIds.map((roleId) => ({
                id: roleId,
                label: app.state.roles.find((role) => role.id === roleId)?.displayName ?? roleId,
              })),
            ]}
            size="lg"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-[16px] text-[#1f1f21]">
              {world.name}
            </span>
            <span className="mt-1.5 block truncate text-[14px] text-[#9b9ba1]">
              {world.mode.type} · {world.roleIds.length} {t("common.roles")}
            </span>
          </span>
          {world.id === app.selectedWorld?.id ? (
            <span className="size-2 rounded-full bg-[var(--realm-green)]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function SidebarTabBar({
  app,
  onOpenSettings,
}: {
  app: RealmAppController;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="grid h-[58px] shrink-0 grid-cols-4 border-[var(--realm-line)] border-t bg-[#f7f7f8]">
      <SidebarTab
        active={app.activeSection === "chats"}
        icon={<MessageCircle className="size-5" />}
        label={t("workspace.chats")}
        onClick={() => app.setActiveSection("chats")}
      />
      <SidebarTab
        active={app.activeSection === "roles"}
        icon={<ContactRound className="size-5" />}
        label={t("workspace.contacts")}
        onClick={() => app.setActiveSection("roles")}
      />
      <SidebarTab
        active={app.activeSection === "worlds"}
        icon={<UsersRound className="size-5" />}
        label={t("common.worlds")}
        onClick={() => app.setActiveSection("worlds")}
      />
      <SidebarTab
        active={app.activeSection === "settings"}
        icon={<Settings2 className="size-5" />}
        label={t("common.settings")}
        onClick={() => {
          app.setActiveSection("settings");
          onOpenSettings();
        }}
      />
    </nav>
  );
}

function SidebarTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] text-[var(--realm-fg-muted)] transition hover:bg-white",
        active && "text-[var(--realm-green-text)]",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
