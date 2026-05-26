export type Locale = "en" | "zh";

export type DocSection = {
  id: string;
  title: string;
  body: string[];
  bullets?: string[];
  code?: string;
  note?: string;
};

export type DocPage = {
  locale: Locale;
  languageLabel: string;
  switchLabel: string;
  title: string;
  subtitle: string;
  primaryAction: string;
  secondaryAction: string;
  badges: string[];
  nav: string[];
  sections: DocSection[];
};

export const pages: Record<Locale, DocPage> = {
  en: {
    locale: "en",
    languageLabel: "English",
    switchLabel: "中文",
    title: "Realm CLI Documentation",
    subtitle:
      "Run a project-local AI command center with roles, worlds, God adjudication, state, memory, traces, and a desktop-messenger Web UI.",
    primaryAction: "Quick start",
    secondaryAction: "Architecture",
    badges: ["Bun + TypeScript", "Pi package-first", "Local-first", "Binary-ready"],
    nav: [
      "Start",
      "Concepts",
      "Install",
      "Configuration",
      "Worlds",
      "State",
      "Governance",
      "Development",
      "Deployment",
    ],
    sections: [
      {
        id: "start",
        title: "Start",
        body: [
          "Realm is installed as a CLI and opened inside an existing project. The active project owns its .agents directory, while user secrets and provider settings stay in REALM_HOME or ~/.realm.",
          "The first UI is intentionally familiar: a narrow app rail, a conversation list, a central chat pane, and a contextual inspector. Advanced world, state, trace, and God controls extend the messenger model instead of replacing it.",
        ],
        code: "cd /path/to/project\nrealm init --template cultivation\nrealm trust --tier run-roles\nrealm\n\n# Development workflow\nrealm init --template software-company\nrealm trust --tier run-roles\nrealm",
      },
      {
        id: "concepts",
        title: "Core concepts",
        body: [
          "A project contains worlds. A world contains rooms, roles, state schemas, visibility rules, skills, God configuration, and event rules. Chat is only one projection of the event log.",
          "Roles behave like contacts. Rooms behave like group chats. Every world has one all-member group. God is the in-world adjudicator, while the owner remains the out-of-world administrator.",
        ],
        bullets: [
          "Role: a named AI identity with model, prompt skill, memory, and private workspace.",
          "World: a stateful context such as investment council, software company, or cultivation game.",
          "Room: a DM, temporary group, or world all-hands conversation.",
          "God: a privileged adjudicator that proposes structured state patches.",
        ],
      },
      {
        id: "install",
        title: "Install and run",
        body: [
          "During development, run Realm with Bun directly. For distribution, the same CLI can be published as an npm package or compiled into a Bun binary.",
          "Realm uses Pi through package dependencies. The Pi CLI/RPC path is explicit diagnostics only and is never required for normal role turns.",
        ],
        code: "bun install\nbun run apps/cli/src/index.ts init --template cultivation\nbun run apps/cli/src/index.ts init --template software-company\nbun run apps/cli/src/index.ts trust --tier run-roles\nbun run apps/cli/src/index.ts open\nbun run apps/cli/src/index.ts open --runtime fake\nbun run build:binary\n./dist/bin/realm doctor",
      },
      {
        id: "configuration",
        title: "Configuration model",
        body: [
          "Project configuration is portable and committed. Machine-local state, logs, provider keys, and runtime snapshots are kept out of git by default.",
          "Config changes can be produced visually or by the AI configuration assistant, but file writes pass through validation, conflict detection, history, and rollback.",
        ],
        code: ".agents/\n  config.yaml\n  config.local.yaml # gitignored\n  roles/<role>/role.yaml\n  roles/<role>/skills/<skill>/SKILL.md\n  worlds/<world>/world.yaml\n  worlds/<world>/initial-state.yaml\n  worlds/<world>/state.schema.yaml\n  worlds/<world>/visibility.yaml\n  state/          # gitignored\n  logs/           # gitignored",
      },
      {
        id: "worlds",
        title: "World templates",
        body: [
          "Realm ships with built-in templates for cultivation simulation and software company workflow, plus an investment council example direction.",
          "Templates are not decorative samples. They are acceptance targets for runtime behavior, policy, state visibility, and replayability. The software company template creates PM, architect, engineer, QA, test, security, docs, and release roles with workflow state and approval rules.",
        ],
        bullets: [
          "Cultivation: roles have realms, HP, artifacts, random encounters, disasters, and God-adjudicated outcomes.",
          "Investment council: roles debate thesis, risk, conviction, positions, and market context.",
          "Software company: PM, architect, engineer, QA, test, security, and docs roles collaborate through approval gates.",
        ],
      },
      {
        id: "state",
        title: "State and God adjudication",
        body: [
          "World state is structured, versioned, and patched. God does not silently mutate memory through prose. God proposes a patch, the reducer validates it, and the event store records the result.",
          "Roles query state through controlled tools and only receive the slice visible to them. Owner/admin views can inspect hidden state with audit trails.",
        ],
        bullets: [
          "Five state layers: public, private, hidden, derived, and meta.",
          "State patches are idempotent and version-aware.",
          "Kill, mute, revive, and natural events use typed God/admin actions.",
          "Snapshots support replay, rollback planning, and debugging.",
        ],
      },
      {
        id: "governance",
        title: "Tools, skills, and governance",
        body: [
          "Skills can be global, project-level, world-level, role-private, or role-prompt skills. Policies compile allowlists and blacklists into exact callable skill identities.",
          "High-risk tools such as shell, project file writes, and network access are denied unless explicitly granted by trusted configuration. Project trust decisions are machine-local in ~/.realm/trust.json.",
        ],
        bullets: [
          "Callable skills use exact ids such as role-private:<roleId>:<skill> and world:<worldId>:<skill>.",
          "Role prompt skills are not callable just because their directory is broadly included.",
          "Policy decisions are enforced by runtime services, not by UI hints.",
          "Denied actions become trace and audit events.",
          "The Web UI shows effective capabilities, denied skills, trust warnings, and secret-free settings import/export.",
        ],
      },
      {
        id: "development",
        title: "Development workflow",
        body: [
          "The codebase is a Bun + TypeScript monorepo with UI-agnostic runtime packages and separate app clients.",
          "Important logic is covered by unit and integration tests. Workflow artifacts, tasks, reviews, approval gates, and approved project patches are evented API contracts, not Web-only state. The software-company fixture proves discussion-to-patch-to-test-to-review behavior. UI flows are designed for browser automation and manual smoke testing.",
        ],
        code: "bun run lint\nbun run typecheck\nbun test\nbun run build\nbun run build:binary\nbun run smoke:binary\nbun run smoke:pi-rpc",
      },
      {
        id: "deployment",
        title: "Docs deployment",
        body: [
          "The documentation site is a separate Vite app under apps/docs. It can be built locally and deployed to Cloudflare Pages with Wrangler.",
          "The live site is https://realm-docs.pages.dev.",
          "The GitHub workflow builds docs on every change. Deployment runs when Cloudflare secrets are configured or when invoked manually from a trusted environment.",
        ],
        code: "bun run build:docs\nwrangler pages deploy apps/docs/dist --project-name realm-docs",
        note: "Recommended Cloudflare secrets: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.",
      },
    ],
  },
  zh: {
    locale: "zh",
    languageLabel: "中文",
    switchLabel: "English",
    title: "Realm CLI 文档",
    subtitle:
      "在任意项目里启动一个本地 AI 指挥中心：角色、世界、上帝裁判、状态、记忆、轨迹和类似桌面微信的 Web UI。",
    primaryAction: "快速开始",
    secondaryAction: "架构说明",
    badges: ["Bun + TypeScript", "PI 包优先", "本地优先", "支持二进制"],
    nav: ["开始", "概念", "安装", "配置", "世界", "状态", "治理", "开发", "部署"],
    sections: [
      {
        id: "start",
        title: "开始",
        body: [
          "Realm 是一个在项目目录内打开的 CLI。当前项目拥有自己的 .agents 目录；用户级密钥、模型 provider 和偏好配置保存在 REALM_HOME 或 ~/.realm。",
          "第一屏刻意保持熟悉：窄侧栏、会话列表、中间聊天区、右侧上下文面板。世界状态、上帝裁判、轨迹和设置都从这个聊天模型逐步展开。",
        ],
        code: "cd /path/to/project\nrealm init --template cultivation\nrealm trust --tier run-roles\nrealm\n\n# 开发工作流\nrealm init --template software-company\nrealm trust --tier run-roles\nrealm",
      },
      {
        id: "concepts",
        title: "核心概念",
        body: [
          "一个项目包含多个世界。世界包含房间、角色、状态 schema、可见性规则、skill、上帝配置和事件规则。聊天只是事件日志的一种投影。",
          "角色像联系人，房间像群聊，每个世界固定有一个全员群。上帝是世界内的裁判和叙事者，项目 owner 是世界外的管理员。",
        ],
        bullets: [
          "Role：带模型、提示词 skill、记忆和私有工作区的 AI 身份。",
          "World：投资委员会、软件公司、修真游戏等有状态上下文。",
          "Room：私聊、临时群或世界全员群。",
          "God：可以提出结构化状态 patch 的特权裁判。",
        ],
      },
      {
        id: "install",
        title: "安装和运行",
        body: [
          "开发时可以直接用 Bun 运行。发布时同一套 CLI 既可以作为 npm 包安装，也可以编译成 Bun 二进制。",
          "Realm 通过 npm 包集成 PI。PI CLI/RPC 只用于显式诊断和兼容性冒烟，不是普通角色 turn 的依赖。",
        ],
        code: "bun install\nbun run apps/cli/src/index.ts init --template cultivation\nbun run apps/cli/src/index.ts init --template software-company\nbun run apps/cli/src/index.ts trust --tier run-roles\nbun run apps/cli/src/index.ts open\nbun run apps/cli/src/index.ts open --runtime fake\nbun run build:binary\n./dist/bin/realm doctor",
      },
      {
        id: "configuration",
        title: "配置模型",
        body: [
          "项目配置应该可跨机器迁移并提交到 git。机器本地状态、日志、provider key 和运行时快照默认不进仓库。",
          "配置可以通过可视化表单或 AI 配置助手生成，但落盘前必须经过校验、冲突检测、历史记录和回滚能力。",
        ],
        code: ".agents/\n  config.yaml\n  config.local.yaml # gitignored\n  roles/<role>/role.yaml\n  roles/<role>/skills/<skill>/SKILL.md\n  worlds/<world>/world.yaml\n  worlds/<world>/initial-state.yaml\n  worlds/<world>/state.schema.yaml\n  worlds/<world>/visibility.yaml\n  state/          # gitignored\n  logs/           # gitignored",
      },
      {
        id: "worlds",
        title: "世界模板",
        body: [
          "Realm 内置修真模拟和软件公司工作流模板，并保留投资委员会作为示例方向。",
          "模板不是展示用样例，而是运行时行为、策略、状态可见性和可回放性的验收目标。软件公司模板会创建 PM、架构师、工程师、QA、测试、安全、文档和发布角色，并带工作流状态和审批规则。",
        ],
        bullets: [
          "修真世界：角色有境界、血条、法宝、奇遇、灾难和上帝裁决结果。",
          "投资委员会：角色围绕 thesis、风险、置信度、仓位和市场上下文争辩。",
          "软件公司：PM、架构师、工程师、QA、测试、安全和文档角色通过审批门协作。",
        ],
      },
      {
        id: "state",
        title: "状态和上帝裁判",
        body: [
          "世界状态是结构化、版本化、patch 驱动的。上帝不能只靠文字说状态变了，必须提出 patch，由 reducer 校验并写入事件日志。",
          "角色通过受控工具查询状态，只能看到自己可见的切片。Owner/Admin 可以在审计记录下查看隐藏状态。",
        ],
        bullets: [
          "五层状态：public、private、hidden、derived、meta。",
          "状态 patch 支持幂等 key 和版本校验。",
          "击杀、禁言、复活、自然事件都走 typed God/Admin action。",
          "快照用于回放、回滚规划和调试。",
        ],
      },
      {
        id: "governance",
        title: "工具、Skill 和治理",
        body: [
          "Skill 可以是全局、项目级、世界级、角色私有或角色 system prompt skill。策略会把 allowlist/blacklist 编译成精确的可调用 skill 身份。",
          "Shell、项目文件写入、联网等高风险工具默认拒绝，除非受信配置显式授权。项目 trust 决策保存在本机 ~/.realm/trust.json。",
        ],
        bullets: [
          "可调用 skill 使用 role-private:<roleId>:<skill>、world:<worldId>:<skill> 这类精确 id。",
          "角色 prompt skill 不会因为目录被广泛 include 就自动变成可调用 skill。",
          "策略由运行时服务强制执行，不靠 UI 提示。",
          "被拒绝的动作会进入 trace 和 audit。",
          "Web UI 展示有效能力、被拒绝的 skill、trust 风险提示，以及不含原始密钥的设置导入/导出。",
        ],
      },
      {
        id: "development",
        title: "开发工作流",
        body: [
          "代码库是 Bun + TypeScript monorepo。运行时包与 UI 解耦，Web/TUI/自动化客户端都应该通过 API 合同访问。",
          "重要逻辑需要单元测试和集成测试。工作流 artifact、task、review、approval gate 和审批后的项目 patch 是事件化 API 合同，不是 Web-only 状态。software-company fixture 证明了从讨论到 patch、测试、review 的闭环。UI 流程要能被浏览器自动化和手动冒烟验证。",
        ],
        code: "bun run lint\nbun run typecheck\nbun test\nbun run build\nbun run build:binary\nbun run smoke:binary\nbun run smoke:pi-rpc",
      },
      {
        id: "deployment",
        title: "文档部署",
        body: [
          "文档站是 apps/docs 下的独立 Vite 应用，可以本地构建并用 Wrangler 部署到 Cloudflare Pages。",
          "线上地址是 https://realm-docs.pages.dev。",
          "GitHub workflow 会构建文档。配置 Cloudflare secrets 后可以自动部署，也可以在受信本地环境手动部署。",
        ],
        code: "bun run build:docs\nwrangler pages deploy apps/docs/dist --project-name realm-docs",
        note: "建议配置 Cloudflare secrets：CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。",
      },
    ],
  },
};
