import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { dictionaries, type Locale, type MessageKey, type StringMessageKey } from "./messages.ts";

export type { Locale, MessageKey } from "./messages.ts";
export { dictionaries, locales } from "./messages.ts";

/**
 * `t` returns a string for static keys and the underlying builder function for
 * function-valued keys (e.g. plural-aware counts). The overload keeps existing
 * `t("some.key")` string call sites fully typed without casts.
 */
type TranslateFn = {
  (key: StringMessageKey): string;
  <K extends MessageKey>(key: K): (typeof dictionaries.en)[K];
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale());

  useEffect(() => {
    const saved = localStorage.getItem("realm-locale");
    if (saved === "en" || saved === "zh-CN") {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    localStorage.setItem("realm-locale", nextLocale);
    setLocaleState(nextLocale);
  }, []);

  // Keep the document language in sync with the active locale so assistive
  // tech and the `<html lang>` signal reflect the Chinese-first default.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const translate = ((key: MessageKey) => dictionaries[locale][key]) as TranslateFn;
    return { locale, setLocale, t: translate };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}

/**
 * Realm is a Chinese-first product, so zh-CN is the UNCONDITIONAL first-paint
 * default — the browser language never flips it to English on its own. English
 * is reachable only via an explicit saved preference (re-applied in an effect
 * and always wins) or the visible language switch. This fixes Boss complaint
 * "明明是中文产品，界面却满屏英文" on an en-locale browser.
 */
function initialLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("realm-locale");
    if (saved === "en" || saved === "zh-CN") {
      return saved;
    }
  }
  return "zh-CN";
}
