# Security Policy

Realm executes project-scoped configuration and AI tool calls, so project trust
is a core product boundary. Treat any issue that can bypass trust, policy,
identity audit, provider-secret handling, or project-file write controls as a
security issue.

## Reporting

Please report vulnerabilities through GitHub Security Advisories. If advisories
are unavailable, open a minimal issue that says a private security report is
needed and avoid posting exploit details publicly.

Include:

- affected version or commit;
- operating system and install path;
- reproduction steps against a local fixture when possible;
- expected versus actual trust/policy behavior;
- whether provider credentials, project files, role memory, or hidden world
  state can be exposed or modified.

Do not include real provider keys, private project files, or third-party user
data in reports.

## Security Principles

- Project config is not trusted by default.
- Provider secrets must stay in user scope or environment variables.
- High-risk capabilities such as shell, network, and project writes require explicit trust and policy.
- Tool denials are auditable runtime events.

## In Scope

- Trust-tier bypasses.
- Capability-policy bypasses.
- Caller-controlled real operator or identity spoofing.
- Provider key leakage through config, logs, exports, traces, or packages.
- Unauthorized reads of role-private memory or hidden world state.
- Project-file writes that bypass approval, policy, or path constraints.
- Config patch stale-write, rollback, or confirmation bypasses.
- Package or binary distribution mistakes that include source-only secrets,
  runtime state, logs, or machine-local config.

## Out Of Scope

- Reports requiring destructive changes to third-party systems.
- Denial-of-service against public infrastructure outside the local Realm
  process.
- Vulnerabilities in model provider services unless Realm mishandles their
  credentials, responses, or tool permissions.

## Supported Versions

Realm is pre-1.0. Security fixes target the latest `main` branch and the latest
published release artifact when one exists.
