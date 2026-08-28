# Contributing to litefold-calendar

Thanks for helping improve litefold-calendar. The project is maintained by TryAgainDev and released under the MIT License. Participation is governed by the [Contributor Covenant 3.0 Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before proposing duplicate work.
- Use the appropriate issue form for bugs, accessibility barriers, and feature proposals.
- Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md); never include exploit details in a public issue.
- Keep proposals within the alpha constraints: responsive, framework-agnostic, strict TypeScript/CSS, accessible by default, progressive where useful, and zero runtime dependencies.

Small fixes may go directly to a pull request. Discuss large public-API, date-model, accessibility, extension, or release changes before implementation.

## Development

Use a current stable release on the supported Node.js 24 line. [`.nvmrc`](.nvmrc) selects that major line, `package.json#devEngines` declares the matching `24.x` development range, `package.json#packageManager` selects the exact npm client, and the lockfile owns development-tool versions. Repository-owned checks do not pin a Node patch. Activate Node 24.x and the repository-selected npm version before running any repository command; the npm bundled with a Node installation is not automatically the selected client. Verify the active versions, install the exact lockfile without lifecycle scripts, and install the locally pinned Chromium binary:

```shell
node --version
npm --version
npm ci --ignore-scripts
npx --no-install playwright install chromium
```

Codex Cloud and local environments may instead run the repository setup while network access is available:

```shell
npm run setup
```

The setup command does not require an existing `node_modules` directory. It prepares the manifest-selected npm client through Corepack, performs the locked install, downloads pinned Chromium (including operating-system packages when running as root), and copies Google Chrome's web-quality agent skills into `${CODEX_HOME:-~/.codex}/skills`. These artifacts remain available after network access is disabled. Set `LFC_SETUP_WITH_OS_DEPS=1` to request browser system packages as a non-root user, `LFC_SETUP_SKIP_BROWSER=1` when intentionally preparing only non-browser work, or `LFC_WEB_QUALITY_SKILLS_REF` to test a specific upstream skills ref.

Plain `npm install` and `npm ci` intentionally do not run environment setup as a lifecycle hook. Installation must remain noninteractive and limited to the dependency tree; setup can modify the selected npm shim, install operating-system browser packages, download a browser, and write Codex skills outside the repository. Run `npm run setup` explicitly during the network-enabled phase instead.

On a fresh Linux machine, use `npx --no-install playwright install --with-deps chromium` when the operating-system browser dependencies are also absent. CI, package verification, Playwright, and screenshot tooling compare the runtime by major version 24 rather than one exact patch. Generated receipts and screenshot metadata record the exact patch that actually ran for auditability, while npm, Playwright, and Chromium remain exact-pinned. Exact-pinned development dependencies may declare their own minimum compatible patch within Node 24, so keep the local 24.x runtime current.

Dependency setup requires outbound HTTPS access to these dependency-specific hosts:

- `registry.npmjs.org` for npm metadata, tarballs, audit data, and the pinned npm client.
- `cdn.playwright.dev` for the primary pinned Chromium download.
- `playwright.download.prss.microsoft.com` for Playwright's Chromium download fallback.
- `github.com` for Google Chrome's web-quality agent skills.

Cloning the repository and installing operating-system packages with Playwright's optional `--with-deps` flag additionally require the Git host and distribution mirrors selected by the local environment; those are not JavaScript dependency hosts owned by this repository.

Keep text files UTF-8 with LF line endings. The repository's Git attributes and EditorConfig settings enforce this consistently across operating systems and editors.

Run every repository check exposed by `npm run` before submitting. At minimum, changes must pass documentation validation, `DESIGN.md` linting, code linting, type checking, unit tests, package and example builds, built-output smoke tests, pinned-Chromium behavior, automated accessibility, screenshot validation, package-policy verification, and any affected manual accessibility checks. `npm run check:static` includes `npm run check:design`, and CI reaches that aggregate through the repository check. When Chromium is unavailable, use `npm run check:fast` to run the complete non-browser portion of the gate; it is a development shortcut, not a substitute for the browser scenarios required before merge.

Do not add `dependencies`, `peerDependencies`, `optionalDependencies`, bundled dependencies, install hooks, remote assets, CDNs, fonts, or icons. Development dependencies and browser tooling must be exact-pinned and justified in the pull request; Node follows the supported 24.x release line.

## Documentation

Follow the required [coding conventions](docs/code-style.md), including the single authoritative rule for documentation version references. The [documentation hub](docs/README.md) is the sole repo-wide index; do not reproduce its inventory in another guide.

Keep exact signatures, defaults, and lifecycle rules in the [API reference](docs/api.md). Keep application recipes in the [integration guide](docs/integration-guide.md), visual values in [DESIGN.md](DESIGN.md), WebMCP schemas and compatibility in the [site-tool guide](docs/webmcp.md), and normal publication steps in the [release process](docs/releasing.md). Short overviews should link to those owners instead of copying their tables.

Public API changes require synchronized types, API documentation, feature scope when affected, relevant examples and executable coverage, and `CHANGELOG.md`. A WebMCP change also requires schema and annotation tests, unsupported-browser behavior, collision and partial-registration cleanup, safe output review, and teardown coverage. A publication change requires synchronized release, administration, package-evidence, Pages, security-model, and workflow-contract documentation.

Keep the advanced example's `CompleteCalendarOptions`, `CompleteCalendarExtension`, and `calendarMethods` maps exhaustive. A new public option, method, extension hook, or optional WebMCP integration must receive a successful scenario, a relevant smoke/browser assertion, and a coverage-guide entry in the same change. Put deliberate source, validation, action, extension, and presentation failures in the async-errors example instead of obscuring the advanced success path.

Run `npm run check:docs` after changing Markdown headings, links, root exports, or WebMCP integration code. The dependency-free check validates local paths and anchors, rejects missing references and vague link labels, requires every repository document to be reachable from the canonical index, scans relevant repository text for the deprecated navigator-scoped WebMCP surface, and matches the exact root export table in `docs/api.md`. It does not validate external URLs or prove prose matches runtime behavior, so review those manually and run affected example tests. Run `npm run check:design` after changing `DESIGN.md`; a visual change must also regenerate and review the six canonical screenshots and their manifest.

## Implementation expectations

- Preserve the documented public TypeScript and CSS contracts or clearly identify a breaking alpha change. API names, defaults, module boundaries, and integration patterns may change before 1.0 when that materially reduces concepts, boilerplate, casts, or adoption friction; update types, tests, docs, migration guidance, examples, and screenshots together without weakening accessibility, security, or behavior.
- Keep TypeScript strict; do not hide unknown values with unsafe assertions or `any`.
- Reserve `.litefold-calendar` and `data-litefold-calendar` for the public rendered root. Prefix every internal package-owned class, custom data attribute, ID, layer, keyframe, container, and token with `lfc`; native, ARIA, and SVG attributes retain their platform-defined names.
- Render untrusted content as text. Do not use HTML-string APIs, dynamic code evaluation, or style sinks. The only core URL sink is the documented, length-bounded, relative/HTTP(S)-only `CalendarEventInput.url` path; do not add another.
- Keep WebMCP explicit and default-off. Revalidate model arguments, bound every result, annotate untrusted event content, exclude identifiers/URLs/metadata/diagnostics, share one abort signal across the sequential registrations, and unregister on every teardown path. Never use the deprecated navigator-scoped surface.
- Keep package-owned work bounded, abortable, and fully disposable.
- Make loading, empty, degraded, and failed states visibly and programmatically distinguishable.
- Test keyboard, touch, pen, horizontal precision-scroll, narrow-width, zoom, RTL, reduced-motion, and forced-color behavior when affected. For native paging, assert public outcomes and fallbacks rather than exact user-agent physics.
- Update documentation and dependency-free examples for observable behavior or API changes.
- Keep the root facade small and follow the [internal architecture](docs/architecture.md): runtime may compose DOM/domain and public contracts, DOM may compose domain and public contracts, and domain remains independent. Do not create internal barrels or revive retired catch-all modules.

For frontend work, follow the [design system](DESIGN.md) for visual decisions and the [coding conventions](docs/code-style.md) for implementation mechanics. Prefer semantic HTML and browser-native layout over custom JavaScript behavior. Make reusable components respond to their container and content rather than device categories. Responsive placement must remain CSS-only unless a public behavior—not layout—requires script; do not add viewport listeners, layout measurement, DOM movement, or visual reordering that conflicts with focus order. Keep selectors low-specificity and package styles inside the `lfc` cascade layer so application overrides stay predictable. Choose the smallest rule set that communicates layout intent, and remove a declaration only after confirming that it is redundant across supported states and widths.

## Tests

Add focused regression tests for bugs and public contracts. Include failure paths, stale asynchronous results, teardown, hostile input, and relevant accessibility semantics. Automated accessibility checks supplement rather than replace keyboard and assistive-technology review.

Assert observable behavior or a documented artifact contract. Do not make tests depend on verbatim source text, formatting, helper placement, or a particular dependency or tool version; those choices belong in implementation and repository configuration.

Tests must be deterministic, must not require external services, and must not write tracked artifacts.

## Commits and pull requests

Use concise Conventional Commit-style subjects such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`. Keep unrelated changes separate.

A pull request should:

- Explain the user-visible outcome and motivation.
- Link related issues or design discussion.
- Describe tests performed and remaining risks.
- Call out design-system, public API, CSS token, accessibility, security, mobile, packaging, or application-integration effects.
- Keep repository source, fixtures, screenshots, documentation, commit messages, and artifact metadata consumer-neutral. Application identities, branding, domains, paths, supplied screenshots, and implementation details must not enter this repository.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Contain no generated distribution files, local editor state, secrets, or unrelated formatting churn.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you have the right to submit it.

## Review and decisions

The current single maintainer makes final project and release decisions. Required automated checks apply to every pull request. Non-author approval becomes mandatory when a second maintainer is appointed; see [MAINTAINERS.md](MAINTAINERS.md).
