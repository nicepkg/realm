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
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

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

function detectLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const language = navigator.language || navigator.languages?.[0] || "en";
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
