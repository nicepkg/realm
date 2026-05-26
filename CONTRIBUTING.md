# Contributing

Realm aims for senior-engineer-grade maintainability.

## Requirements

- Bun 1.3+
- Node.js 22+

## Local Checks

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Code Quality

- Keep domain logic pure where practical.
- Keep adapters thin.
- Avoid duplicated parsing, policy, and state logic.
- Add tests for important behavior.
- Do not put provider secrets in project files.

## Pull Requests

Every PR should include:

- clear user-facing intent;
- tests for changed logic;
- docs updates for new user-visible behavior;
- migration notes when config or state format changes.
