import type { RoleSummary, Room } from "@realm/api-contract";
import { cn } from "@/lib/utils.ts";

type AvatarSize = "sm" | "md" | "lg";
type AvatarPerson = {
  id: string;
  label: string;
};

const AVATAR_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-[52px] rounded-[4px] text-[25px]",
  md: "size-[44px] rounded-[4px] text-[21px]",
  sm: "size-[36px] rounded-[4px] text-[16px]",
};

const GROUP_SIZE_CLASS: Record<AvatarSize, string> = {
  lg: "size-[52px] rounded-[4px] p-[2px]",
  md: "size-[44px] rounded-[4px] p-[2px]",
  sm: "size-[36px] rounded-[4px] p-[2px]",
};

const GROUP_CELL_SIZE_CLASS: Record<AvatarSize, Record<"dense" | "sparse", string>> = {
  lg: {
    dense: "size-[15px] text-[9px]",
    sparse: "size-[23px] text-[12px]",
  },
  md: {
    dense: "size-[12px] text-[8px]",
    sparse: "size-[19px] text-[10px]",
  },
  sm: {
    dense: "size-[9px] text-[7px]",
    sparse: "size-[15px] text-[8px]",
  },
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
  { background: "#07c160", color: "#ffffff" },
  { background: "#ffb020", color: "#261900" },
  { background: "#8e6cf7", color: "#ffffff" },
  { background: "#18a0a8", color: "#ffffff" },
  { background: "#ff7a45", color: "#ffffff" },
  { background: "#5c6f82", color: "#ffffff" },
  { background: "#f05a7e", color: "#ffffff" },
  { background: "#32b768", color: "#ffffff" },
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
  const profile = avatarProfileForIdentity(displayLabel || identity || "Realm");

  return (
    <span
      data-avatar-seed={identity ?? displayLabel}
      data-avatar-glyph={profile.glyph}
      data-avatar-kind="fallback"
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
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 size-[18px] rounded-full opacity-35"
        style={{ backgroundColor: profile.accent }}
      />
      <span aria-hidden="true" className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.16)]">
        {profile.glyph}
      </span>
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
  const rows = groupRowsForMembers(groupVisualMembers(label, members));
  const density = rows.some((row) => row.length >= 3) ? "dense" : "sparse";

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
      role="img"
      title={label}
    >
      {rows.map((row) => (
        <span
          aria-hidden="true"
          className="flex justify-center gap-[1.5px]"
          data-testid="group-avatar-row"
          key={`${label}:row:${row.map((member) => member.id || member.label).join("|")}`}
        >
          {row.map((member) => {
            const seed = member.label || member.id;
            const profile = avatarProfileForIdentity(seed);
            return (
              <span
                className={cn(
                  "relative flex items-center justify-center overflow-hidden rounded-[1.5px] font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
                  GROUP_CELL_SIZE_CLASS[size][density],
                )}
                data-avatar-seed={seed}
                data-avatar-glyph={profile.glyph}
                data-avatar-kind="fallback"
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
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -bottom-1 size-[7px] rounded-full opacity-45"
                  style={{ backgroundColor: profile.accent }}
                />
                <span aria-hidden="true" className="relative z-10">
                  {profile.glyph}
                </span>
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
  return ids.map((id) => ({ id, label: labelForIdentity(id, roles) }));
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
  const count = members.length;
  if (count <= 1) {
    return [members];
  }
  if (count === 2) {
    return [members];
  }
  if (count === 3) {
    return [members.slice(0, 1), members.slice(1, 3)];
  }
  if (count === 4) {
    return [members.slice(0, 2), members.slice(2, 4)];
  }
  if (count === 5) {
    return [members.slice(0, 2), members.slice(2, 5)];
  }
  if (count === 6) {
    return [members.slice(0, 3), members.slice(3, 6)];
  }
  if (count === 7) {
    return [members.slice(0, 1), members.slice(1, 4), members.slice(4, 7)];
  }
  if (count === 8) {
    return [members.slice(0, 2), members.slice(2, 5), members.slice(5, 8)];
  }
  return [members.slice(0, 3), members.slice(3, 6), members.slice(6, 9)];
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
