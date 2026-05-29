import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * The single desktop-messenger list row primitive, shared by conversations,
 * contacts/roles, worlds, and the account switcher (design.md "row grammar is
 * consistent across conversations, contacts, roles, groups, and worlds").
 *
 * Dense on desktop (56px) for scan-fast lists; selected/hover use tint fills,
 * not borders. An optional right-click context menu drives pin/unpin.
 */
export function ConversationRow({
  avatar,
  title,
  subtitle,
  timestamp,
  selected,
  pinned,
  unread,
  trailing,
  onSelect,
  onTogglePin,
  pinDisabled,
  testId,
  dataAttrs,
}: {
  avatar: ReactNode;
  title: string;
  subtitle?: string;
  timestamp?: string;
  selected?: boolean;
  pinned?: boolean;
  unread?: boolean;
  trailing?: ReactNode;
  onSelect: () => void;
  onTogglePin?: () => void;
  pinDisabled?: boolean;
  testId: string;
  dataAttrs?: Record<string, string>;
}) {
  const { t } = useI18n();

  const row = (
    <button
      className={cn(
        "relative flex h-14 w-full items-center gap-3 px-3 text-left transition hover:bg-[var(--realm-hover)] active:bg-[var(--realm-selected)]",
        selected && "bg-[var(--realm-selected)] hover:bg-[var(--realm-selected)]",
      )}
      data-pinned={pinned ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-testid={testId}
      onClick={onSelect}
      type="button"
      {...dataAttrs}
    >
      <span className="relative shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {pinned ? (
            <Pin aria-hidden="true" className="size-3 shrink-0 text-[var(--realm-fg-faint)]" />
          ) : null}
          <span className="truncate font-medium text-[14px] leading-[18px] text-[var(--realm-fg)]">
            {title}
          </span>
        </span>
        {subtitle ? (
          <span className="mt-[2px] block truncate text-[13px] leading-[17px] text-[var(--realm-fg-muted)]">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end justify-center gap-1">
        {timestamp ? (
          <span className="whitespace-nowrap text-[12px] text-[var(--realm-fg-faint)] tabular-nums">
            {timestamp}
          </span>
        ) : null}
        {unread ? (
          <span
            aria-label={t("workspace.unreadBadge")}
            className="size-2 rounded-full bg-[var(--realm-danger)]"
            data-testid={`${testId}-unread`}
            role="status"
          />
        ) : null}
        {trailing}
      </span>
    </button>
  );

  if (!onTogglePin) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          data-testid={`${testId}-pin-action`}
          disabled={pinDisabled}
          onSelect={onTogglePin}
        >
          {pinned ? t("workspace.unpin") : t("workspace.pin")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
