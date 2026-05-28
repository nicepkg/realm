import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveTuiLocale, type TuiLocale } from "./i18n.ts";

/**
 * Resolves the operator's preferred interface language without an explicit
 * `--locale` flag. Precedence: an explicit `REALM_LOCALE`, then a previously
 * persisted choice in `~/.realm/tui-locale`, then the POSIX locale environment
 * (`LC_ALL` / `LC_MESSAGES` / `LANG`), then the host's Intl locale. The raw
 * value is handed to `resolveTuiLocale`, which normalizes any `zh*` tag to
 * `zh-CN` and otherwise falls back to English.
 */
export function detectSystemLocale(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.REALM_LOCALE ??
    readPersistedLocaleSync(env) ??
    env.LC_ALL ??
    env.LC_MESSAGES ??
    env.LANG ??
    safeIntlLocale()
  );
}

/** Absolute path of the persisted locale preference file. */
export function localePreferencePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(userRealmHome(env), "tui-locale");
}

/** Persists the chosen locale to `~/.realm/tui-locale` so it survives restarts. */
export async function persistTuiLocale(
  locale: TuiLocale,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = localePreferencePath(env);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${locale}\n`, "utf8");
}

function readPersistedLocaleSync(env: NodeJS.ProcessEnv): string | undefined {
  try {
    const trimmed = readFileSync(localePreferencePath(env), "utf8").trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Async loader kept for symmetry with {@link persistTuiLocale}. */
export async function loadPersistedTuiLocale(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TuiLocale | undefined> {
  try {
    const raw = await readFile(localePreferencePath(env), "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? resolveTuiLocale(trimmed) : undefined;
  } catch {
    return undefined;
  }
}

function userRealmHome(env: NodeJS.ProcessEnv): string {
  return env.REALM_HOME ?? path.join(os.homedir(), ".realm");
}

function safeIntlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}
