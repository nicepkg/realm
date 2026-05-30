import type { Room } from "@realm/api-contract";
import type { StringMessageKey } from "../i18n/messages.ts";

/**
 * Shared, locale-aware label helpers. They exist so the messenger, manager, and
 * command palette never render raw enum values or room ids to a zh-CN user
 * (the "simulation" / "main" leaks). Pass the `t` from `useI18n`.
 */
type Translate = (key: StringMessageKey) => string;

const WORLD_MODES = new Set(["debate", "workflow", "game", "simulation", "sandbox"]);

/** Map a world mode enum to a localized label; unknown modes pass through. */
export function worldModeLabel(t: Translate, mode: string): string {
  return WORLD_MODES.has(mode) ? t(`worldMode.${mode}` as StringMessageKey) : mode;
}

/** Raw room ids / enum tokens that must never surface as a user-facing title. */
const PLACEHOLDER_ROOM_NAMES = new Set(["main", "world-main"]);

/**
 * Known English template defaults for the always-on world room. Older / English
 * `realm init` runs (and any hand-authored world that copied the English fixture)
 * write these into `world.yaml`. For a `world-main` room we treat them the same as
 * a raw id token and re-localize, so a zh-CN operator never sees a leaked English
 * default. Other room types keep whatever the author wrote.
 */
const ENGLISH_WORLD_MAIN_DEFAULTS = new Set(["All Hands", "Sect Hall", "Infirmary"]);

/**
 * Humanize a room into a viewer-facing name. The always-on world room keeps the
 * name its author wrote (e.g. the cultivation example's "全员议事") so the title
 * the user configured is the title the user sees. Only when that name is missing,
 * is a raw id / enum token (e.g. `world-main` / `main`), or is a known English
 * template default (`All Hands`) do we fall back to the localized "all hands"
 * label rather than leaking the internal/English value. Every other room always
 * keeps its authored name.
 */
export function roomDisplayName(t: Translate, room: { type: Room["type"]; name: string }): string {
  if (room.type !== "world-main") {
    return room.name;
  }
  const authored = room.name.trim();
  const isLeakedDefault =
    !authored || PLACEHOLDER_ROOM_NAMES.has(authored) || ENGLISH_WORLD_MAIN_DEFAULTS.has(authored);
  return isLeakedDefault ? t("workspace.allHands") : authored;
}

/**
 * A single ambient world-pulse fact: a zh-CN `label` and a short stringified
 * `value` (e.g. {label:"时令", value:"初春"}). Pure-data so the ultra-wide
 * WorldPulseGutter can render the live world snapshot without owning any
 * state-shape knowledge — it reads the SAME `worldState.state` object the context
 * rail flattens, never a separate data path.
 */
export type WorldPulseFact = { key: string; label: string; value: string };

/** Read a scalar (string / number) from a possibly-missing nested record. */
function scalarAt(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

/** Narrow an unknown to a plain (non-array) object so nested reads stay safe. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Extract the OPTIONAL ambient time/place facts (时令 / 天数 / 地点) from a live
 * world state. These live under the curated `publicState.world` container in the
 * canonical schema (see the cultivation example: season / day / location). Only
 * facts that are actually present are returned — nothing is fabricated — so the
 * gutter gracefully shows fewer rows on a sparse world. Pure + unit-testable.
 */
export function worldPulseFacts(state: Record<string, unknown> | undefined): WorldPulseFact[] {
  const world = asRecord(asRecord(asRecord(state)?.publicState)?.world);
  const facts: WorldPulseFact[] = [];
  const season = scalarAt(world, "season");
  if (season) {
    facts.push({ key: "season", label: "时令", value: season });
  }
  const day = scalarAt(world, "day");
  if (day) {
    facts.push({ key: "day", label: "天数", value: `第 ${day} 天` });
  }
  const location = scalarAt(world, "location");
  if (location) {
    facts.push({ key: "location", label: "地点", value: location });
  }
  return facts;
}
