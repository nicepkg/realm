import { type TuiLocale, t } from "./i18n.ts";

export type TuiWorldStateSnapshot = {
  version: number;
  state: Record<string, unknown>;
};

export function renderWorldStateInspection(
  snapshot: TuiWorldStateSnapshot | undefined,
  locale: TuiLocale = "en",
  pointer?: string,
): string {
  const dict = t(locale);
  if (!snapshot) {
    return `${dict.worldState}: ${dict.noValue}`;
  }
  const value = pointer ? readJsonPointer(snapshot.state, pointer) : snapshot.state;
  return [
    `${dict.worldState} v${snapshot.version}${pointer ? ` ${pointer}` : ""}`,
    previewJson(value),
  ].join("\n");
}

export function renderMemoryInspection(
  roleId: string,
  content: string,
  locale: TuiLocale = "en",
): string {
  const dict = t(locale);
  return [`${dict.memory}: ${roleId}`, content.trim() || dict.memoryEmpty].join("\n");
}

export function previewJson(value: unknown, maxLength = 900): string {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function readJsonPointer(source: unknown, pointer: string): unknown {
  if (!pointer || pointer === "/") {
    return source;
  }
  const segments = pointer
    .replace(/^#/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = source;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
