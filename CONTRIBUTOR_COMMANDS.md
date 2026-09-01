# Litefold Calendar contributor commands

This is the copyable command reference for repository contributors. Contribution policy and change obligations live in [CONTRIBUTING.md](CONTRIBUTING.md); package users should start with [README.md](README.md).

Each generic shell fence contains one cross-shell command so it can be copied directly or run by a compatible Markdown-aware IDE. Shell-specific workflows are labeled and may span multiple lines.

## Set up the repository

Use a current Node.js 24 release and the exact npm version selected by `package.json#packageManager`. The broader `devEngines.packageManager` range is only a bootstrap compatibility warning; it does not replace the exact npm version required by the final gate.

```shell
node --version
```

```shell
npm --version
```

Install the locked development dependencies and repository-pinned Playwright browsers:

```shell
npm ci --ignore-scripts
```

```shell
npm run test:browser:install
```

That helper installs the pinned browser binaries without changing package dependencies. On a fresh Linux host that lacks browser system dependencies, use `npx --no-install playwright install --with-deps chromium firefox webkit` instead.

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

Run one engine while investigating a browser-specific failure:

```shell
npm run test:browser:chromium
```

```shell
npm run test:browser:firefox
```

```shell
npm run test:browser:webkit
```

### Run browser checks concurrently

One Playwright invocation starts one repository server on port `4173` by default and shares that origin across every configured browser project and worker. Keep that shared origin for the normal browser matrix so Chromium, Firefox, and WebKit exercise the same server contract.

When separate Playwright CLI processes must run concurrently in the same checkout, build once, then give each process both a distinct `LFC_PLAYWRIGHT_PORT` value from IANA's [Dynamic/Private range](https://www.rfc-editor.org/rfc/rfc6335.html#section-6) (`49152` through `65535`) and a distinct `--output` directory. There is no dedicated standardized Playwright test port; the examples use the first three ports in that general-purpose range. Launch these commands in separate PowerShell sessions after `npm run build` completes:

```powershell
$env:LFC_PLAYWRIGHT_PORT = "49152"
npm run test:browser:built -- --project=chromium --output=test-results/playwright-chromium
```

```powershell
$env:LFC_PLAYWRIGHT_PORT = "49153"
npm run test:browser:built -- --project=firefox --output=test-results/playwright-firefox
```

```powershell
$env:LFC_PLAYWRIGHT_PORT = "49154"
npm run test:browser:built -- --project=webkit --output=test-results/playwright-webkit
```

Ports `49152` through `49154` are unassigned Dynamic/Private ports rather than registered service ports, but they are not reserved for this project or for testing. Confirm that the block is available locally before starting the processes; each process fails explicitly if another listener owns its port. Do not assign separate ports to projects or workers inside one Playwright invocation. Do not scan through arbitrary ports without browser validation; browsers reject some otherwise valid TCP ports.

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

Both commands include tarball verification and therefore require the intended changes to be committed and the worktree to be clean. `npm run check` is the complete repository gate invoked by CI; it does not reproduce hosted controls such as dependency review or the workflow's exact environment. `check:fast` omits real-browser scenarios and is only a local fallback when the required Playwright browser binaries are unavailable.

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
