# Cultivation Sim

Complete Realm example project for a local-first cultivation simulation.

## Run

```bash
realm doctor
realm open --runtime fake
realm tui --once
```

For source checkout smoke tests:

```bash
bun run ../../apps/cli/src/index.ts open --runtime fake
bun run ../../apps/cli/src/index.ts tui --once
```

## What This Covers

- A simulation world with tick-based time.
- Three role accounts with private role-prompt skills.
- Project and world callable skills.
- Visibility rules for public, private, hidden, derived, and meta state.
- State/log directories documented as local runtime output.

Copy `.agents/config.local.example.yaml` to `.agents/config.local.yaml` for machine-local provider overrides.
