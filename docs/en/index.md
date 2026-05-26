# Realm Documentation

Realm is a project-scoped AI role runtime with a local messenger-style Web UI.

## Mental Model

Realm looks familiar on purpose:

- a narrow app rail;
- a conversation list;
- a central chat view;
- an optional right inspector for traces, state, settings, builders, and God controls.

Under that UI, Realm is an evented runtime:

```txt
project -> worlds -> rooms -> roles -> turns -> events -> state snapshots
```

## Configuration

Project configuration lives under `.agents/`:

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

User settings live under `REALM_HOME` or `~/.realm/` and store model provider references, preferred defaults, and Web UI preferences.

## Runtime

Realm uses Pi through npm packages:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`

The Pi CLI/RPC path is optional and visible. It is only used for diagnostics and compatibility smoke tests.

## Templates

```bash
realm init --template cultivation
realm init --template software-company
```

The software company template creates Product Manager, Architect, Engineer, QA, Test Expert, Security Reviewer, Doc Writer, and Release Manager roles. It also creates workflow state, review rooms, world-level artifact/review skills, and rules that keep project writes, shell commands, network access, and config writes behind approval.

## State And God

World state is structured and versioned. Roles can query only their visible slice. God/admin flows can apply state patches through audited commands:

- admin state patch;
- kill, mute, revive;
- controlled natural event;
- deterministic random natural event.

All committed state changes are snapshots and event log entries.

## Advanced Simulation

Simulation worlds can run deterministic ticks without spending a model call for every participant.
The scheduler uses a seeded low-cost @all activation pass, updates role energy and reputation,
records relationship and doctrine-memory changes, and keeps every decision auditable.

The Web UI exposes simulation controls in the right inspector:

- run N ticks;
- pause and resume;
- export replay and state hashes;
- fork a world snapshot and resume from a fork;
- start or stop a bounded background run.

The same controls are available through the local API:

```bash
curl -s http://127.0.0.1:3737/api/worlds/cultivation/simulation/status
curl -s -X POST http://127.0.0.1:3737/api/worlds/cultivation/simulation/ticks \
  -H 'content-type: application/json' \
  -d '{"ticks":2,"seed":"fixture-seed","maxActivations":1}'
curl -s http://127.0.0.1:3737/api/worlds/cultivation/simulation/export
```

## Development

```bash
bun install
bun run typecheck
bun run lint
bun test
bun run build:binary
bun run smoke:binary
bun run smoke:pi-rpc
```

## Terminal UI

`realm tui` is a terminal client for an already running Realm server. It uses the same API/client SDK contracts as the Web UI, so it does not duplicate runtime business logic.

```bash
realm tui --base-url http://127.0.0.1:3737 --once
realm tui --base-url http://127.0.0.1:3737 --send "hello from tui" --once
realm tui --base-url http://127.0.0.1:3737 --settings --once
```

Interactive commands include `:send`, `:id`, `:room`, `:settings`, `:model`, `:assistant`, `:refresh`, and `:q`.

## Documentation Website

The documentation website lives in `apps/docs` and is deployed to Cloudflare Pages.

Live site: <https://realm-docs.pages.dev>

```bash
bun run build:docs
wrangler pages deploy apps/docs/dist --project-name realm-docs
```

The site is bilingual and is intentionally separate from the runtime Web UI. Docs can evolve without coupling to app-service or Pi runtime code.

## Release

Realm supports two distribution paths:

- npm package: `@nicepkg/realm`, exposing the `realm` binary.
- GitHub release binaries built with `bun build --compile`.

CI covers Linux, macOS, and Windows. Docs are built as a separate workflow and can deploy to Cloudflare Pages when secrets are configured.

## Roadmap

The detailed plan lives at `memories/projects/realm-cli/plan.md` in AI Command Center.
