import { type DocSection, type DocsPage, type Locale, locales } from "./content.ts";

export const LOCALE_STORAGE_KEY = "realm-docs-locale";

export type DocsRoute = {
  locale: Locale;
  topic?: string;
};

export function resolveInitialRoute(): DocsRoute {
  // Explicit deep links (`/en`, `/zh-CN`, and their topics) are honored as-is so
  // shareable URLs stay stable. The bare canonical root (`/`) intentionally does
  // NOT inherit resolveRoute's hardcoded English default: Realm is a Chinese-first
  // product, so a bare-root visitor must fall through to their stored preference
  // and then navigator.language before defaulting to English.
  const pathname = window.location.pathname;
  if (!isBareRoot(pathname)) {
    const route = resolveRoute(pathname);
    if (route) {
      return route;
    }
  }
  return { locale: preferredLocale() };
}

function isBareRoot(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length === 0;
}

function preferredLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) {
    return stored;
  }
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function resolveRoute(pathname: string): DocsRoute | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { locale: "en" };
  }
  if (parts[0] === "zh-CN") {
    return { locale: "zh-CN", topic: parts[1] };
  }
  if (parts[0] === "en") {
    return { locale: "en", topic: parts[1] };
  }
  return undefined;
}

export function pathForLocale(locale: Locale, topic?: string): string {
  const base = locale === "en" ? "/en" : "/zh-CN";
  if (!topic) {
    return locale === "en" ? "/" : base;
  }
  return `${base}/${topic}`;
}

export function sectionForTopic(page: DocsPage, topic: string): DocSection | undefined {
  if (topic === "quick-start") {
    return {
      body: page.quickStart.intro,
      bullets: page.quickStart.steps.map((step) => `${step.label}: ${step.value}`),
      eyebrow: page.nav.find((item) => item.value === topic)?.label ?? topic,
      id: topic,
      title: page.quickStart.title,
    };
  }
  if (topic === "concepts") {
    return {
      body: page.concepts.intro,
      bullets: page.concepts.nodes.map((node) => `${node.label}: ${node.value}`),
      eyebrow: page.nav.find((item) => item.value === topic)?.label ?? topic,
      id: topic,
      title: page.concepts.title,
    };
  }
  if (topic === "templates") {
    return {
      body: page.examples.intro,
      bullets: page.examples.items.map((item) => `${item.label}: ${item.value}`),
      eyebrow: page.nav.find((item) => item.value === topic)?.label ?? topic,
      id: topic,
      title: page.examples.title,
    };
  }
  return page.sections.find((section) => section.id === topic);
}

function isLocale(value: string | null): value is Locale {
  return locales.some((locale) => locale === value);
}
