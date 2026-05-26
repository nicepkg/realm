# Realm CLI

Realm is a local-first AI role runtime for project-scoped worlds.

Run `realm` inside a project and it starts a local Web UI that feels like a desktop messenger: worlds, all-hands rooms, temporary groups, direct messages, roles, God adjudication, state, memory, traces, and settings all live behind a familiar chat surface.

Realm uses Pi as packages, not as a required global CLI wrapper:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`

The optional Pi CLI/RPC subprocess path exists only for explicit diagnostics and compatibility smoke tests.

## Status

Realm is under active development, but the current vertical slice is usable:

- project `.agents/` initialization;
- desktop-WeChat-style local Web UI;
- user and project settings UI;
- roles, rooms, messages, DMs, groups, and all-hands rooms;
- software company workflow events for artifacts, tasks, reviews, approval gates, and approved project patches;
- a tested software-company fixture flow from discussion to patch, verification, and review;
- role prompt skills, full callable skill identity, and skill allowlist/blacklist compilation;
- effective policy matrix UI for capabilities, denied skills, and trust-risk warnings;
- settings import/export without raw provider secrets;
- Pi package bridge for role turns;
- role memory and private world state access;
- terminal UI client that uses the same API/client SDK as the Web UI;
- God state patches, kill/mute/revive actions, natural events, deterministic random natural events, and world event replay;
- advanced simulation controls for deterministic ticks, low-cost @all activation, energy, reputation, relationships, doctrine memory, background runs, pause/resume, export, and forks;
- event store with SSE and WebSocket streaming;
- config patch proposals, apply, rollback, migration, and comment-preserving YAML writes;
- Bun-compiled CLI binary.

## Quick Start

```bash
bun install
bun run apps/cli/src/index.ts init --template cultivation
bun run apps/cli/src/index.ts trust --tier run-roles
bun run apps/cli/src/index.ts open
```

For the development workflow template:

```bash
bun run apps/cli/src/index.ts init --template software-company
bun run apps/cli/src/index.ts trust --tier run-roles
bun run apps/cli/src/index.ts open
```

For a deterministic no-key demo, use the fake vertical slice runtime:

```bash
bun run apps/cli/src/index.ts open --runtime fake
```

Use the terminal client against a running local server:

```bash
bun run apps/cli/src/index.ts tui --base-url http://127.0.0.1:3737 --once
bun run apps/cli/src/index.ts tui --base-url http://127.0.0.1:3737 --send "hello from tui" --once
bun run apps/cli/src/index.ts tui --base-url http://127.0.0.1:3737 --settings --once
```

Advanced simulation controls are available in the Web UI right inspector and through the local API:

```bash
curl -s http://127.0.0.1:3737/api/worlds/cultivation/simulation/status
curl -s -X POST http://127.0.0.1:3737/api/worlds/cultivation/simulation/ticks \
  -H 'content-type: application/json' \
  -d '{"ticks":2,"seed":"fixture-seed","maxActivations":1}'
curl -s http://127.0.0.1:3737/api/worlds/cultivation/simulation/export
```

After npm publishing, the intended install path is:

```bash
bun add -g @nicepkg/realm
realm init --template cultivation
realm init --template software-company
realm trust --tier run-roles
realm
```

Binary releases are built with Bun compile and published from GitHub release artifacts.

Useful development commands:

```bash
bun run typecheck
bun run lint
bun test
bun run build:binary
bun run smoke:binary
bun run smoke:pi-rpc
```

## Project Layout

Realm reads and writes project configuration under:

```txt
<project>/.agents/
  config.yaml
  config.local.yaml        # gitignored machine-local overrides
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

User-level settings live under `REALM_HOME` or `~/.realm/`.
Project trust decisions are machine-local and stored in `~/.realm/trust.json`.

## Design Principles

- Local-first, project-scoped runtime.
- Package-first Pi integration.
- Web UI first, TUI-ready architecture.
- Familiar messenger surface before advanced controls.
- DRY, SOLID, high cohesion, low coupling.
- Cross-platform and cross-machine by default.
- Important logic covered by unit and integration tests.

## Governance

Callable skills use exact identities such as `role-private:<roleId>:<skill>` and
`world:<worldId>:<skill>`. Role prompt skills are reserved for system prompt assembly unless
explicitly shared as callable skills through policy. The runtime rejects name-only skill reads.

The Settings panel shows the effective capability and skill policy per world/role. High-risk
capabilities such as `shell.run`, `network.fetch`, `fs.project.write`, and `config.write` remain
denied unless policy and trust allow them. Settings export writes portable JSON with provider
environment-variable references, not raw API keys.

## Documentation

- Live documentation site: <https://realm-docs.pages.dev>
- English docs: [docs/en](docs/en/index.md)
- Chinese docs: [docs/zh](docs/zh/index.md)
- Chinese README: [README.zh-CN.md](README.zh-CN.md)
- Docs site source: [apps/docs](apps/docs)
- Default Cloudflare Pages project: `realm-docs`

Build the documentation site locally:

```bash
bun run build:docs
```

Deploy with Wrangler:

```bash
bun run deploy:docs
```

## Release

The repository includes:

- cross-platform CI for Linux, macOS, and Windows;
- docs build and Cloudflare Pages workflow;
- GitHub release workflow for Bun-compiled binaries;
- npm package metadata for `@nicepkg/realm` with the `realm` binary.

## License

MIT
