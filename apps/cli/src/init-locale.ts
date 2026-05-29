/**
 * Locale detection for the `realm init` template generator. It mirrors the
 * precedence the TUI uses in `apps/tui/src/tui-locale.ts`
 * (`detectSystemLocale` + `resolveTuiLocale`) so a zh-CN operator gets a
 * Chinese-seeded world without passing an explicit flag:
 *
 *   REALM_LOCALE → LC_ALL → LC_MESSAGES → LANG → host Intl locale
 *
 * Any `zh*` tag normalizes to Chinese; everything else stays English. The
 * persisted `~/.realm/tui-locale` file the TUI also consults is intentionally
 * skipped here: it is a TUI-session preference, while `init` writes durable
 * world content and should follow the live system/environment locale only.
 */
export type InitLocale = "zh-CN" | "en";

/** Resolve the raw locale string from environment, then host Intl. */
export function detectInitLocaleRaw(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.REALM_LOCALE ?? env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? safeIntlLocale() ?? undefined
  );
}

/** Normalize any raw locale tag to the two locales the generator seeds. */
export function resolveInitLocale(locale: string | undefined): InitLocale {
  return locale === "zh-CN" || locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Convenience: detect + normalize in one call. */
export function detectInitLocale(env: NodeJS.ProcessEnv = process.env): InitLocale {
  return resolveInitLocale(detectInitLocaleRaw(env));
}

/** True when the resolved locale is Chinese (treats every `zh*` tag as zh-CN). */
export function isChineseLocale(env: NodeJS.ProcessEnv = process.env): boolean {
  return detectInitLocale(env) === "zh-CN";
}

function safeIntlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}
