# Realm CLI

Realm 是一个本地优先、运行在项目目录里的 AI 角色运行时。

在项目里执行 `realm`，它会启动一个类似桌面版微信的本地 Web UI：世界、全员群、临时群、私聊、角色、上帝裁判、状态、记忆、trace 和设置都放在一个熟悉的聊天界面里。

Realm 底层直接使用 Pi 的 npm 包，而不是要求用户全局安装 Pi CLI：

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`

Pi CLI/RPC 子进程路径只作为显式诊断和兼容性冒烟，不是正常运行路径。

## 当前状态

当前垂直切片已经可运行：

- 初始化项目 `.agents/`；
- 桌面微信式本地 Web UI；
- 用户级和项目级设置界面；
- 角色、房间、消息、私聊、临时群、全员群；
- 软件公司工作流事件：artifact、task、review、approval gate 和审批后的项目 patch；
- 已测试的软件公司 fixture 流程：从讨论到 patch、验证和 review；
- 角色 prompt skill、完整可调用 skill 身份、allowlist/blacklist 编译；
- 能力和 skill 的有效治理矩阵 UI，包含拒绝原因和 trust 风险提示；
- 不导出原始 provider 密钥的设置导入/导出；
- Pi package bridge 运行角色回合；
- 角色记忆和私有状态访问；
- 上帝状态 patch、击杀/禁言/复活、自然事件、确定性随机自然事件；
- 事件存储，支持 SSE 和 WebSocket；
- 配置 patch 提案、应用、回滚、迁移和保留注释的 YAML 写入；
- Bun 编译 CLI 二进制。

## 快速开始

```bash
bun install
bun run apps/cli/src/index.ts init --template cultivation
bun run apps/cli/src/index.ts trust --tier run-roles
bun run apps/cli/src/index.ts open
```

开发工作流模板：

```bash
bun run apps/cli/src/index.ts init --template software-company
bun run apps/cli/src/index.ts trust --tier run-roles
bun run apps/cli/src/index.ts open
```

npm 发布后的目标安装方式：

```bash
bun add -g @nicepkg/realm
realm init --template cultivation
realm init --template software-company
realm trust --tier run-roles
realm
```

二进制版本通过 Bun compile 构建，并作为 GitHub Release artifact 发布。

常用开发命令：

```bash
bun run typecheck
bun run lint
bun test
bun run build:binary
bun run smoke:binary
bun run smoke:pi-rpc
```

## 项目结构

Realm 读取和写入项目里的：

```txt
<project>/.agents/
  config.yaml
  roles/<role-id>/role.yaml
  roles/<role-id>/skills/<skill-name>/SKILL.md
  skills/
  worlds/<world-id>/world.yaml
  worlds/<world-id>/initial-state.yaml
  worlds/<world-id>/state.schema.yaml
  worlds/<world-id>/visibility.yaml
  state/
  logs/
```

用户级设置位于 `REALM_HOME` 或 `~/.realm/`。

## 工程原则

- 本地优先，项目自包含。
- Pi package-first，不依赖全局 Pi CLI。
- Web UI 先行，但架构预留 TUI。
- 先给用户熟悉的聊天心智模型，再逐步露出高级能力。
- 遵循 DRY、SOLID、高内聚、低耦合。
- 跨平台、跨机器。
- 重要逻辑必须有单元测试和集成测试。

## 治理

可调用 skill 使用精确身份，例如 `role-private:<roleId>:<skill>` 和
`world:<worldId>:<skill>`。角色 prompt skill 默认只用于 system prompt 组装，除非通过策略显式共享为可调用
skill。运行时拒绝 name-only skill read。

设置面板会展示每个 world/role 的有效能力和 skill 策略。`shell.run`、`network.fetch`、
`fs.project.write`、`config.write` 等高风险能力默认拒绝，只有策略和 trust 都允许时才会打开。设置导出只写可迁移 JSON
和 provider 环境变量引用，不写原始 API key。

## 文档

- 在线文档站：<https://realm-docs.pages.dev>
- 英文文档：[docs/en](docs/en/index.md)
- 中文文档：[docs/zh](docs/zh/index.md)
- 文档站源码：[apps/docs](apps/docs)
- 默认 Cloudflare Pages 项目名：`realm-docs`

本地构建文档站：

```bash
bun run build:docs
```

通过 Wrangler 部署：

```bash
bun run deploy:docs
```

## 发布

仓库已包含：

- Linux、macOS、Windows 跨平台 CI；
- 文档构建和 Cloudflare Pages workflow；
- Bun 编译二进制的 GitHub Release workflow；
- `@nicepkg/realm` npm 包元数据和 `realm` binary 入口。

## License

MIT
