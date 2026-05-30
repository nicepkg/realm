import { capabilities, flowShowcase } from "./content-flows.ts";
import type { DocsPage } from "./content-types.ts";

/**
 * The zh-CN docs page, split out of content.ts to keep that dictionary under the
 * 500-line ceiling. Co-located with content.ts; the `pages` map there reads this
 * as `pages["zh-CN"]`. Keep this in lockstep with the English page in content.ts.
 */
export const zhPage: DocsPage = {
  locale: "zh-CN",
  languageLabel: "简体中文",
  switchLabel: "English",
  menuLabel: "打开菜单",
  nav: [
    { label: "快速开始", value: "quick-start" },
    { label: "核心概念", value: "concepts" },
    { label: "Web UI", value: "web-ui" },
    { label: "TUI", value: "tui" },
    { label: "安装", value: "release-install" },
    { label: "配置", value: "configuration" },
    { label: "Pi", value: "pi-integration" },
    { label: "身份安全", value: "identity-safety" },
    { label: "模板", value: "templates" },
    { label: "API", value: "api-sdk" },
    { label: "贡献", value: "contributing" },
  ],
  hero: {
    title: "Realm",
    promise:
      "一个本地优先的 AI 指挥中心，第一屏就是一个聊天窗口。用自然语言对「天道」说话，就能创建世界、设定规则、运行角色、裁决和查看状态——AI 负责执行，精细控件只是少数例外。",
    installLabel: "安装",
    installCommand: "bunx @nicepkg/realm init --template cultivation",
    primaryAction: "三条命令启动",
    secondaryAction: "查看 GitHub",
    proof: ["Bun + TypeScript", "Pi 包优先", "Web + TUI", "可打包二进制"],
  },
  valueProps: [
    { label: "本地优先", value: "完全在本机运行，无需云账号，数据不离开仓库。" },
    {
      label: "自然语言优先",
      value: "只有一个聊天窗口。用大白话说出你要什么，AI 就去执行——不是一堆按钮。",
    },
    { label: "真正的角色账号", value: "每个角色都像一个账号，回合可审计、工具受限授权。" },
    { label: "Web 与终端", value: "同一套运行时，两个界面。浏览器或终端都能驱动同一个世界。" },
  ],
  preview: {
    chatTitle: "天道",
    emptyPrompt: "对「天道」说点什么",
    suggestions: ["创建一个修真世界", "让顾辰风心生退意", "现在世界什么状态?"],
    userMessage: "创建一个有宗门、对手和师父的修真世界。",
    assistantReply: "我来创建世界「修真界」，包含宗门、对手顾辰风和一位师父角色。写入前请确认：",
    confirmTitle: "创建世界 · 修真界",
    confirmSummary: "+1 世界 · +3 角色 · +1 状态 schema · 危险写入",
    confirmAction: "确认",
    composer: "对天道说……",
  },
  quickStart: {
    title: "三条命令启动一个世界",
    intro:
      "Realm 不要求你一开始就配置真实模型 key。先用确定性的 fake runtime 看清世界结构，之后再切换到真实 provider 跑角色。",
    steps: [
      { label: "初始化", value: "realm init --template cultivation" },
      { label: "信任项目", value: "realm trust --tier run-roles" },
      { label: "打开工作区", value: "realm open --runtime fake" },
    ],
  },
  concepts: {
    title: "你需要记住的模型",
    intro:
      "项目负责可迁移文件，世界负责状态，房间承载对话，角色像独立账号。上帝是有门槛的裁判界面，不是普通聊天联系人。",
    nodes: [
      { label: "Project", value: ".agents 配置、模板、skill、信任边界" },
      { label: "World", value: "房间、角色、状态 schema、可见性和事件" },
      { label: "Role", value: "模型、提示词 skill、记忆和受控工具" },
      { label: "God", value: "typed action、状态 patch、审计和回滚证据" },
    ],
  },
  tui: {
    title: "终端里的对话式指挥官，不是 readline 循环",
    intro:
      "TUI 就是装进终端里的同一个聊天窗口：用大白话对「天道」说出你要什么，AI 就去执行。冒号命令只是给高级用户的可选快捷方式，不需要背。",
    lines: [
      "Realm TUI | 修真 Demo",
      "World: 修真 Demo | Room: 全员群 | Speaking: owner",
      "你：创建一个有宗门的修真世界。",
      "天道：我来创建「修真界」，包含一个宗门。写入前请确认？",
      "你：让顾辰风发言一回合。",
      "你：现在世界什么状态？",
      "Enter 发送 · Ctrl+G 上帝控制台 · 危险写入需输入确认文本",
    ],
  },
  trust: {
    title: "默认本地优先",
    intro: "Realm 把仓库文件当成可迁移真相，把密钥、日志、provider key 和运行时状态留在本机。",
    bullets: [
      "项目配置在 .agents 下，像代码一样接受 review。",
      "机器本地设置在 REALM_HOME 或 ~/.realm。",
      "高风险动作经过策略、校验、审计和确认。",
      "Pi 包集成是常规路径；subprocess RPC 只是诊断兜底。",
    ],
  },
  examples: {
    title: "示例必须证明行为",
    intro:
      "下面每一项都对应一个真实交付物：要么是可运行的示例世界，要么是 init 模板。它们覆盖消息、状态可见性、上帝动作、角色 turn、工作流审批和回放。",
    items: [
      {
        label: "修真模拟",
        value:
          "examples/cultivation-sim——宗门、对手顾辰风和一位师父，含可见性、状态、技能和事件；在 fake runtime 上可端到端跑通。",
      },
      {
        label: "商战推演 / Boardroom saga",
        value:
          "examples/boardroom-saga——锐峰科技董事会，董事长/CFO/投资人三角色，季度推演、并购台账和隐藏的尽调黑料；证明自然语言指挥官不止能玩 修真。",
      },
      {
        label: "软件公司模板",
        value:
          "realm init --template software-company——PM、架构师、工程师、QA、安全和文档角色，直接生成一个全新项目。",
      },
    ],
  },
  flowShowcase: flowShowcase["zh-CN"],
  capabilities: capabilities["zh-CN"],
  sections: [
    {
      id: "release-install",
      eyebrow: "安装 / 发布",
      title: "支持 npm、源码和 Bun 二进制",
      body: "代码栈从头到尾保持 Bun + TypeScript。同一个 CLI 可以从源码运行、通过 npm 安装，也可以打成 Bun 二进制给不想装 Node 工具链的机器用。发布前必须构建 Web、docs、CLI 和 binary。",
      bullets: [
        "源码：bun run apps/cli/src/index.ts open --runtime fake",
        "包安装：npm i -g @nicepkg/realm",
        "二进制：bun run build:binary && ./dist/bin/realm doctor",
        "文档：bun run build:docs；有 Cloudflare 凭证时再用 Wrangler 部署。",
        "发布前要证明 Linux、macOS、Windows、docs、binary smoke、package smoke 和 Web 结构检查都通过。",
      ],
      code: "bun install\nbun run build\nbun run build:docs\nbun run build:binary\n./dist/bin/realm init --template cultivation\n./dist/bin/realm open --runtime fake",
    },
    {
      id: "configuration",
      eyebrow: "配置",
      title: "文件必须可审查",
      body: "世界、角色、房间、可见性、状态 schema 和可调用 skill 都是普通文件。配置助手可以提案，但落盘必须经过 patch 校验和回滚历史。",
      bullets: [
        ".agents/config.yaml 是项目入口。",
        "config.local.yaml、state 和 logs 只留在本机。",
        "配置 patch 带意图、影响文件、风险和恢复上下文。",
        "高风险 patch 必须输入 policy 返回的精确确认文本。",
        "应用前会重新检查文件哈希，避免旧预览覆盖新配置。",
      ],
      code: ".agents/\n  config.yaml\n  roles/<role>/role.yaml\n  worlds/<world>/world.yaml\n  worlds/<world>/state.schema.yaml\n  state/ # gitignored\n  logs/  # gitignored",
    },
    {
      id: "web-ui",
      eyebrow: "Web UI",
      title: "第一屏就是一个聊天窗口，用自然语言操作",
      body: "第一屏就是一个干净的聊天窗口。你用自然语言对系统——「天道」——说话，AI 就执行动作：创建世界、设定规则、加角色或调角色、运行角色回合、裁决、查看状态。只有在输入数值更快、或需要确认危险写入时，才会出现精细控件。",
      bullets: [
        "首屏是一段对话，不是工业控制面板。",
        "一句大白话映射到真实后端动作：配置补丁提案、上帝/状态动作、角色回合，或一次读取。",
        "危险写入只在聊天里弹出一张轻量的预览/确认卡片，绝不是一个巨大的 sheet。",
        "每个动作之后聊天会反馈发生了什么、世界实时更新；草稿在失败后保留并可重试。",
        "控件是少数例外——只有当输入一个数值比说一句话更快时才出现一个输入框或滑块。",
      ],
      code: "realm open --runtime fake\n# 说：创建一个修真世界  -> 预览卡片 -> 确认\n# 说：让顾辰风心生退意 / 现在世界什么状态?",
    },
    {
      id: "tui",
      eyebrow: "TUI",
      title: "终端里也用自然语言操作",
      body: "终端界面就是同一段对话：用大白话说出你要什么，AI 就去执行——创建世界、运行角色回合、裁决，或查看状态。冒号命令作为给高级用户的可选快捷方式保留，危险写入依然需要输入确认文本。",
      bullets: [
        "自然语言是主路径：「创建一个有宗门的修真世界」「让顾辰风发言一回合」「现在世界什么状态？」。",
        "当前项目、世界、房间和身份始终显示在聊天上方。",
        "Ctrl+G 打开有门槛的上帝控制台；危险写入仍需输入精确确认文本。",
        "冒号命令（如 :run-role）是给高级用户的可选快捷方式，不是你操作的方式。",
        "发送失败会把草稿保存在用户本地，重试时不丢内容。",
      ],
      code: "realm tui --base-url http://127.0.0.1:3737\n# 输入：创建一个有宗门的修真世界\n# 输入：让顾辰风发言一回合  ->  确认危险写入",
    },
    {
      id: "pi-integration",
      eyebrow: "Pi 集成",
      title: "角色回合走包优先",
      body: "Realm 通过包依赖集成 Pi，普通角色 turn 不依赖全局 pi 可执行文件。subprocess RPC 只用于诊断和兼容性冒烟。",
      bullets: [
        "角色 turn 使用 Realm policy 生成的受控工具。",
        "Trace 记录模型、用量、工具调用和失败原因。",
        "doctor 输出区分包运行时和 subprocess fallback。",
        "角色事件会记录包运行时元数据，便于审计和排障。",
        "显式 provider env 是 hermetic 的，不会混入环境变量里的 API key。",
      ],
      code: "realm doctor --fallback\nrealm open --runtime package\nbun run smoke:real-providers --provider google --timeout-ms 120000",
    },
    {
      id: "identity-safety",
      eyebrow: "身份安全",
      title: "角色账号必须显式",
      body: "代替角色发言是高风险动作。Realm 在 Web、TUI、API 和事件日志里都保留显示身份、真实操作者和审计记录。",
      bullets: [
        "Boss/owner 是默认输入身份。",
        "接管角色需要确认，并显示持续 banner。",
        "上帝不是普通聊天身份。",
        "切换世界会把发言身份重置回 Boss。",
        "公开 message API 会忽略调用方传入的真实操作者，并按 owner 审计。",
      ],
      code: "Boss -> + -> 雷军 -> 确认角色接管\n切换世界 -> 身份重置为 Boss\n上帝动作 -> 输入目标角色 id 确认",
    },
    {
      id: "api-sdk",
      eyebrow: "API",
      title: "一个运行时，多种客户端",
      body: "Web、TUI、测试和自动化都使用同一套类型化 API 合同和 client SDK。领域逻辑放在 packages 里，不塞进 React 组件或终端渲染。",
      bullets: [
        "Zod 合同定义消息、事件、patch、设置和模拟。",
        "Client SDK 封装角色 turn、设置、上帝动作和工作流端点。",
        "Service packages 在 UI 之外强制执行 policy 和 trust。",
        "Web 和 TUI 共享同一个 client SDK，不重复实现领域规则。",
        "SSE 和 WebSocket 暴露同一个事件模型。",
      ],
      code: "const client = new RealmHttpClient({ baseUrl });\nawait client.sendMessage({ worldId, roomId, content });\nawait client.startRoleTurn(worldId, roomId, roleId);",
    },
    {
      id: "contributing",
      eyebrow: "治理",
      title: "开源项目要经得起审查",
      body: "Realm 必须让贡献者信任：显式依赖、依赖审计、CI、release 检查、conventional changelog 方向，以及 UI 截图验收。",
      bullets: [
        "bun run check:deps 防止幽灵依赖。",
        "CI 构建 Web、docs、CLI binary 并运行测试。",
        "改动使用 conventional commits，并保持 package 依赖显式。",
        "源码文件保持 500 行以内，继续扩展前先拆模块。",
        "Agent Browser 截图是 UI 验收的一部分，不是可选润色。",
      ],
      code: "bun run lint\nbun run check\nbun run build\nbun run smoke:web-ui\nbun run smoke:docs-ui",
    },
  ],
  cta: {
    title: "在你的仓库里启动一个世界",
    body: "先用 fake runtime 跑通，再按项目成熟度增加模型 provider、角色 skill、世界状态和策略门槛。",
    install: "安装 Realm",
    github: "去 GitHub 点 Star",
  },
};
