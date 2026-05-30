import type { Capabilities, FlowShowcase, Locale } from "./content-types.ts";

/**
 * The 6-flow showcase + honest capability/limits data, split out of content.ts to
 * keep that dictionary under the 500-line ceiling. Co-located with content.ts and
 * keyed by locale so the home page reads `flowShowcase[locale]` / `capabilities[locale]`.
 *
 * The `shot` ids here are the SINGLE source of truth shared with
 * scripts/capture-docs-shots.ts (which writes <shot>-desktop.png / <shot>-mobile.png)
 * and apps/docs/src/flow-showcase.tsx (which renders them). Keep the zh-CN
 * utterances identical to the English ones — the operator types the SAME Chinese
 * message regardless of UI locale, so the docs must not invent an English command.
 */

const utterances = {
  addRole: "加一个谨慎、爱钱的炼丹师，叫云遥",
  createWorld: "创建一个有宗门、对手和师父的修真世界",
  godAction: "顾辰风作弊，把他禁言",
  runTurn: "现在让顾辰风说话",
  setRule: "设定规则：每天掉一点灵气，灵石可以买丹药",
  stateInspect: "现在世界什么状态？",
} as const;

export const flowShowcase: Record<Locale, FlowShowcase> = {
  en: {
    eyebrow: "Six NL flows",
    title: "Talk to 天道 — every shot below is the real app",
    intro:
      "These are not mockups. scripts/capture-docs-shots.ts boots the web app against examples/cultivation-sim, types each plain-language message into the one chat window, confirms the risky writes, and saves what actually rendered.",
    shotCaption: "Real capture · fake runtime · examples/cultivation-sim",
    steps: [
      {
        shot: "create-world",
        label: "Create a world",
        utterance: utterances.createWorld,
        outcome:
          "天道 proposes the world in an inline confirm card; typing the confirmation phrase writes the world, roles, and state schema as files.",
      },
      {
        shot: "set-rule",
        label: "Set a rule",
        utterance: utterances.setRule,
        outcome:
          "The rule becomes a reviewable config patch; confirm and it lands in rules.yaml alongside the world's state schema.",
      },
      {
        shot: "add-role",
        label: "Add a role",
        utterance: utterances.addRole,
        outcome:
          "A new role account is proposed with its prompt and traits; after confirmation it joins the world and shows up in the context rail.",
      },
      {
        shot: "run-turn",
        label: "Run a role turn",
        utterance: utterances.runTurn,
        outcome:
          "The named role takes one audited turn; the fake runtime resolves it deterministically and streams the reply into the chat.",
      },
      {
        shot: "god-action",
        label: "A God action",
        utterance: utterances.godAction,
        outcome:
          "Adjudication routes to a guarded God action; the inline card carries the typed-confirmation gate before any state write.",
      },
      {
        shot: "state-inspect",
        label: "Inspect state",
        utterance: utterances.stateInspect,
        outcome:
          "天道 answers from the live world state — rooms, roles, and the latest values — as a read, with no write and no confirmation.",
      },
    ],
  },
  "zh-CN": {
    eyebrow: "六条自然语言流程",
    title: "对「天道」说话——下面每张图都是真实应用",
    intro:
      "这些不是效果图。scripts/capture-docs-shots.ts 会把 Web 应用启动在 examples/cultivation-sim 上，把每一句大白话敲进那个唯一的聊天窗口，确认危险写入，再把真实渲染出来的画面存成截图。",
    shotCaption: "真实截图 · fake 运行时 · examples/cultivation-sim",
    steps: [
      {
        shot: "create-world",
        label: "创建世界",
        utterance: utterances.createWorld,
        outcome:
          "天道在内联确认卡片里给出世界提案；输入确认文本后，世界、角色和状态 schema 会以文件形式真实写入。",
      },
      {
        shot: "set-rule",
        label: "设定规则",
        utterance: utterances.setRule,
        outcome:
          "这条规则变成可审查的配置补丁；确认后它会落进 rules.yaml，和世界的状态 schema 放在一起。",
      },
      {
        shot: "add-role",
        label: "添加角色",
        utterance: utterances.addRole,
        outcome:
          "系统给出带提示词和性格的新角色账号提案；确认后角色加入世界，并出现在上下文侧栏里。",
      },
      {
        shot: "run-turn",
        label: "运行角色回合",
        utterance: utterances.runTurn,
        outcome:
          "被点名的角色走一个可审计的回合；fake 运行时确定性地结算它，并把回复流式打进聊天。",
      },
      {
        shot: "god-action",
        label: "上帝动作",
        utterance: utterances.godAction,
        outcome: "裁决路由到有门槛的上帝动作；内联卡片在任何状态写入前都带着输入确认门槛。",
      },
      {
        shot: "state-inspect",
        label: "查看状态",
        utterance: utterances.stateInspect,
        outcome:
          "天道直接从实时世界状态作答——房间、角色和最新数值，这是一次读取，不写入、不需确认。",
      },
    ],
  },
};

export const capabilities: Record<Locale, Capabilities> = {
  en: {
    title: "Feature & limits",
    intro:
      "An honest account of what is wired to the real backend today and what still has rough edges. No facade.",
    worksTitle: "Works end-to-end",
    works: [
      "All six NL flows above drive the real backend: config patches (worlds / rules / roles), God actions, role turns, and state reads.",
      "Risky writes preview an inline confirm card and require the exact typed confirmation before anything is written.",
      "The fake runtime resolves every flow deterministically, so the full demo runs with no model key.",
      "Real providers (OpenAI + Gemini) drive intent interpretation when keys are present; the same client SDK backs both runtimes.",
      "Two surfaces, one runtime: the web chat window and the terminal TUI operate the same world.",
    ],
    limitsTitle: "Honest limits",
    limits: [
      "Some intent phrasings still fall back to the deterministic router instead of the model; reword if a message is misread.",
      "Real-provider keys may be project-scoped — a key that works in one project can be rejected in another.",
      "English-key requests return 401 in some environments; zh-CN utterances are the tested path.",
      "Package-first callable-skill invocation loads SKILL.md but does not yet run richer skill semantics.",
      "Role turns are audited but the model's reply quality depends on the provider and the role's prompt skill.",
    ],
  },
  "zh-CN": {
    title: "能力与边界",
    intro: "诚实交代今天哪些功能真正接到了后端、哪些还有毛刺。没有花架子。",
    worksTitle: "已经端到端可用",
    works: [
      "上面六条自然语言流程都驱动真实后端：配置补丁（世界 / 规则 / 角色）、上帝动作、角色回合，以及状态读取。",
      "危险写入会先弹出内联确认卡片，必须输入精确确认文本，才会真正写入。",
      "fake 运行时确定性地结算每一条流程，所以整套 demo 不需要模型 key 也能跑通。",
      "有 key 时，真实 provider（OpenAI + Gemini）负责意图解读；两个运行时共用同一套 client SDK。",
      "两个界面、一套运行时：Web 聊天窗口和终端 TUI 操作的是同一个世界。",
    ],
    limitsTitle: "诚实的边界",
    limits: [
      "部分意图表述仍会回退到确定性路由，而不是走模型；如果一句话被读错，换个说法即可。",
      "真实 provider 的 key 可能是按项目授权的——在一个项目能用的 key，换个项目可能被拒。",
      "在某些环境里，英文 key 的请求会返回 401；中文表述是经过测试的路径。",
      "包优先的可调用 skill 目前只加载 SKILL.md，更丰富的 skill 语义还没接上。",
      "角色回合可审计，但模型回复的质量取决于 provider 和角色的提示词 skill。",
    ],
  },
};
