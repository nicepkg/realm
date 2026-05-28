# Contributing

Realm aims for senior-engineer-grade maintainability.

## Requirements

- Bun 1.3+
- Node.js 22+

## Local Checks

```bash
bun install
bun run check
bun run lint
bun run build
bun run build:docs
bun run smoke:tui
bun run smoke:package
```

## Code Quality

- Keep domain logic pure where practical.
- Keep adapters thin.
- Avoid duplicated parsing, policy, and state logic.
- Add tests for important behavior.
- Keep source files under 500 lines; `bun run check:files` enforces this for `apps`, `packages`, and `scripts`.
- Declare direct package imports in the workspace that uses them; `bun run check:deps` enforces this.
- Do not put provider secrets in project files.

## Commit Format

Use Angular/conventional commit subjects:

```text
type(scope): subject
```

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

Release Please reads these commits to open release PRs, update
`CHANGELOG.md`, bump `package.json`, and create GitHub releases. When the
release PR is merged, the tag release workflow builds the Bun binaries.

## Pull Requests

Every PR should include:

- clear user-facing intent;
- tests for changed logic;
- docs updates for new user-visible behavior;
- migration notes when config or state format changes.
