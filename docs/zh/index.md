# Realm 文档

Realm 是一个运行在项目里的 AI 角色世界运行时，并提供本地聊天式 Web UI。

## 心智模型

Realm 故意长得像熟悉的桌面聊天工具：

- 窄侧边栏；
- 会话列表；
- 中间聊天区；
- 右侧检查器，用于 trace、状态、设置、创建器和上帝控制。

但它的内部不是普通聊天壳，而是事件化运行时：

```txt
project -> worlds -> rooms -> roles -> turns -> events -> state snapshots
```

## 配置

项目配置位于 `.agents/`：

```txt
.agents/config.yaml
.agents/roles/<role-id>/role.yaml
.agents/roles/<role-id>/skills/<skill-name>/SKILL.md
.agents/skills/
.agents/worlds/<world-id>/world.yaml
.agents/worlds/<world-id>/initial-state.yaml
.agents/worlds/<world-id>/state.schema.yaml
.agents/worlds/<world-id>/visibility.yaml
```

用户级设置位于 `REALM_HOME` 或 `~/.realm/`，用于保存模型 provider 引用、默认模型和 Web UI 偏好。

## 运行时

Realm 通过 npm 包使用 Pi：

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`

Pi CLI/RPC 路径是可见的可选 fallback，只用于诊断和兼容性冒烟。

## 模板

```bash
realm init --template cultivation
realm init --template software-company
```

软件公司模板会创建 Product Manager、Architect、Engineer、QA、Test Expert、Security Reviewer、Doc Writer 和 Release Manager 角色，也会创建工作流状态、评审群、世界级 artifact/review skill，以及把项目写入、shell、联网和配置写入放到审批门后的规则。

## 状态和上帝

世界状态是结构化、版本化的。角色只能查询自己可见的状态切片。上帝和管理员通过审计命令修改状态：

- 管理员状态 patch；
- 击杀、禁言、复活；
- 受控自然事件；
- 确定性随机自然事件。

所有成功提交的状态变化都会进入快照和事件日志。

## 开发

```bash
bun install
bun run typecheck
bun run lint
bun test
bun run build:binary
bun run smoke:binary
bun run smoke:pi-rpc
```

## 文档站

文档站位于 `apps/docs`，部署到 Cloudflare Pages。

在线地址：<https://realm-docs.pages.dev>

```bash
bun run build:docs
wrangler pages deploy apps/docs/dist --project-name realm-docs
```

文档站支持中英文，并且刻意和运行时 Web UI 解耦。文档可以独立演进，不把 app-service 或 PI runtime 逻辑耦合进去。

## 发布

Realm 支持两种分发方式：

- npm 包：`@nicepkg/realm`，暴露 `realm` binary。
- GitHub Release 二进制：通过 `bun build --compile` 构建。

CI 覆盖 Linux、macOS、Windows。文档在独立 workflow 中构建，并在配置 Cloudflare secrets 后部署到 Cloudflare Pages。

## 路线图

详细计划在 AI Command Center 的 `memories/projects/realm-cli/plan.md`。
