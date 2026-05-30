# Realm Project: 锐峰科技董事会

This `.agents` directory is the portable Realm project definition for the
Boardroom Saga (商战) example. It mirrors `examples/cultivation-sim/.agents`:

- `config.yaml` — project name, default world (`boardroom`), skill scoping, trust.
- `config.local.example.yaml` — machine-local provider overrides (copy, do not commit secrets).
- `worlds/boardroom/` — world definition, roles, rules, state schema, seed state,
  visibility, natural events, God channel, and world-level callable skills.
- `roles/<id>/` — per-account role config plus a private role-prompt skill.
- `skills/` — project-scoped callable skills shared across the world.
- `state/`, `logs/` — local runtime output (gitignored except their README).

All ids, enums, and state keys stay English/stable per the project-template-strings
convention; only human-facing names, summaries, and prompts are zh-CN.
