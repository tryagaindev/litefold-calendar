# Litefold Calendar contributor commands

This file is a runnable convenience index for repository contributors. Package consumers only need the installation and integration guidance in [README.md](README.md). Contribution policy, prerequisites, and pull-request requirements remain in [CONTRIBUTING.md](CONTRIBUTING.md).

Many Markdown-aware IDEs can run an individual shell fence. Each block therefore contains one cross-shell command and remains copyable everywhere else.

## Set up the repository

Verify the supported Node.js line and repository-selected npm client:

```shell
node --version
```

```shell
npm --version
```

Install the locked dependencies and browser:

```shell
npm ci --ignore-scripts
```

```shell
npx --no-install playwright install chromium
```

## Explore and build

Build the package and examples, then start the loopback demo server:

```shell
npm run demo
```

Build all publishable and example output without starting a server:

```shell
npm run build
```

## Run focused checks

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

Run the design check after changing `DESIGN.md`:

```shell
npm run check:design
```

Run real-browser behavior after changing DOM, CSS, accessibility, or interaction code:

```shell
npm run test:browser
```

## Update screenshots intentionally

This command writes the six tracked images and their manifest. Run it only when the visual change is intended, then review the result.

```shell
npm run screenshots:update
```

```shell
npm run check:screenshots
```

## Run the final gate

Both final gates include tarball verification and therefore require a clean worktree. Commit the intended source changes first. `check:fast` is useful only when Chromium is unavailable and is not a release substitute for the browser suite.

```shell
npm run check:fast
```

```shell
npm run check
```

Maintainer-only publication commands remain in the [release operations runbook](docs/release-operations.md).
