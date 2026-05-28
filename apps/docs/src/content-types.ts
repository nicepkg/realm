export type Locale = "en" | "zh-CN";

export type TextPair = {
  label: string;
  value: string;
};

export type DocSection = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  code?: string;
};

export type DocsPage = {
  locale: Locale;
  languageLabel: string;
  switchLabel: string;
  menuLabel: string;
  nav: TextPair[];
  hero: {
    title: string;
    promise: string;
    installLabel: string;
    installCommand: string;
    primaryAction: string;
    secondaryAction: string;
    proof: string[];
  };
  valueProps: TextPair[];
  preview: {
    managerTitle: string;
    managerAction: string;
    worldName: string;
    worldMeta: string;
    chatTitle: string;
    time: string;
    incomingAuthor: string;
    incoming: string;
    outgoing: string;
    composer: string;
    settings: string;
    god: string;
    command: string;
    inspector: string;
  };
  quickStart: {
    title: string;
    intro: string;
    steps: TextPair[];
  };
  concepts: {
    title: string;
    intro: string;
    nodes: TextPair[];
  };
  tui: {
    title: string;
    intro: string;
    lines: string[];
  };
  trust: {
    title: string;
    intro: string;
    bullets: string[];
  };
  examples: {
    title: string;
    intro: string;
    items: TextPair[];
  };
  sections: DocSection[];
  cta: {
    title: string;
    body: string;
    install: string;
    github: string;
  };
};

export const locales = ["en", "zh-CN"] as const;
