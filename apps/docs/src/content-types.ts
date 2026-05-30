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

/**
 * One of the 6 core natural-language flows shown in the docs showcase. Each step
 * pairs a REAL captured screenshot (written by scripts/capture-docs-shots.ts)
 * with the exact zh-CN utterance the operator typed and one honest line of what
 * the live backend did. `shot` is the base file name under public/shots/ (the
 * showcase appends the desktop/mobile suffix), kept in code so the showcase and
 * the capture script reference a single source of truth.
 */
export type FlowStep = {
  /** Stable id, also used as the base screenshot file name under public/shots/. */
  shot: string;
  /** Short label for the flow (e.g. "创建世界" / "Create a world"). */
  label: string;
  /** The exact plain-language message the operator typed into the chat. */
  utterance: string;
  /** One honest line of what the real backend did — copy, not marketing. */
  outcome: string;
};

/**
 * The "能力与边界 / Feature & limits" block: an honest split between what genuinely
 * works end-to-end today and the real, named limitations. No marketing gloss.
 */
export type Capabilities = {
  title: string;
  intro: string;
  /** Heading for the "works end-to-end" column. */
  worksTitle: string;
  works: string[];
  /** Heading for the honest-limits column. */
  limitsTitle: string;
  limits: string[];
};

/** The flow-showcase section: an intro plus the 6 captured NL flows. */
export type FlowShowcase = {
  eyebrow: string;
  title: string;
  intro: string;
  /** Caption shown under each shot pair to explain it is a real capture. */
  shotCaption: string;
  steps: FlowStep[];
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
  /** The 6 core NL flows, each with a REAL captured screenshot. */
  flowShowcase: FlowShowcase;
  /** Honest "能力与边界" block: what works end-to-end vs real limits. */
  capabilities: Capabilities;
  sections: DocSection[];
  cta: {
    title: string;
    body: string;
    install: string;
    github: string;
  };
};

export const locales = ["en", "zh-CN"] as const;
