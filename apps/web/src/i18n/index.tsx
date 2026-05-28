import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { dictionaries, type Locale, type MessageKey } from "./messages.ts";

export type { Locale, MessageKey } from "./messages.ts";
export { dictionaries, locales } from "./messages.ts";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
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

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionaries[locale][key],
    }),
    [locale, setLocale],
  );

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
