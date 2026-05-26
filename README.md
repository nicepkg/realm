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
- role prompt skills and callable skill discovery;
- Pi package bridge for role turns;
- role memory and private world state access;
- God state patches, kill/mute/revive actions, natural events, and deterministic random natural events;
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

For a deterministic no-key demo, use the fake vertical slice runtime:

```bash
bun run apps/cli/src/index.ts open --runtime fake
```

After npm publishing, the intended install path is:

```bash
bun add -g @nicepkg/realm
realm init --template cultivation
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
