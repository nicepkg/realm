import type { Message, RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import { PanelRight, Send, Settings } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "./button.tsx";
import { cn } from "./cn.ts";
import { Avatar, SystemBanner } from "./realm-atoms.tsx";
import { displayNameForIdentity, turnStatusLabel } from "./realm-view-model.ts";

export function ChatHeader({
  onOpenSettings,
  roleCount,
  room,
  turnStatus,
  world,
}: {
  onOpenSettings: () => void;
  roleCount: number;
  room?: Room;
  turnStatus: "idle" | "running" | "error";
  world?: WorldSummary;
}) {
  return (
    <header className="flex h-[65px] items-center justify-between border-realm-border border-b bg-white px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-semibold text-[16px]">{room?.name ?? "No conversation"}</h1>
          {room?.type === "world-main" ? (
            <span className="rounded bg-realm-primary/10 px-1.5 py-0.5 text-[11px] text-realm-primary">
              all-member
            </span>
          ) : null}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">
          {world?.name ?? "Loading"} · {roleCount} roles · {turnStatusLabel(turnStatus)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" aria-label="Open room details">
          <PanelRight size={17} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          aria-label="Open settings"
          data-testid="settings-button"
          onClick={onOpenSettings}
        >
          <Settings size={17} aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

export function MessageTimeline({
  error,
  messages,
  roles,
  status,
}: {
  error?: string;
  messages: Message[];
  roles: RoleSummary[];
  status: "loading" | "ready" | "error";
}) {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto px-6 py-5" data-testid="chat-stream">
      {status === "error" ? (
        <SystemBanner title="Project error" body={error ?? "Unknown error"} />
      ) : null}
      {status === "loading" ? (
        <SystemBanner title="Loading" body="Opening local Realm project." />
      ) : null}
      {messages.length === 0 && status === "ready" ? (
        <SystemBanner
          title="Ready"
          body="Send a message in this room to start the world conversation."
        />
      ) : null}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} roles={roles} />
      ))}
    </div>
  );
}

export function MessageComposer({
  disabled,
  draft,
  identities,
  identity,
  onDraftChange,
  onIdentityChange,
  onSubmit,
}: {
  disabled: boolean;
  draft: string;
  identities: string[];
  identity: string;
  onDraftChange: (value: string) => void;
  onIdentityChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <footer className="border-realm-border border-t bg-white px-5 py-3" data-testid="composer">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">Speaking as</span>
            <select
              className="h-7 rounded-md border border-realm-border bg-white px-2 text-zinc-800"
              value={identity}
              onChange={(event) => onIdentityChange(event.target.value)}
              data-testid="identity-select"
            >
              {identities.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <span className="hidden sm:inline">Impersonation is audit-visible.</span>
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-realm-border bg-[#fafafa] px-3 py-2 text-sm"
            placeholder="@all 今天谁先行动？"
            aria-label="Message"
            data-testid="message-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <Button variant="primary" data-testid="send-message" disabled={disabled || !draft.trim()}>
            <Send size={16} aria-hidden="true" />
            Send
          </Button>
        </div>
      </form>
    </footer>
  );
}

function MessageBubble({ message, roles }: { message: Message; roles: RoleSummary[] }) {
  const authorLabel = displayNameForIdentity(message.displayedAuthorId, roles);
  const isOwner = message.displayedAuthorId === "owner";
  const isGod = message.displayedAuthorId === "god";
  if (isGod) {
    return (
      <article className="mx-auto max-w-[760px] rounded-md bg-zinc-200/70 px-3 py-2 text-center text-xs text-zinc-600">
        <span className="font-medium">God</span>: {message.content}
      </article>
    );
  }
  return (
    <article
      className={cn("flex gap-3", isOwner && "flex-row-reverse")}
      data-testid={`message-${message.id}`}
    >
      <Avatar label={authorLabel} tone={isOwner ? "owner" : "role"} />
      <div className={cn("max-w-[72%]", isOwner && "items-end text-right")}>
        <div
          className={cn(
            "mb-1 flex items-center gap-2 text-xs text-zinc-500",
            isOwner && "justify-end",
          )}
        >
          <span>{authorLabel}</span>
          {message.realOperatorId ? <span>via {message.realOperatorId}</span> : null}
          <time>{formatMessageTime(message.createdAt)}</time>
        </div>
        <div
          className={cn(
            "rounded-md px-3 py-2 text-left text-sm leading-6 shadow-[0_1px_1px_rgba(0,0,0,0.03)]",
            isOwner ? "bg-realm-primary text-white" : "bg-white text-zinc-950",
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </article>
  );
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
