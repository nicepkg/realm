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
    /** Chat window title (the NL-first surface talks to 天道/God). */
    chatTitle: string;
    /** Empty-state prompt shown before the first message. */
    emptyPrompt: string;
    /** Suggestion chips that demonstrate plain-language commands. */
    suggestions: string[];
    /** The operator's most recent plain-language message. */
    userMessage: string;
    /** The assistant's natural-language reply describing what it will do. */
    assistantReply: string;
    /** Inline preview/confirm card title for a risky write. */
    confirmTitle: string;
    /** One-line summary of the proposed change inside the confirm card. */
    confirmSummary: string;
    /** Label on the confirm button of the inline card. */
    confirmAction: string;
    /** Composer placeholder for the bottom input. */
    composer: string;
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
