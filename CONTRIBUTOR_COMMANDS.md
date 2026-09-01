# Litefold Calendar contributor commands

This is the copyable command reference for repository contributors. Contribution policy and change obligations live in [CONTRIBUTING.md](CONTRIBUTING.md); package users should start with [README.md](README.md).

Each shell fence contains one cross-shell command so it can be copied directly or run by a compatible Markdown-aware IDE.

## Set up the repository

Use a current Node.js 24 release and the exact npm version selected by `package.json#packageManager`. The broader `devEngines.packageManager` range is only a bootstrap compatibility warning; it does not replace the exact npm version required by the final gate.

```shell
node --version
```

```shell
npm --version
```

Install the locked development dependencies and repository-pinned browser:

```shell
npm ci --ignore-scripts
```

```shell
npx --no-install playwright install chromium
```

On a fresh Linux host that lacks browser system dependencies, use `npx --no-install playwright install --with-deps chromium` instead.

## Explore and build

Build the package and examples, then start the loopback demo server:

```shell
npm run demo
```

Build all publishable and example output without starting a server:

```shell
npm run build
```

## Choose focused validation

Run the smallest relevant checks while iterating, then always run the final gate. The canonical contracts and companion-work obligations are in [CONTRIBUTING.md](CONTRIBUTING.md#change-obligations).

| Change area | Start with |
|---|---|
| TypeScript or JavaScript behavior | `npm run lint`, `npm run typecheck`, `npm run test:unit` |
| Repository scripts, package policy, or workflow contracts | `npm run test:tooling`, `npm run check:policy` |
| Markdown, headings, links, root exports, or WebMCP integration | `npm run check:docs` |
| Examples | `npm run typecheck:examples`, `npm run test:examples` |
| DOM, interaction, accessibility, or browser behavior | `npm run test:unit`, `npm run test:browser`, plus affected manual scenarios in [ACCESSIBILITY.md](ACCESSIBILITY.md) |
| CSS or visual behavior | `npm run lint:styles`, `npm run test:browser`; add `npm run check:design` when `DESIGN.md` changes |
| Package exports or installed-consumer behavior | `npm run build`, then `npm run typecheck:examples:built`; after committing, use the clean-tree `npm run check:distribution` gate |

Common focused commands:

```shell
npm run lint
```

```shell
npm run typecheck
```

```shell
npm run test:unit
```

```shell
npm run test:tooling
```

```shell
npm run check:docs
```

```shell
npm run test:browser
```

## Update screenshots intentionally

When an intentional visual change affects a canonical scene, regenerate the
tracked screenshot set and manifest, review every diff, and follow the
[screenshot contract](docs/screenshots/README.md).

```shell
npm run screenshots:update
```

```shell
npm run check:screenshots
```

## Run the final gate

Both commands include tarball verification and therefore require the intended changes to be committed and the worktree to be clean. `npm run check` is the complete repository gate invoked by CI; it does not reproduce hosted controls such as dependency review or the workflow's exact environment. `check:fast` omits real-browser scenarios and is only a local fallback when Chromium is unavailable.

```shell
npm run check:fast
```

Before submission, run the complete gate:

```shell
npm run check
```

## Deliver a contributor change

Automation that supports repository skills can invoke [`$commit-and-push`](.agents/skills/commit-and-push/SKILL.md) to audit Git state, validate and commit only the intended files, and push an ordinary feature branch. The skill is operational guidance, not a shell command or additional repository authority.

Package publication and release administration are separate from contributing.
Stop after the ordinary change workflow unless you are explicitly authorized as
a release operator; authorized operators use the
[release operations runbook](docs/release-operations.md).
