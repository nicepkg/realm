import type { Room, WorldSummary } from "@realm/api-contract";
import {
  Command,
  ContactRound,
  FileClock,
  MessageCircle,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button.tsx";
import { cn } from "./cn.ts";
import type { ConversationRow } from "./realm-view-model.ts";

export type AppSection = "chats" | "roles" | "worlds" | "god" | "settings";

export function AppRail({
  activeSection,
  onSelectSection,
}: {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
}) {
  return (
    <nav
      aria-label="Realm navigation"
      className="hidden flex-col items-center border-realm-border border-r bg-[#ededee] py-3 md:flex"
      data-testid="app-rail"
    >
      <div className="mb-5 flex size-10 items-center justify-center rounded-md bg-realm-primary text-white">
        <Sparkles size={19} aria-hidden="true" />
      </div>
      <RailButton
        active={activeSection === "chats"}
        icon={<MessageCircle size={20} aria-hidden="true" />}
        label="Chats"
        onClick={() => onSelectSection("chats")}
      />
      <RailButton
        active={activeSection === "roles"}
        icon={<ContactRound size={20} aria-hidden="true" />}
        label="Roles"
        onClick={() => onSelectSection("roles")}
      />
      <RailButton
        active={activeSection === "worlds"}
        icon={<UsersRound size={20} aria-hidden="true" />}
        label="Worlds"
        onClick={() => onSelectSection("worlds")}
      />
      <RailButton
        active={activeSection === "god"}
        icon={<ShieldCheck size={20} aria-hidden="true" />}
        label="God"
        onClick={() => onSelectSection("god")}
      />
      <div className="mt-auto">
        <RailButton
          active={activeSection === "settings"}
          icon={<Settings size={20} aria-hidden="true" />}
          label="Settings"
          onClick={() => onSelectSection("settings")}
        />
      </div>
    </nav>
  );
}

export function ConversationHeader({ projectName }: { projectName: string }) {
  return (
    <header className="border-realm-border border-b bg-[#f7f7f8] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-[15px]">{projectName}</div>
          <div className="truncate text-xs text-zinc-500">Local Realm project</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open command palette"
          data-testid="command-palette"
        >
          <Command size={16} aria-hidden="true" />
        </Button>
      </div>
      <label className="mt-3 flex h-9 items-center gap-2 rounded-md bg-white px-3 text-zinc-500 text-sm">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search conversations</span>
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
          placeholder="Search"
          data-testid="conversation-search"
        />
      </label>
    </header>
  );
}

export function WorldSwitcher({
  onSelectWorld,
  selectedWorldId,
  worlds,
}: {
  onSelectWorld: (worldId: string) => void;
  selectedWorldId?: string;
  worlds: WorldSummary[];
}) {
  return (
    <section className="border-realm-border border-b px-3 py-3" data-testid="world-switcher">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
        <span>Worlds</span>
        <Button variant="ghost" size="sm" aria-label="Create world">
          <Plus size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="space-y-1">
        {worlds.map((world) => (
          <button
            type="button"
            key={world.id}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-white",
              world.id === selectedWorldId && "bg-white text-realm-primary",
            )}
            data-testid={`world-${world.id}`}
            onClick={() => void onSelectWorld(world.id)}
          >
            <span className="size-2 rounded-full bg-realm-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{world.name}</span>
            <span className="text-[11px] text-zinc-400">{world.mode.type}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ConversationList({
  conversations,
  onSelectRoom,
  selectedRoomId,
}: {
  conversations: ConversationRow[];
  selectedRoomId?: string;
  onSelectRoom: (roomId: string) => void;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-auto" data-testid="conversation-list">
      {conversations.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">No conversations yet.</div>
      ) : (
        conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={cn(
              "flex w-full gap-3 border-realm-border border-b px-4 py-3 text-left transition-colors hover:bg-white",
              conversation.id === selectedRoomId && "bg-white",
            )}
            data-testid={`room-${conversation.id}`}
            onClick={() => void onSelectRoom(conversation.id)}
          >
            <RoomIcon room={conversation.room} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {conversation.title}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">{conversation.timestamp}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600">
                  {conversation.badge}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                  {conversation.lastMessage || conversation.subtitle}
                </span>
              </div>
            </div>
          </button>
        ))
      )}
    </section>
  );
}

function RailButton({
  active,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "mb-2 flex size-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white hover:text-zinc-950",
        active && "bg-white text-realm-primary shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      )}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function RoomIcon({ room }: { room: Room }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-zinc-500",
        room.type === "world-main" && "bg-realm-primary text-white",
        room.type === "god-channel" && "bg-zinc-900 text-white",
      )}
    >
      {iconForRoomType(room.type)}
    </div>
  );
}

function iconForRoomType(type: Room["type"]): ReactNode {
  if (type === "world-main") {
    return <UsersRound size={18} aria-hidden="true" />;
  }
  if (type === "dm") {
    return <ContactRound size={18} aria-hidden="true" />;
  }
  if (type === "god-channel") {
    return <ShieldCheck size={18} aria-hidden="true" />;
  }
  if (type === "system") {
    return <FileClock size={18} aria-hidden="true" />;
  }
  return <MessageSquareText size={18} aria-hidden="true" />;
}
