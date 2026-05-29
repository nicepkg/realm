import type { RoleSummary } from "@realm/api-contract";
import { ChevronDown, Info, ShieldAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConversationListHeader } from "@/components/messenger/conversation-list-header.tsx";
import { ConversationRow } from "@/components/messenger/conversation-row.tsx";
import {
  GroupAvatarGrid,
  IdentityAvatar,
  RoomAvatar,
} from "@/components/messenger/messenger-primitives.tsx";
import { openChatWithRole } from "@/components/sheets/role-inspector-actions.ts";
import { useI18n } from "@/i18n/index.tsx";
import { cn } from "@/lib/utils.ts";
import type { ConversationSectionKey } from "@/view-models/conversation-prefs.ts";
import { isRoomUnread } from "@/view-models/conversation-unread.ts";
import { roomDisplayName, worldModeLabel } from "@/view-models/labels.ts";
import type { ConversationRow as ConversationRowModel } from "@/view-models/realm-view-model.ts";
import type { RealmAppController } from "../../app/types.ts";

type ConversationListProps = {
  app: RealmAppController;
  onNewDm: () => void;
  onNewGroup: () => void;
  onCreateWorld: () => void;
  onOpenGod: () => void;
  onInspectRole: (roleId: string) => void;
  /** Called after the user selects a room/role/world (mobile pane swap to chat). */
  onSelect?: () => void;
};

/**
 * Left conversation column (280px on desktop). Renders chats, contacts/roles,
 * or worlds depending on `app.activeSection`. Chats are split into pinned /
 * groups / dms sections with real collapse + pin semantics from the
 * conversation-prefs view-model.
 */
export function ConversationList({
  app,
  onNewDm,
  onNewGroup,
  onCreateWorld,
  onOpenGod,
  onInspectRole,
  onSelect,
}: ConversationListProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const title =
    app.activeSection === "roles"
      ? t("rail.contacts")
      : app.activeSection === "worlds"
        ? t("rail.worlds")
        : t("rail.chats");

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-[var(--realm-surface)]"
      data-testid="conversation-list"
    >
      <ConversationListHeader
        onCreateWorld={onCreateWorld}
        onNewDm={onNewDm}
        onNewGroup={onNewGroup}
        onSearchChange={setSearch}
        search={search}
        title={title}
      />
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {app.activeSection === "roles" ? (
          <RoleRows app={app} onInspectRole={onInspectRole} onSelect={onSelect} search={search} />
        ) : app.activeSection === "worlds" ? (
          <WorldRows app={app} onSelect={onSelect} search={search} />
        ) : (
          <ChatRows app={app} onOpenGod={onOpenGod} onSelect={onSelect} search={search} />
        )}
      </div>
    </aside>
  );
}

function matches(search: string, ...fields: string[]): boolean {
  if (!search.trim()) {
    return true;
  }
  const needle = search.trim().toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

function ChatRows({
  app,
  onOpenGod,
  onSelect,
  search,
}: {
  app: RealmAppController;
  onOpenGod: () => void;
  onSelect?: () => void;
  search: string;
}) {
  const { t } = useI18n();
  const { prefs, readCursors, togglePin } = app.conversationPrefs;

  const chatRows = app.conversations.filter(
    (row) => row.room.type !== "god-channel" && matches(search, row.title, row.lastMessage),
  );
  const godRow = app.conversations.find((row) => row.room.type === "god-channel");

  const isPinned = (id: string) => prefs.pinnedRoomIds.includes(id);
  // The world all-hands room is always pinned + un-unpinnable (product rule).
  const isAllHands = (row: ConversationRowModel) => row.room.type === "world-main";

  const pinned: ConversationRowModel[] = [];
  const groups: ConversationRowModel[] = [];
  const dms: ConversationRowModel[] = [];
  for (const row of chatRows) {
    if (isAllHands(row) || isPinned(row.id)) {
      pinned.push(row);
    } else if (row.room.type === "dm") {
      dms.push(row);
    } else {
      groups.push(row);
    }
  }
  pinned.sort(
    (left, right) => pinScore(prefs.pinnedRoomIds, right) - pinScore(prefs.pinnedRoomIds, left),
  );

  const renderRow = (row: ConversationRowModel) => {
    const allHands = isAllHands(row);
    const unread = isRoomUnread(readCursors, app.viewerIdentity, row.id, row.latestMessage);
    return (
      <ConversationRow
        avatar={<RoomAvatar room={row.room} roles={app.state.roles} size="md" />}
        dataAttrs={{ "data-chat-row": "conversation" }}
        key={row.id}
        onSelect={() => {
          void app.selectRoom(row.id);
          onSelect?.();
        }}
        onTogglePin={() => togglePin(row.id)}
        pinDisabled={allHands}
        pinned={allHands || isPinned(row.id)}
        selected={row.id === app.selectedRoom?.id}
        subtitle={row.lastMessage || row.subtitle}
        testId={`room-${row.id}`}
        timestamp={row.timestamp}
        title={roomDisplayName(t, row.room)}
        unread={unread}
      />
    );
  };

  const hasAny = chatRows.length > 0 || Boolean(godRow);

  return (
    <div>
      {godRow ? (
        <ConversationRow
          avatar={
            <span className="flex size-[44px] items-center justify-center rounded-[8px] bg-[#efe7d4] text-[#9a7b2e]">
              <ShieldAlert className="size-5" />
            </span>
          }
          dataAttrs={{ "data-adjudication-entry": "god" }}
          onSelect={onOpenGod}
          selected={false}
          subtitle={t("workspace.godRoomSubtitle")}
          testId={`room-${godRow.id}`}
          title={t("workspace.adjudication")}
        />
      ) : null}
      <CollapsibleSection
        app={app}
        count={pinned.length}
        label={t("workspace.pinned")}
        sectionKey="pinned"
      >
        {pinned.map(renderRow)}
      </CollapsibleSection>
      <CollapsibleSection
        app={app}
        count={groups.length}
        label={t("workspace.groups")}
        sectionKey="groups"
      >
        {groups.map(renderRow)}
      </CollapsibleSection>
      <CollapsibleSection
        app={app}
        count={dms.length}
        label={t("workspace.directMessages")}
        sectionKey="dms"
      >
        {dms.map(renderRow)}
      </CollapsibleSection>
      {!hasAny ? (
        <p className="px-3 py-6 text-center text-[13px] text-[var(--realm-fg-muted)]">
          {t("workspace.emptyConversations")}
        </p>
      ) : null}
    </div>
  );
}

function pinScore(order: string[], row: ConversationRowModel): number {
  const index = order.indexOf(row.id);
  // Explicitly pinned rooms keep recency-of-pin order; the always-on all-hands
  // room (not in the order list) sorts to the very top.
  return index === -1 ? Number.MAX_SAFE_INTEGER : order.length - index;
}

function CollapsibleSection({
  app,
  children,
  count,
  label,
  sectionKey,
}: {
  app: RealmAppController;
  children: ReactNode;
  count: number;
  label: string;
  sectionKey: ConversationSectionKey;
}) {
  const { toggleSection, prefs } = app.conversationPrefs;
  if (count === 0) {
    return null;
  }
  const collapsed = prefs.collapsedSections[sectionKey];
  return (
    <section data-testid={`section-${sectionKey}`}>
      <button
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 px-3 pt-3 pb-1 text-left text-[12px] text-[var(--realm-fg-muted)]"
        data-testid={`section-toggle-${sectionKey}`}
        onClick={() => toggleSection(sectionKey)}
        type="button"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")}
        />
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="text-[var(--realm-fg-faint)] tabular-nums">{count}</span>
      </button>
      {collapsed ? null : <div data-testid={`section-body-${sectionKey}`}>{children}</div>}
    </section>
  );
}

function RoleRows({
  app,
  onInspectRole,
  onSelect,
  search,
}: {
  app: RealmAppController;
  onInspectRole: (roleId: string) => void;
  onSelect?: () => void;
  search: string;
}) {
  const { t } = useI18n();
  const roles = app.state.roles.filter((role: RoleSummary) =>
    matches(search, role.displayName, role.id),
  );
  if (roles.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-[var(--realm-fg-muted)]">
        {t("workspace.emptyRoles")}
      </p>
    );
  }
  return (
    <div>
      {roles.map((role) => (
        <RoleRow
          app={app}
          key={role.id}
          onInspectRole={onInspectRole}
          onSelect={onSelect}
          role={role}
        />
      ))}
    </div>
  );
}

/**
 * A single contact row. PRIMARY tap opens (resolve-or-create) the role's direct
 * chat — the WeChat mental model where tapping a contact starts a conversation
 * (DISC-R7-3). Inspection is demoted to a SECONDARY trailing info affordance so
 * the capability/memory inspector stays reachable without being the default.
 *
 * The info control is a true sibling of the row button (not nested, which would
 * be invalid interactive-in-button HTML); a `group` container reveals it on hover
 * / focus while keeping it permanently reachable by keyboard.
 */
function RoleRow({
  app,
  onInspectRole,
  onSelect,
  role,
}: {
  app: RealmAppController;
  onInspectRole: (roleId: string) => void;
  onSelect?: () => void;
  role: RoleSummary;
}) {
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);

  // Resolve-or-create the DM and land the messenger in it. Failure leaves the
  // contact list intact; the messenger surfaces send/turn errors in-pane, so a
  // transient open failure simply leaves the operator where they were.
  async function openChat() {
    if (opening) {
      return;
    }
    setOpening(true);
    try {
      await openChatWithRole(app, role);
      onSelect?.();
    } catch {
      // Swallowed: the row stays selectable and the operator can retry. A toast
      // layer is out of scope for this list primitive.
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="group relative">
      <ConversationRow
        avatar={
          <IdentityAvatar
            identity={role.id}
            label={role.displayName}
            roles={app.state.roles}
            size="md"
          />
        }
        onSelect={() => void openChat()}
        selected={role.id === app.runRoleId}
        subtitle={`${role.model ?? t("common.default")} · ${role.id}`}
        testId={`role-row-${role.id}`}
        title={role.displayName}
      />
      <button
        aria-label={t("workspace.inspect")}
        className="-translate-y-1/2 absolute top-1/2 right-2 flex size-7 items-center justify-center rounded-full text-[var(--realm-fg-faint)] opacity-0 transition hover:bg-[var(--realm-hover)] hover:text-[var(--realm-fg-muted)] focus-visible:opacity-100 group-hover:opacity-100"
        data-testid={`role-row-${role.id}-inspect`}
        onClick={() => {
          onInspectRole(role.id);
          onSelect?.();
        }}
        title={t("workspace.inspect")}
        type="button"
      >
        <Info aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

function WorldRows({
  app,
  onSelect,
  search,
}: {
  app: RealmAppController;
  onSelect?: () => void;
  search: string;
}) {
  const { t } = useI18n();
  const worlds = app.state.worlds.filter((world) => matches(search, world.name, world.id));
  if (worlds.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-[var(--realm-fg-muted)]">
        {t("workspace.emptyWorlds")}
      </p>
    );
  }
  return (
    <div>
      {worlds.map((world) => (
        <ConversationRow
          avatar={
            <GroupAvatarGrid
              label={world.name}
              members={[
                { id: "owner", label: t("common.boss") },
                ...world.roleIds.map((roleId) => ({
                  id: roleId,
                  label: app.state.roles.find((role) => role.id === roleId)?.displayName ?? roleId,
                })),
              ]}
              size="md"
            />
          }
          dataAttrs={{ "data-world-row": "world" }}
          key={world.id}
          onSelect={() => {
            void app.selectWorld(world.id);
            onSelect?.();
          }}
          selected={world.id === app.selectedWorld?.id}
          subtitle={`${worldModeLabel(t, world.mode.type)} · ${world.roleIds.length} ${t("common.roles")}`}
          testId={`world-row-${world.id}`}
          title={world.name}
          trailing={
            world.id === app.selectedWorld?.id ? (
              <span className="size-2 rounded-full bg-[var(--realm-green)]" />
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
