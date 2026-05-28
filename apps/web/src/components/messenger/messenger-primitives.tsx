import type { RoleAvatar, RoleSummary, Room } from "@realm/api-contract";
import { cn } from "@/lib/utils.ts";

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarPerson = {
  avatar?: RoleAvatar;
  id: string;
  label: string;
};

const AVATAR_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-12 rounded-[4px] text-[23px]",
  md: "size-[44px] rounded-[4px] text-[21px]",
  sm: "size-[36px] rounded-[4px] text-[16px]",
  xl: "size-[56px] rounded-[5px] text-[26px]",
};

const GROUP_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-12 rounded-[4px] p-[2px]",
  md: "size-[44px] rounded-[4px] p-[2px]",
  sm: "size-[36px] rounded-[4px] p-[2px]",
  xl: "size-[56px] rounded-[5px] p-[2px]",
};

const GROUP_CELL_COMPACT_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-[13px] text-[8px]",
  md: "size-[11px] text-[7px]",
  sm: "size-[9px] text-[6px]",
  xl: "size-[16px] text-[9px]",
};

const GROUP_CELL_ROOMY_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-[22px] text-[12px]",
  md: "size-[20px] text-[11px]",
  sm: "size-[16px] text-[9px]",
  xl: "size-[26px] text-[14px]",
};

const AVATAR_GLYPHS = [
  "🌸",
  "🌙",
  "🌊",
  "🌿",
  "🍀",
  "🍉",
  "🍿",
  "☕",
  "🎧",
  "🎮",
  "🎲",
  "🎯",
  "🎨",
  "🎬",
  "🎵",
  "🏮",
  "💎",
  "💡",
  "💬",
  "📚",
  "📌",
  "🧃",
  "🧩",
  "🧪",
  "🧵",
  "🪁",
  "🪐",
  "🪄",
  "🧿",
  "⚡",
  "✨",
];

const AVATAR_COLORS = [
  { background: "#ff6b81", color: "#ffffff" },
  { background: "#4d96ff", color: "#ffffff" },
  { background: "#38bdf8", color: "#ffffff" },
  { background: "#ffb020", color: "#261900" },
  { background: "#8e6cf7", color: "#ffffff" },
  { background: "#18a0a8", color: "#ffffff" },
  { background: "#ff7a45", color: "#ffffff" },
  { background: "#5c6f82", color: "#ffffff" },
  { background: "#f05a7e", color: "#ffffff" },
  { background: "#ff5c8a", color: "#ffffff" },
];

const DEFAULT_AVATAR_COLOR = { background: "#8e6cf7", color: "#ffffff" };
const DEFAULT_AVATAR_ACCENT = "#ffffff66";
const DEFAULT_AVATAR_GLYPH = "💬";

const AVATAR_ACCENTS = [
  DEFAULT_AVATAR_ACCENT,
  "#0000001f",
  "#ffd16699",
  "#7bdff299",
  "#f7aef899",
  "#b8f2e699",
  "#fff3b099",
  "#d0f4de99",
];

export function RoomAvatar({
  className,
  roles = [],
  room,
  size = "md",
}: {
  className?: string;
  roles?: RoleSummary[];
  room: Room;
  size?: AvatarSize;
}) {
  if (room.type === "dm") {
    const member = roomMembersForAvatar(room, roles).find((person) => person.id !== "owner");
    return (
      <IdentityAvatar
        className={className}
        identity={member?.id ?? room.id}
        label={member?.label ?? room.name}
        roles={roles}
        size={size}
      />
    );
  }
  if (room.type === "world-main" || room.type === "group") {
    return (
      <GroupAvatarGrid
        className={className}
        label={room.name}
        members={roomMembersForAvatar(room, roles)}
        size={size}
      />
    );
  }
  return <IdentityAvatar className={className} identity={room.id} label={room.name} size={size} />;
}

export function AvatarLabel({
  className,
  label,
  size = "md",
  tone = "neutral",
}: {
  className?: string;
  label: string;
  size?: AvatarSize;
  tone?: "neutral" | "owner" | "role";
}) {
  const seed = tone === "owner" ? "owner" : label;
  return <IdentityAvatar className={className} identity={seed} label={label} size={size} />;
}

export function IdentityAvatar({
  className,
  identity,
  label,
  roles = [],
  size = "md",
}: {
  className?: string;
  identity?: string;
  label?: string;
  roles?: RoleSummary[];
  size?: AvatarSize;
}) {
  const displayLabel = label ?? (identity ? labelForIdentity(identity, roles) : "Realm");
  const explicitAvatar = identity ? avatarForIdentity(identity, roles) : undefined;
  const profile = avatarProfileForIdentity(displayLabel || identity || "Realm");
  const avatarKind = explicitAvatar?.image ? "image" : explicitAvatar?.emoji ? "emoji" : "fallback";
  const glyph = explicitAvatar?.emoji ?? profile.glyph;

  return (
    <span
      data-avatar-seed={identity ?? displayLabel}
      data-avatar-glyph={glyph}
      data-avatar-kind={avatarKind}
      data-testid="identity-avatar"
      data-wechat-avatar="person"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]",
        AVATAR_SIZE_CLASS[size],
        className,
      )}
      style={{
        backgroundColor: profile.background,
        backgroundImage: profile.backgroundImage,
        color: profile.color,
      }}
      title={displayLabel}
    >
      {explicitAvatar?.image ? (
        <img
          alt=""
          className="size-full object-cover"
          draggable={false}
          src={explicitAvatar.image}
        />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 size-[18px] rounded-full opacity-35"
            style={{ backgroundColor: profile.accent }}
          />
          <span
            aria-hidden="true"
            className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.16)]"
          >
            {glyph}
          </span>
        </>
      )}
      <span className="sr-only">{displayLabel}</span>
    </span>
  );
}

export function GroupAvatarGrid({
  className,
  label,
  members,
  size = "md",
}: {
  className?: string;
  label: string;
  members: AvatarPerson[];
  size?: AvatarSize;
}) {
  const cells = groupVisualMembers(label, members);

  return (
    <span
      aria-label={label}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-[1.5px] overflow-hidden bg-[#d8dadd]",
        GROUP_SIZE_CLASS[size],
        className,
      )}
      data-testid="group-avatar-grid"
      data-wechat-avatar="group"
      data-wechat-grid="member-collage"
      data-wechat-grid-shape="nine-grid"
      role="img"
      title={label}
    >
      {groupRowsForMembers(cells).map((row) => (
        <span
          aria-hidden="true"
          className="flex justify-center gap-[1.5px]"
          data-testid="group-avatar-row"
          key={`${label}:row:${row.map((member) => member.id || member.label).join("|")}`}
        >
          {row.map((member) => {
            const seed = member.label || member.id;
            const profile = avatarProfileForIdentity(seed);
            const avatarKind = member.avatar?.image
              ? "image"
              : member.avatar?.emoji
                ? "emoji"
                : "fallback";
            const glyph = member.avatar?.emoji ?? profile.glyph;
            return (
              <span
                className={cn(
                  "relative flex items-center justify-center overflow-hidden rounded-[1.5px] font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
                  groupCellSizeClass(size, cells.length),
                )}
                data-avatar-seed={seed}
                data-avatar-glyph={glyph}
                data-avatar-kind={avatarKind}
                data-testid="group-avatar-cell"
                data-wechat-avatar="group-member"
                key={member.id || member.label}
                style={{
                  backgroundColor: profile.background,
                  backgroundImage: profile.backgroundImage,
                  color: profile.color,
                }}
                title={member.label}
              >
                {member.avatar?.image ? (
                  <img
                    alt=""
                    className="size-full object-cover"
                    draggable={false}
                    src={member.avatar.image}
                  />
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -bottom-1 size-[7px] rounded-full opacity-45"
                      style={{ backgroundColor: profile.accent }}
                    />
                    <span aria-hidden="true" className="relative z-10">
                      {glyph}
                    </span>
                  </>
                )}
                <span className="sr-only">{member.label}</span>
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

export function SystemNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-[680px] rounded-full bg-[#e9eaed] px-3 py-1.5 text-center text-[12px] text-[var(--realm-fg-muted)]">
      <span className="font-medium">{title}</span>: {body}
    </div>
  );
}

export function labelForIdentity(identity: string, roles: RoleSummary[]) {
  if (identity === "owner") {
    return "Boss";
  }
  return roles.find((role) => role.id === identity)?.displayName ?? identity;
}

function avatarForIdentity(identity: string, roles: RoleSummary[]): RoleAvatar | undefined {
  return roles.find((role) => role.id === identity)?.avatar;
}

export function roomMembersForAvatar(room: Room, roles: RoleSummary[]): AvatarPerson[] {
  const roleIds = roles.map((role) => role.id);
  const fallbackIds =
    room.type === "world-main" || room.type === "group" ? ["owner", ...roleIds] : room.memberIds;
  const sourceIds = room.memberIds.length > 0 ? room.memberIds : fallbackIds;
  const ids = (() => {
    if (room.type === "world-main") {
      return [...new Set(["owner", ...sourceIds, ...roleIds].filter(Boolean))];
    }
    if (room.type === "group") {
      return [...new Set(["owner", ...sourceIds].filter(Boolean))];
    }
    return [...new Set(sourceIds.filter(Boolean))];
  })();
  return ids.map((id) => {
    const avatar = avatarForIdentity(id, roles);
    return {
      ...(avatar ? { avatar } : {}),
      id,
      label: labelForIdentity(id, roles),
    };
  });
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function avatarProfileForIdentity(seed: string) {
  const hash = hashText(seed || "realm");
  const color = AVATAR_COLORS[(hash >>> 8) % AVATAR_COLORS.length] ?? DEFAULT_AVATAR_COLOR;
  const accent = AVATAR_ACCENTS[(hash >>> 16) % AVATAR_ACCENTS.length] ?? DEFAULT_AVATAR_ACCENT;
  return {
    ...color,
    accent,
    backgroundImage: avatarPatternForHash(hash, accent),
    glyph: AVATAR_GLYPHS[hash % AVATAR_GLYPHS.length] ?? DEFAULT_AVATAR_GLYPH,
    initials: initialsForAvatar(seed),
  };
}

export function groupVisualMembers(label: string, members: AvatarPerson[]): AvatarPerson[] {
  return members.length > 0 ? members.slice(0, 9) : [{ id: label, label }];
}

export function groupRowsForMembers(members: AvatarPerson[]): AvatarPerson[][] {
  const cells = members.slice(0, 9);
  if (cells.length <= 2) {
    return [cells];
  }
  if (cells.length === 3) {
    return [cells.slice(0, 1), cells.slice(1, 3)];
  }
  if (cells.length === 4) {
    return [cells.slice(0, 2), cells.slice(2, 4)];
  }
  if (cells.length === 5) {
    return [cells.slice(0, 2), cells.slice(2, 5)];
  }
  if (cells.length === 7) {
    return [cells.slice(0, 1), cells.slice(1, 4), cells.slice(4, 7)];
  }
  if (cells.length === 8) {
    return [cells.slice(0, 2), cells.slice(2, 5), cells.slice(5, 8)];
  }
  return [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)].filter((row) => row.length > 0);
}

function groupCellSizeClass(size: AvatarSize, memberCount: number): string {
  if (memberCount <= 4) {
    return GROUP_CELL_ROOMY_SIZE_CLASS[size];
  }
  return GROUP_CELL_COMPACT_SIZE_CLASS[size];
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function avatarPatternForHash(hash: number, accent: string): string {
  const angle = hash % 180;
  const stop = 38 + (hash % 24);
  return `linear-gradient(${angle}deg, transparent ${stop}%, ${accent} ${stop}%)`;
}

function initialsForAvatar(seed: string): string {
  const compact = seed.trim();
  if (!compact) {
    return "R";
  }
  const ascii = compact.match(/[a-z0-9]/i);
  if (ascii) {
    return ascii[0].toUpperCase();
  }
  return Array.from(compact)[0] ?? "R";
}
