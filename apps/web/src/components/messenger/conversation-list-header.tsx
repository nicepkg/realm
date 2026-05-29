import { Boxes, MessageCirclePlus, Plus, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/index.tsx";

/**
 * Conversation-list header: section title, a search box, and a right-aligned
 * "+" create menu (new private chat / new group / create world). Fixes the
 * "New group hidden" / "create entry in the wrong place" complaints.
 */
export function ConversationListHeader({
  title,
  search,
  onSearchChange,
  onNewDm,
  onNewGroup,
  onCreateWorld,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  onNewDm: () => void;
  onNewGroup: () => void;
  onCreateWorld: () => void;
}) {
  const { t } = useI18n();
  return (
    <header
      className="shrink-0 border-[var(--realm-line)] border-b px-3 pt-3 pb-2"
      data-testid="conversation-list-header"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate font-semibold text-[16px] text-[var(--realm-fg)]">{title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("workspace.newChat")}
              className="size-8 rounded-[8px]"
              data-testid="conversation-create-menu"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Plus className="size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="create-new-dm" onSelect={onNewDm}>
              <MessageCirclePlus className="size-4" />
              {t("workspace.newDm")}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="create-new-group" onSelect={onNewGroup}>
              <UsersRound className="size-4" />
              {t("workspace.newGroup")}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="create-new-world" onSelect={onCreateWorld}>
              <Boxes className="size-4" />
              {t("workspace.createWorldAction")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative mt-2">
        <Search
          aria-hidden="true"
          className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-[var(--realm-fg-faint)]"
        />
        <Input
          aria-label={t("workspace.searchConversations")}
          className="h-8 rounded-[8px] bg-[var(--realm-surface-muted)] pl-8 text-[13px]"
          data-testid="conversation-search"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={t("workspace.searchConversations")}
          value={search}
        />
      </div>
    </header>
  );
}
