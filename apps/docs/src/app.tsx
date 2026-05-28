import { realmColors } from "@realm/design-tokens";
import { type CSSProperties, useEffect, useState } from "react";
import { type Locale, pages } from "./content.ts";
import { HomePage } from "./home-page.tsx";
import {
  type DocsRoute,
  LOCALE_STORAGE_KEY,
  pathForLocale,
  resolveInitialRoute,
  resolveRoute,
  sectionForTopic,
} from "./routing.ts";
import { TopBar } from "./top-bar.tsx";
import { TopicPage } from "./topic-page.tsx";

export function DocsApp() {
  const [route, setRoute] = useState<DocsRoute>(() => resolveInitialRoute());
  const page = pages[route.locale];
  const topic = route.topic ? sectionForTopic(page, route.topic) : undefined;
  const shellStyle = { "--realm-primary": realmColors.primary } as CSSProperties;

  useEffect(() => {
    const onPopState = () =>
      setRoute((current) => resolveRoute(window.location.pathname) ?? current);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = route.locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, route.locale);
  }, [route.locale]);

  function switchLocale() {
    const nextLocale: Locale = route.locale === "en" ? "zh-CN" : "en";
    window.history.pushState({}, "", pathForLocale(nextLocale, route.topic));
    setRoute({ locale: nextLocale, topic: route.topic });
  }

  return (
    <div className="docs-shell" style={shellStyle}>
      <TopBar page={page} onSwitchLocale={switchLocale} />
      {topic ? <TopicPage page={page} section={topic} /> : <HomePage page={page} />}
    </div>
  );
}
