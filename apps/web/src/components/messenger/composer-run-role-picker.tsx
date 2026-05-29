import type { RoleSummary, Room } from "@realm/api-contract";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/index.tsx";
import { IdentityAvatar, roomMembersForAvatar } from "./messenger-primitives.tsx";

/**
 * The run target picker (MC-R4-1): choosing WHO runs and running them are
 * co-located on the composer row (Don Norman: mapping). It lists the current
 * room's role members so the operator can only ever bind a role that actually
 * belongs to the room. Multi-member rooms show a dropdown; a single-member room
 * shows a static label (nothing to choose), and a memberless room renders
 * nothing so the run gate's own reason line carries the explanation.
 */
export function RunRolePicker({
  room,
  roles,
  runRoleId,
  onPick,
}: {
  room: Room | undefined;
  roles: RoleSummary[];
  runRoleId: string;
  onPick: (roleId: string) => void;
}) {
  const { t } = useI18n();
  // The room's role members only (never the owner pseudo-identity), as concrete
  // role records so the picker shows real avatars + display names.
  const members = useMemo(() => {
    if (!room) {
      return [] as RoleSummary[];
    }
    const memberIds = new Set(roomMembersForAvatar(room, roles).map((member) => member.id));
    return roles.filter((role) => memberIds.has(role.id));
  }, [room, roles]);

  if (members.length === 0) {
    return null;
  }

  const active = members.find((role) => role.id === runRoleId) ?? members[0];

  // A single-member room has nothing to choose — show a calm static label so the
  // run target is still VISIBLE without offering a dead-end dropdown.
  if (members.length === 1 && active) {
    return (
      <div
        className="flex shrink-0 items-center gap-1.5 rounded-[8px] px-1.5 text-[13px] text-[var(--realm-fg-muted)]"
        data-testid="composer-run-role-static"
      >
        <IdentityAvatar identity={active.id} label={active.displayName} roles={roles} size="sm" />
        <span className="max-w-[6rem] truncate">{active.displayName}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("workspace.runTurnPreviewRole")}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-2 text-[13px] text-[var(--realm-fg-muted)] outline-none hover:bg-[var(--realm-surface-muted)] hover:text-[var(--realm-fg)] focus-visible:ring-2 focus-visible:ring-[var(--realm-green)]"
        data-testid="composer-run-role-picker"
      >
        {active ? (
          <IdentityAvatar identity={active.id} label={active.displayName} roles={roles} size="sm" />
        ) : null}
        <span className="max-w-[6rem] truncate">{active?.displayName}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52" side="top">
        <DropdownMenuLabel>{t("workspace.runTurnPreviewRole")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={onPick} value={active?.id}>
          {members.map((role) => (
            <DropdownMenuRadioItem
              data-testid={`composer-run-role-option-${role.id}`}
              key={role.id}
              value={role.id}
            >
              <IdentityAvatar identity={role.id} label={role.displayName} roles={roles} size="sm" />
              <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
