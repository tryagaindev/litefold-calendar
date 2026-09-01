# Contributing to Litefold Calendar

Thanks for helping improve Litefold Calendar. The project is maintained by TryAgainDev and released under the MIT License. Participation is governed by the [Contributor Covenant 3.0 Code of Conduct](CODE_OF_CONDUCT.md).

This guide owns contribution policy and the obligations that accompany each kind of change. Use the [contributor command reference](CONTRIBUTOR_COMMANDS.md) for repository setup, focused checks, the final gate, and change delivery.

## Before you start

- Search existing issues and pull requests before proposing duplicate work.
- Use the appropriate issue form for bugs, accessibility barriers, and feature proposals.
- Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md); never include exploit details in a public issue.
- Keep proposals within the alpha constraints: responsive, framework-agnostic, strict TypeScript/CSS, accessible by default, progressive where useful, and zero runtime dependencies.

Small fixes may go directly to a pull request. Discuss large public-API, date-model, accessibility, extension, packaging, or release-workflow changes before implementation.

## Repository requirements

- Use a current Node.js 24 release. [`.nvmrc`](.nvmrc) and `package.json#devEngines` define the supported runtime line.
- Use the exact npm release selected by `package.json#packageManager` for the final repository gate. The broader `devEngines.packageManager` range is a bootstrap compatibility warning, not the version used to validate a contribution.
- Install the exact development dependencies from `package-lock.json` and use the repository-pinned Chromium, Firefox, and WebKit binaries. The [contributor command reference](CONTRIBUTOR_COMMANDS.md#set-up-the-repository) owns the copyable setup commands.
- Keep text files UTF-8 with LF line endings. Git attributes and EditorConfig enforce this across supported editors and operating systems.
- Do not add runtime, peer, optional, or bundled dependencies; install hooks; remote assets; CDNs; fonts; or icons. Exact-pin and justify any new development dependency or browser tooling in the pull request.

Use focused checks while developing, then run the [complete repository gate](CONTRIBUTOR_COMMANDS.md#run-the-final-gate) before submission. Automated checks do not replace affected manual accessibility or compatibility review.

## Change obligations

Put each contract in its canonical document and link to it from shorter guides. Do not create a second inventory or restate implementation details in contributor-facing policy.

| Change area | Canonical contract | Required companion work |
|---|---|---|
| Public TypeScript API, defaults, lifecycle, or event data | [API reference](docs/api.md) and [integration guide](docs/integration-guide.md) | Update declarations, focused tests, affected examples, migration guidance when needed, and `CHANGELOG.md`. |
| Internal module or data-flow boundary | [Architecture guide](docs/architecture.md) | Preserve dependency direction, add focused failure and teardown coverage, and update a diagram only when its stable relationship changes. |
| HTML semantics, keyboard/pointer interaction, focus, announcements, or error presentation | [Accessibility contract](ACCESSIBILITY.md) and [error handling](docs/errors.md) | Add observable regression coverage and repeat the affected manual accessibility scenarios. |
| CSS tokens, responsive composition, motion, or visual state | [Design system](DESIGN.md) | Run design and browser checks; update and review the [canonical screenshots](docs/screenshots/README.md) only when a captured visual state intentionally changes. |
| First-party extension composition or WebMCP | [First-party extension guide](docs/first-party-extensions.md) and [WebMCP guide](docs/webmcp.md) | Preserve the documented opt-in package boundary, update schemas and lifecycle coverage, and exercise supported and unavailable-host behavior. |
| Package exports, build output, dependency policy, or tarball contents | [Package verification](docs/package-verification.md) | Update package-policy tests, installed-consumer verification, and release evidence contracts as applicable. |
| Documentation or examples | [Documentation hub](docs/README.md), [example guide](examples/README.md), and [coding conventions](docs/code-style.md) | Keep audience routing and canonical ownership intact, validate links and exports, and update executable examples when observable behavior changes. |
| Publication or hosted release workflow | [Release policy](docs/releasing.md), [release administration](docs/release-administration.md), and [release operations](docs/release-operations.md) | Obtain maintainer review, identify any required GitHub `Admin` or npm permission changes, and update workflow-contract tests and private evidence requirements together. Ordinary publication is outside the contributor workflow. |

## Documentation audiences

Before changing prose or an example, identify its primary audience in the
[documentation hub](docs/README.md) and write for that reader's immediate
decision:

| Audience | Reader mindset | What the document should optimize for |
| --- | --- | --- |
| Package user — getting started | “Can I use this, and can I get a correct first result quickly?” | State assumptions, show the shortest safe path, and route optional complexity elsewhere. |
| Package user — integration and API | “What is the exact contract, tradeoff, and failure behavior in my application?” | Define supported composition, ownership, edge cases, and stable public boundaries without exposing repository mechanics. |
| Contributor | “Where does this fact belong, what else must change, and how do I prove it?” | Name the canonical owner, companion work, observable checks, and review evidence. |
| Maintainer | “Who has authority, what changes public state, and how is it verified or recovered?” | Make project roles, platform permissions, approval boundaries, exact identities, irreversible effects, stop conditions, and private evidence explicit. |

Give each document one primary job. If a paragraph does not help that audience
make its decision, move it to the canonical owner or replace it with a link.
Avoid parallel setup sequences, command inventories, API lists, responsive
geometry, recovery matrices, and compatibility claims.

## Tests

Add focused regression tests for changed behavior and public contracts. Include relevant failure paths, stale asynchronous results, teardown, hostile input, and accessibility semantics. If a behavior or public contract does not need a regression test, explain why in the pull request.

Browser-neutral end-to-end scenarios must run in the Chromium, Firefox, and WebKit projects. Scope a scenario to one engine only when the required Playwright capability is engine-specific, state that reason in the skip annotation, and keep the portable public-behavior path covered across all three engines.

Automated accessibility coverage includes Playwright-computed ARIA snapshots and live-region/focus contracts in each browser engine. It supplements rather than replaces keyboard review and testing with actual assistive technologies.

Assert observable behavior or a documented artifact contract. Do not make tests depend on verbatim source text, formatting, helper placement, or incidental runtime state. Tests must be deterministic, require no external service, and leave no tracked artifacts behind.

## Commits and pull requests

Use concise Conventional Commit-style subjects such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`. Keep unrelated changes separate.

A pull request should:

- Explain the user-visible outcome and motivation.
- Link related issues or design discussion.
- Describe verification performed and remaining risks.
- Call out public API, design, accessibility, security, packaging, release-workflow, or host-integration effects when relevant.
- Keep repository source, fixtures, screenshots, documentation, commit messages, and artifact metadata application-neutral. Do not include application identities, branding, private paths, secrets, or event data.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Exclude generated distributions, local editor state, and unrelated formatting churn.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you have the right to submit it. Review and decision authority is defined in [MAINTAINERS.md](MAINTAINERS.md).
