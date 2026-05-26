# Realm CLI

Realm is a Bun + TypeScript monorepo.

## Engineering Rules

- Keep domain logic out of React, Hono, and CLI command handlers.
- Keep side effects behind adapters.
- Preserve DRY, SOLID, high cohesion, and low coupling.
- Use `node:path`, `node:os`, and URL APIs for cross-platform path handling.
- Never store provider secrets in project `.agents/` files.
- Important deterministic logic needs unit tests and integration tests.
- Web UI uses shadcn/ui, Tailwind CSS v4, Vite React, lucide-react, and Realm design tokens.

## Commands

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Current Milestone

P0/P1: config contracts, project init, event envelope, policy skeleton, state reducer skeleton, deterministic fake runtime, and CLI.
