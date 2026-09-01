# Litefold Calendar common-change routing

This file identifies the repository and routes ordinary change delivery to its
canonical policies. It is not a second contributor runbook.

## Identity and boundary

- Hosted repository: `tryagaindev/litefold-calendar`
- npm package: `@tryagaindev/litefold-calendar`
- Ordinary delivery target: a reviewed feature branch
- Administrative boundary: release preparation, package publication, tags,
  hosted releases, registry changes, deployment, and recovery are excluded

When the requested work crosses that administrative boundary, stop and route to
[release operations](../../../../docs/release-operations.md) and the
[release-to-npm skill](../../release-to-npm/SKILL.md).

## Canonical owners

| Need | Read |
| --- | --- |
| Contributor policy, change obligations, and review expectations | [Contributing](../../../../CONTRIBUTING.md) |
| Toolchain setup and copyable validation commands | [Contributor commands](../../../../CONTRIBUTOR_COMMANDS.md) |
| Code and documentation conventions | [Code style](../../../../docs/code-style.md) |
| Public API contracts | [API reference](../../../../docs/api.md) |
| Architecture and package boundaries | [Architecture](../../../../docs/architecture.md) |
| Visual behavior and responsive geometry | [Design contract](../../../../DESIGN.md) |
| Accessibility behavior and evidence | [Accessibility](../../../../ACCESSIBILITY.md) |
| Security-sensitive change expectations | [Security policy](../../../../SECURITY.md) |
| Screenshot evidence procedure | [Screenshot maintenance](../../../../docs/screenshots/README.md) |

Resolve the current Node and package-manager selection from repository manifests,
dependency state from the lockfile, script composition from `package.json`, and
hosted behavior from workflows. Do not freeze those values in this skill.

The contributor command index owns local command sequences. Its complete
repository gate is the gate run by hosted CI, but hosted CI may add platform
controls such as dependency review and its exact execution environment. Report
local and hosted results separately.

## Repository-specific safeguards

The default branch is review-protected. Create or use an appropriate feature
branch before the task commit, preserve unrelated work, and compare both Git
topology and patch equivalence before deciding that a branch is ahead, behind,
or diverged.

Generated or retained evidence is governed by its canonical document and Git
tracking state. Do not force-add ignored output, regenerate evidence merely to
silence a mismatch, or use a release-bundle command as an ordinary contributor
gate.

Read only the canonical documents relevant to the changed paths, then follow the
generic commit-and-push safeguards for staging, commit verification, and the
single feature-branch push.
