import { capabilities, flowShowcase } from "./content-flows.ts";
import type { DocsPage, Locale } from "./content-types.ts";
import { zhPage } from "./content-zh.ts";

export type { DocSection, DocsPage, Locale, TextPair } from "./content-types.ts";
export { locales } from "./content-types.ts";

export const pages: Record<Locale, DocsPage> = {
  en: {
    locale: "en",
    languageLabel: "English",
    switchLabel: "简体中文",
    menuLabel: "Open menu",
    nav: [
      { label: "Quick start", value: "quick-start" },
      { label: "Concepts", value: "concepts" },
      { label: "Web UI", value: "web-ui" },
      { label: "TUI", value: "tui" },
      { label: "Install", value: "release-install" },
      { label: "Config", value: "configuration" },
      { label: "Pi", value: "pi-integration" },
      { label: "Safety", value: "identity-safety" },
      { label: "Templates", value: "templates" },
      { label: "API", value: "api-sdk" },
      { label: "Contributing", value: "contributing" },
    ],
    hero: {
      title: "Realm",
      promise:
        "A local-first AI command center with one beautiful chat window. Talk to 天道 in plain language to create worlds, set rules, run roles, adjudicate, and inspect state — the AI does the work, controls are the rare exception.",
      installLabel: "Install",
      installCommand: "bunx @nicepkg/realm init --template cultivation",
      primaryAction: "Start in 3 commands",
      secondaryAction: "View GitHub",
      proof: ["Bun + TypeScript", "Pi package-first", "Web + TUI", "Binary-ready"],
    },
    valueProps: [
      {
        label: "Local-first",
        value: "Runs entirely on your machine. No cloud account, no data leaving the repo.",
      },
      {
        label: "Natural language first",
        value:
          "One chat window. Say what you want in plain language; the AI runs the action — not a wall of buttons.",
      },
      {
        label: "Real role accounts",
        value: "Each role acts like an account, with audited turns and scoped tools.",
      },
      {
        label: "Web + terminal",
        value: "One runtime, two surfaces. Drive the same world from the browser or the TUI.",
      },
    ],
    preview: {
      chatTitle: "天道",
      emptyPrompt: "Talk to 天道",
      suggestions: [
        "Create a cultivation world",
        "Make Gu Chenfeng want to retreat",
        "What's the world state now?",
      ],
      userMessage: "Create a cultivation world with a sect, a rival, and a master.",
      assistantReply:
        "I'll create the world “Cultivation Realm” with a sect, the rival Gu Chenfeng, and a master role. Review before I write:",
      confirmTitle: "Create world · Cultivation Realm",
      confirmSummary: "+1 world · +3 roles · +1 state schema · risky write",
      confirmAction: "Confirm",
      composer: "Tell 天道…",
    },
    quickStart: {
      title: "Three commands to a running world",
      intro:
        "Realm is useful before you configure real model keys. Start with a deterministic fake runtime, inspect the world, then switch to provider-backed role turns when ready.",
      steps: [
        { label: "Initialize", value: "realm init --template cultivation" },
        { label: "Trust the project", value: "realm trust --tier run-roles" },
        { label: "Open the workspace", value: "realm open --runtime fake" },
      ],
    },
    concepts: {
      title: "The mental model",
      intro:
        "A project owns portable files. A world owns state. Rooms carry conversation. Roles behave like accounts. God is a guarded adjudication surface, not a casual chat contact.",
      nodes: [
        { label: "Project", value: ".agents config, templates, skills, trust boundary" },
        { label: "World", value: "rooms, roles, state schema, visibility and events" },
        { label: "Role", value: "model, prompt skill, memory and scoped tools" },
        { label: "God", value: "typed actions, state patches, audit and rollback evidence" },
      ],
    },
    tui: {
      title: "A conversational commander, not a readline loop",
      intro:
        "The TUI is the same chat window in your terminal: tell 天道 what you want in plain language and the AI runs it. Colon-commands are an optional power-user fast path, not something you have to memorize.",
      lines: [
        "Realm TUI | Cultivation Demo",
        "World: Cultivation Demo | Room: All Hands | Speaking: owner",
        "You: Create a cultivation world with a sect.",
        "天道: I'll create “Cultivation Realm” with a sect. Confirm before I write?",
        "You: Let Gu Chenfeng speak for one turn.",
        "You: What's the world state right now?",
        "Enter send · Ctrl+G God Console · type the confirmation for risky writes",
      ],
    },
    trust: {
      title: "Local-first by default",
      intro:
        "Realm treats repository files as portable truth and keeps secrets, logs, provider keys, and runtime state out of git.",
      bullets: [
        "Project config lives under .agents and can be reviewed like code.",
        "Machine-local settings live in REALM_HOME or ~/.realm.",
        "High-risk actions pass through policy, validation, audit, and confirmation.",
        "Pi package integration is the normal path; subprocess RPC is diagnostic fallback.",
      ],
    },
    examples: {
      title: "Examples that prove behavior",
      intro:
        "Every item below maps to a real shipped artifact: a runnable example world or an init template. They exercise messaging, state visibility, God actions, role turns, workflow approvals, and replay.",
      items: [
        {
          label: "Cultivation simulation",
          value:
            "examples/cultivation-sim — sect, rival Gu Chenfeng and a master, with visibility, state, skills and events; boots end-to-end on the fake runtime.",
        },
        {
          label: "Boardroom saga / 商战推演",
          value:
            "examples/boardroom-saga — 锐峰科技 board with 董事长/CFO/投资人 three roles, quarterly ticks, a deal ledger and hidden due-diligence dirt; proves the NL-first commander generalizes beyond 修真.",
        },
        {
          label: "Software company template",
          value:
            "realm init --template software-company — PM, architect, engineer, QA, security and docs roles, generated as a fresh project.",
        },
      ],
    },
    flowShowcase: flowShowcase.en,
    capabilities: capabilities.en,
    sections: [
      {
        id: "release-install",
        eyebrow: "Install / release",
        title: "Use npm, source, or a Bun-built binary",
        body: "The codebase stays Bun + TypeScript end to end. The same CLI can run from source, install from npm, or ship as a Bun binary for machines that should not install a Node toolchain. Release checks build the Web UI, docs, CLI and binary before publication.",
        bullets: [
          "Source: bun run apps/cli/src/index.ts open --runtime fake",
          "Package: npm i -g @nicepkg/realm",
          "Binary: bun run build:binary && ./dist/bin/realm doctor",
          "Docs: bun run build:docs, then deploy with Wrangler when Cloudflare credentials are present.",
          "CI should prove Linux, macOS, Windows, docs, binary smoke, package smoke and Web structure checks before a release is trusted.",
        ],
        code: "bun install\nbun run build\nbun run build:docs\nbun run build:binary\n./dist/bin/realm init --template cultivation\n./dist/bin/realm open --runtime fake",
      },
      {
        id: "configuration",
        eyebrow: "Configuration",
        title: "Files stay reviewable",
        body: "Worlds, roles, room definitions, visibility, state schema, and callable skills are plain files. Config assistants may propose changes, but they apply through patch validation and rollback history.",
        bullets: [
          ".agents/config.yaml is the project entry point.",
          "config.local.yaml, state and logs are local-only.",
          "Config patches carry intent, affected files, risk and recovery context.",
          "High-risk patches require the exact typed confirmation returned by policy.",
          "Apply checks file hashes again so stale previews cannot overwrite newer config.",
        ],
        code: ".agents/\n  config.yaml\n  roles/<role>/role.yaml\n  worlds/<world>/world.yaml\n  worlds/<world>/state.schema.yaml\n  state/ # gitignored\n  logs/  # gitignored",
      },
      {
        id: "web-ui",
        eyebrow: "Web UI",
        title: "One chat window, driven by natural language",
        body: "The first screen is a single beautiful chat window. You talk to the system — 天道/God — in plain language and the AI runs the action: create a world, set a rule, add or adjust a role, run a role turn, adjudicate, or inspect state. Precise controls only appear when a number is faster to type or a risky write needs confirming.",
        bullets: [
          "The home screen is a conversation, not an industrial-control dashboard.",
          "Plain-language intent maps to a real backend action: config-patch proposal, God/state action, role turn, or a read.",
          "Risky writes surface a lightweight inline preview/confirm card right in the chat — never a giant sheet.",
          "After each action the chat reports what happened and the world updates live; drafts survive failure and stay retryable.",
          "Controls are the rare exception — a field or slider only when typing a number beats a sentence.",
        ],
        code: "realm open --runtime fake\n# Say: 创建一个修真世界  -> preview card -> Confirm\n# Say: 让顾辰风心生退意 / 现在世界什么状态?",
      },
      {
        id: "tui",
        eyebrow: "TUI",
        title: "Natural language in the terminal",
        body: "The terminal surface is the same conversation: type what you want in plain language and the AI runs it — create a world, run a role's turn, adjudicate, or inspect state. Colon-commands stay available as an optional fast path for power users, and risky writes still require typed confirmation.",
        bullets: [
          "Plain language is the primary path: 'create a cultivation world', 'let Gu Chenfeng speak', 'what's the world state?'.",
          "Current project, world, room and identity stay visible above the chat.",
          "Ctrl+G opens the guarded God Console; risky writes still need the exact typed confirmation.",
          "Colon-commands (e.g. :run-role) are an optional power-user shortcut, not the way you operate.",
          "Failed sends preserve drafts under the user-local draft store, so nothing is lost on retry.",
        ],
        code: "realm tui --base-url http://127.0.0.1:3737\n# Type: Create a cultivation world with a sect\n# Type: Let Gu Chenfeng speak for one turn  ->  confirm the risky write",
      },
      {
        id: "pi-integration",
        eyebrow: "Pi integration",
        title: "Package-first role turns",
        body: "Realm integrates Pi through package dependencies so normal role turns do not require a global pi executable. The subprocess RPC path exists for diagnostics and compatibility smoke tests.",
        bullets: [
          "Role turns use scoped tools generated from Realm policy.",
          "Trace events record model, usage, tool calls and failures.",
          "Doctor output distinguishes package runtime from subprocess fallback.",
          "Package metadata is recorded on turn events for audit and support.",
          "Explicit provider env input is hermetic and does not merge ambient API keys.",
        ],
        code: "realm doctor --fallback\nrealm open --runtime package\nbun run smoke:real-providers --provider google --timeout-ms 120000",
      },
      {
        id: "identity-safety",
        eyebrow: "Identity safety",
        title: "Role accounts are explicit",
        body: "Speaking as a role is powerful and risky. Realm keeps the visible identity, real operator and audit trail explicit across Web, TUI, API and event store.",
        bullets: [
          "Boss/owner is the default composer identity.",
          "Role takeover uses confirmation and a persistent banner.",
          "God is not a normal chat identity.",
          "Switching worlds resets the speaking identity back to Boss.",
          "Public message APIs ignore caller-supplied real operators and audit the owner.",
        ],
        code: "Boss -> + -> Lei Jun -> Confirm role takeover\nWorld switch -> identity resets to Boss\nGod action -> typed target role confirmation",
      },
      {
        id: "api-sdk",
        eyebrow: "API",
        title: "One runtime, many clients",
        body: "Web, TUI, tests and automation all use the same typed API contracts and client SDK. Domain logic lives in packages, not in React components or terminal rendering.",
        bullets: [
          "Zod contracts define messages, events, patches, settings and simulation.",
          "Client SDK wraps role turns, settings, God actions and workflow endpoints.",
          "Service packages enforce policy and trust independent of UI.",
          "Web and TUI share the same client SDK instead of duplicating domain rules.",
          "Server-sent events and WebSocket streams expose the same event model.",
        ],
        code: "const client = new RealmHttpClient({ baseUrl });\nawait client.sendMessage({ worldId, roomId, content });\nawait client.startRoleTurn(worldId, roomId, roleId);",
      },
      {
        id: "contributing",
        eyebrow: "Governance",
        title: "Open-source project hygiene",
        body: "Realm is designed to be trusted by contributors: explicit dependencies, dependency audits, CI, release checks, conventional changelog direction and screenshot acceptance for UI surfaces.",
        bullets: [
          "bun run check:deps catches ghost dependencies.",
          "CI builds Web, docs, CLI binary and tests.",
          "Changes use conventional commits and keep package dependencies explicit.",
          "Source files stay below 500 lines or get split before more features land.",
          "Agent Browser screenshots are part of UI acceptance, not optional polish.",
        ],
        code: "bun run lint\nbun run check\nbun run build\nbun run smoke:web-ui\nbun run smoke:docs-ui",
      },
    ],
    cta: {
      title: "Build a world inside your repo",
      body: "Start with fake runtime, then add model providers, role skills, world state and policy gates when the project is ready.",
      install: "Install Realm",
      github: "Star on GitHub",
    },
  },
  "zh-CN": zhPage,
};
