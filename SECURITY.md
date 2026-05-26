# Security Policy

Realm executes project-scoped configuration and eventually AI tools, so project trust is a core boundary.

## Reporting

Please report vulnerabilities through GitHub Security Advisories once the repository is public.

## Security Principles

- Project config is not trusted by default.
- Provider secrets must stay in user scope or environment variables.
- High-risk capabilities such as shell, network, and project writes require explicit trust and policy.
- Tool denials are auditable runtime events.
