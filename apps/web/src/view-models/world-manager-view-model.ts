import type { RoleSummary, WorldSummary } from "@realm/api-contract";

export function filterWorldsForManager(
  worlds: WorldSummary[],
  roles: RoleSummary[],
  query: string,
): WorldSummary[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return worlds;
  }
  return worlds.filter((world) => worldSearchText(world, roles).includes(normalizedQuery));
}

function worldSearchText(world: WorldSummary, roles: RoleSummary[]): string {
  const roleNames = world.roleIds
    .map((roleId) => roles.find((role) => role.id === roleId)?.displayName ?? roleId)
    .join(" ");
  return normalizeSearchText(
    `${world.id} ${world.name} ${world.defaultRoomId} ${world.mode.type} ${world.mode.time.kind} ${roleNames}`,
  );
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}
