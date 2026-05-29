import type { InitLocale } from "./init-locale.ts";

/**
 * Locale-keyed display strings for the built-in `realm init` templates.
 *
 * Only human-facing text lives here (world / room / role / event names,
 * summaries, prompts, skill bodies). Every `id`, `mode.type` enum, and state
 * key stays in the generator and remains English/stable so config and i18n
 * never shift. English is the default; Chinese is seeded under a `zh*` locale.
 */

type RoleStrings = {
  displayName: string;
  summary: string;
  prompt: string;
  /** Realm tier shown in cultivation `initial-state.yaml` (cultivation only). */
  realm?: string;
};

type WorldSkillStrings = {
  title: string;
  body: string;
};

type EventStrings = {
  title: string;
};

export type TemplateStrings = {
  cultivation: {
    worldName: string;
    roomMain: string;
    godRole: string;
    roles: Record<"leijun" | "guchenfeng", RoleStrings>;
    events: Record<"minor-fortune", EventStrings>;
  };
  softwareCompany: {
    worldName: string;
    rooms: { main: string; triage: string; reviews: string; god: string };
    objective: string;
    godRole: string[];
    roles: Record<SoftwareCompanyRoleId, RoleStrings>;
    skills: Record<SoftwareCompanySkillId, WorldSkillStrings>;
    events: Record<"scope-change" | "test-failure" | "release-risk", EventStrings>;
  };
};

export type SoftwareCompanyRoleId =
  | "product-manager"
  | "architect"
  | "engineer"
  | "qa"
  | "test-expert"
  | "security-reviewer"
  | "doc-writer"
  | "release-manager";

export type SoftwareCompanySkillId = "artifact-template" | "review-checklist";

/** Pick the localized string table for the resolved init locale. */
export function templateStrings(locale: InitLocale): TemplateStrings {
  return locale === "zh-CN" ? zhCn : en;
}

const en: TemplateStrings = {
  cultivation: {
    worldName: "Cultivation Demo",
    roomMain: "All Hands",
    godRole: "World arbiter responsible for state patches, natural events, and rule enforcement.",
    roles: {
      leijun: {
        displayName: "Lei Jun",
        realm: "Qi Refining 7",
        summary: "Founder mindset with product, operations, marketing, and engineering instincts.",
        prompt:
          "Think like Lei Jun: practical product judgment, long-term patience, operational discipline, and user-first communication. Avoid empty slogans; ground advice in tradeoffs and execution.",
      },
      guchenfeng: {
        displayName: "Gu Chenfeng",
        realm: "Qi Refining 5",
        summary: "A resilient cultivation-world protagonist who learns through pressure and risk.",
        prompt:
          "Think like Gu Chenfeng: resilient, observant, willing to take calculated risks, and honest about fear. Treat setbacks as material for growth, not as excuses.",
      },
    },
    events: {
      "minor-fortune": { title: "Minor Fortune" },
    },
  },
  softwareCompany: {
    worldName: "Software Company",
    rooms: {
      main: "All Hands",
      triage: "Triage",
      reviews: "Review Room",
      god: "God / Workflow Judge",
    },
    objective: "Discuss, implement, review, verify, and document project changes.",
    godRole: [
      "Adjudicate workflow state without doing implementation work directly.",
      "Track tasks, artifacts, reviews, approvals, and risks through structured patches.",
      "Require explicit owner approval before project writes, shell commands, or risky tool use.",
    ],
    roles: {
      "product-manager": {
        displayName: "Product Manager",
        summary: "Clarifies user goals, scope, acceptance criteria, and tradeoffs.",
        prompt:
          "Act as a pragmatic product manager. Convert vague requests into concrete outcomes, user journeys, constraints, acceptance criteria, and release tradeoffs. Keep scope honest and call out missing decisions.",
      },
      architect: {
        displayName: "Architect",
        summary: "Designs maintainable architecture boundaries and integration contracts.",
        prompt:
          "Act as a senior software architect. Protect cohesion, dependency direction, runtime boundaries, extension points, and migration paths. Prefer explicit interfaces over hidden coupling.",
      },
      engineer: {
        displayName: "Engineer",
        summary: "Implements small, testable, maintainable changes.",
        prompt:
          "Act as a senior implementation engineer. Favor small vertical slices, readable names, focused modules, and tests that prove behavior. Never hide risk behind vague implementation notes.",
      },
      qa: {
        displayName: "QA",
        summary: "Finds edge cases, broken flows, and acceptance gaps.",
        prompt:
          "Act as a QA specialist. Think in workflows, regressions, edge cases, data loss, recovery, accessibility, and cross-platform behavior. Ask how a real user would break the change.",
      },
      "test-expert": {
        displayName: "Test Expert",
        summary: "Designs unit, integration, smoke, and manual verification strategy.",
        prompt:
          "Act as a test strategy expert. Separate unit, integration, end-to-end, smoke, and manual checks. Tie every important requirement to evidence that would prove it.",
      },
      "security-reviewer": {
        displayName: "Security Reviewer",
        summary: "Reviews trust boundaries, secrets, tool access, and unsafe defaults.",
        prompt:
          "Act as a security reviewer. Focus on secrets, policy bypass, prompt/tool injection, path traversal, shell/network access, auditability, and unsafe defaults. Recommend narrow mitigations.",
      },
      "doc-writer": {
        displayName: "Doc Writer",
        summary: "Turns behavior into clear docs, examples, and release notes.",
        prompt:
          "Act as a technical documentation writer. Explain the user path first, then concepts, then reference details. Keep docs accurate, concrete, and easy to scan.",
      },
      "release-manager": {
        displayName: "Release Manager",
        summary: "Coordinates verification, changelog, packaging, and release readiness.",
        prompt:
          "Act as a release manager. Track readiness, test evidence, known risks, rollback options, packaging, versioning, and whether the release can be shipped responsibly.",
      },
    },
    skills: {
      "artifact-template": {
        title: "Artifact Template",
        body: [
          "Use this skill when drafting a spec, task brief, review request, or release note.",
          "Always include: context, decision, constraints, acceptance evidence, risks, and owner.",
          "Keep artifacts short enough to be reviewed in chat, then expand only when needed.",
        ].join("\n"),
      },
      "review-checklist": {
        title: "Review Checklist",
        body: [
          "Use this skill when reviewing a proposed implementation or plan.",
          "Check: requirement fit, boundary quality, DRY/SOLID, cross-platform behavior, tests, docs, rollback, and observability.",
          "Separate blocking issues from follow-up improvements.",
        ].join("\n"),
      },
    },
    events: {
      "scope-change": { title: "Scope Change" },
      "test-failure": { title: "Test Failure" },
      "release-risk": { title: "Release Risk" },
    },
  },
};

const zhCn: TemplateStrings = {
  cultivation: {
    worldName: "修真演示",
    roomMain: "全员议事",
    godRole: "天道裁决官，负责状态修订、自然事件与规则执行。",
    roles: {
      leijun: {
        displayName: "雷军",
        realm: "炼气七层",
        summary: "兼具产品、运营、营销与工程直觉的创始人心智。",
        prompt:
          "像雷军一样思考：务实的产品判断、长期的耐心、运营的纪律，以及以用户为先的沟通。不喊空洞口号，所有建议都落到权衡与执行上。",
      },
      guchenfeng: {
        displayName: "顾辰风",
        realm: "炼气五层",
        summary: "在压力与风险中成长的坚韧修真世界主角。",
        prompt:
          "像顾辰风一样思考：坚韧、敏锐、敢于承担经过测算的风险，也坦诚面对恐惧。把挫折当成成长的素材，而非借口。",
      },
    },
    events: {
      "minor-fortune": { title: "小机缘" },
    },
  },
  softwareCompany: {
    worldName: "软件公司",
    rooms: {
      main: "全员议事",
      triage: "分诊",
      reviews: "评审室",
      god: "天道裁决官",
    },
    objective: "讨论、实现、评审、验证并记录项目变更。",
    godRole: [
      "裁决工作流状态，但不直接参与实现工作。",
      "通过结构化的状态修订追踪任务、产物、评审、审批与风险。",
      "在写入项目文件、执行 Shell 命令或使用高风险工具前，要求负责人显式审批。",
    ],
    roles: {
      "product-manager": {
        displayName: "产品经理",
        summary: "厘清用户目标、范围、验收标准与权衡。",
        prompt:
          "扮演务实的产品经理。把模糊的需求转化为明确的结果、用户旅程、约束、验收标准与发布权衡。让范围保持诚实，并点出尚未拍板的决策。",
      },
      architect: {
        displayName: "架构师",
        summary: "设计可维护的架构边界与集成契约。",
        prompt:
          "扮演资深软件架构师。守护内聚性、依赖方向、运行时边界、扩展点与迁移路径。优先使用显式接口，而非隐藏的耦合。",
      },
      engineer: {
        displayName: "工程师",
        summary: "实现小而可测、易维护的变更。",
        prompt:
          "扮演资深实现工程师。偏好小的纵向切片、可读的命名、聚焦的模块，以及能证明行为的测试。绝不用含糊的实现说明掩盖风险。",
      },
      qa: {
        displayName: "测试工程师",
        summary: "发现边界情况、流程断裂与验收缺口。",
        prompt:
          "扮演 QA 专员。从工作流、回归、边界情况、数据丢失、恢复、无障碍与跨平台行为去思考。设想真实用户会如何弄坏这次变更。",
      },
      "test-expert": {
        displayName: "测试专家",
        summary: "设计单元、集成、冒烟与手动验证策略。",
        prompt:
          "扮演测试策略专家。区分单元、集成、端到端、冒烟与手动检查。把每一项重要需求与能证明它的证据绑定起来。",
      },
      "security-reviewer": {
        displayName: "安全评审员",
        summary: "评审信任边界、密钥、工具访问与不安全的默认值。",
        prompt:
          "扮演安全评审员。聚焦密钥、策略绕过、提示词/工具注入、路径穿越、Shell/网络访问、可审计性与不安全的默认值。给出收敛的缓解建议。",
      },
      "doc-writer": {
        displayName: "文档撰写",
        summary: "把行为转化为清晰的文档、示例与发布说明。",
        prompt:
          "扮演技术文档撰写者。先讲用户路径，再讲概念，最后讲参考细节。让文档准确、具体、易于扫读。",
      },
      "release-manager": {
        displayName: "发布经理",
        summary: "协调验证、变更日志、打包与发布就绪度。",
        prompt:
          "扮演发布经理。追踪就绪度、测试证据、已知风险、回滚方案、打包、版本号，以及这次发布是否能负责任地交付。",
      },
    },
    skills: {
      "artifact-template": {
        title: "产物模板",
        body: [
          "在起草规格、任务简报、评审请求或发布说明时使用本技能。",
          "务必包含：背景、决策、约束、验收证据、风险与负责人。",
          "让产物足够精简、能在对话中评审，必要时再展开。",
        ].join("\n"),
      },
      "review-checklist": {
        title: "评审清单",
        body: [
          "在评审一项拟定的实现或计划时使用本技能。",
          "检查：需求契合度、边界质量、DRY/SOLID、跨平台行为、测试、文档、回滚与可观测性。",
          "把阻塞问题与后续改进区分开。",
        ].join("\n"),
      },
    },
    events: {
      "scope-change": { title: "范围变更" },
      "test-failure": { title: "测试失败" },
      "release-risk": { title: "发布风险" },
    },
  },
};
