# Litefold Calendar npm release routing

This file identifies the repository and routes release phases to their canonical
owners. It is not a release runbook.

## Identity

- Hosted repository: `tryagaindev/litefold-calendar`
- npm package: `@tryagaindev/litefold-calendar`
- Publication authority: the canonical hosted repository and its protected
  release workflows, never a fork or local checkout

Stop before a hosted mutation when any normalized identity differs.

## Canonical owners

| Need | Read |
| --- | --- |
| Supported release policy and invariants | [Release policy](../../../../docs/releasing.md) |
| Normal operator procedure and private release record | [Alpha release operations](../../../../docs/release-operations.md) |
| Hosted controls, unsupported transitions, exceptional actions, and recovery | [Release administration](../../../../docs/release-administration.md) |
| Artifact, installed-package, registry, signature, and provenance evidence | [Package verification](../../../../docs/package-verification.md) |
| Release-linked example deployment and rollback | [Static example deployment](../../../../docs/example-deployment.md) |
| Executable preparation state machine | [Prepare alpha release workflow](../../../../.github/workflows/prepare-alpha.yml) |
| Executable publication state machine | [Publish alpha release workflow](../../../../.github/workflows/publish-alpha.yml) |

Read the current phase in its canonical owner immediately before acting. The
documents and workflows override remembered behavior and this routing file.

## Operation boundary

Ordinary contributor commits and feature-branch pushes use the
[commit-and-push skill](../../commit-and-push/SKILL.md). Release-state
preparation, package publication, version tags, hosted releases, registry
metadata, release deployment, and release recovery use this skill and the
release runbooks above.

Use only the supported transition described by current release administration.
If a requested state has no reviewed procedure, stop and require a separately
designed and approved one. Describe recovery by the observed state and required
identity evidence, without relying on release chronology.
