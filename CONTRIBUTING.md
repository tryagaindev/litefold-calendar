# Contributing to litefold-calendar

Thanks for helping improve litefold-calendar. The project is maintained by TryAgainDev and released under the MIT License.

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

On a fresh Linux machine, use `npx --no-install playwright install --with-deps chromium` when the operating-system browser dependencies are also absent. CI, package verification, Playwright, and screenshot tooling compare the runtime by major version 24 rather than one exact patch. Generated receipts and screenshot metadata record the exact patch that actually ran for auditability, while npm, Playwright, and Chromium remain exact-pinned. Exact-pinned development dependencies may declare their own minimum compatible patch within Node 24, so keep the local 24.x runtime current.

Keep text files UTF-8 with LF line endings. The repository's Git attributes and EditorConfig settings enforce this consistently across operating systems and editors.

Run every repository check exposed by `npm run` before submitting. At minimum, changes must pass documentation validation, linting, type checking, unit tests, package and example builds, built-output smoke tests, pinned-Chromium behavior, automated accessibility, screenshot validation, package-policy verification, and any affected manual accessibility checks.

Do not add `dependencies`, `peerDependencies`, `optionalDependencies`, bundled dependencies, install hooks, remote assets, CDNs, fonts, or icons. Development dependencies and browser tooling must be exact-pinned and justified in the pull request; Node follows the supported 24.x release line.

## Documentation

Follow the required [coding conventions](docs/code-style.md), including the single authoritative rule for documentation version references.

Keep each contract in one canonical document and link to it from shorter overviews or recipes:

| Document | Canonical responsibility |
|---|---|
| [README](README.md) | Product fit, installation, the smallest complete example, and task-oriented navigation |
| [Documentation hub](docs/README.md) | Goal-based routing across guides and examples |
| [Internal architecture](docs/architecture.md) | Source ownership, dependency direction, transaction boundaries, and refactoring guidance |
| [Coding conventions](docs/code-style.md) | TypeScript, structured data, civil dates, semantic HTML, accessibility, CSS, tests, and version references |
| [Example coverage guide](examples/README.md) | Task-to-example routing and the executable public-surface coverage contract |
| [Feature guide](docs/features.md) | Supported capabilities, terminology, and deliberate alpha scope boundaries |
| [API reference](docs/api.md) | Normative root exports, signatures, defaults, lifecycle, dates, actions, state, and extension contracts |
| [Integration guide](docs/integration-guide.md) | Application-owned adapters, caching, UI, error wiring, and production recipes |
| [FullCalendar migration](docs/fullcalendar-v6-migration.md) | Basic FullCalendar v6 `dayGridMonth` rewrite guidance without a compatibility claim |
| [SEO and progressive enhancement](docs/seo-and-progressive-enhancement.md) | Native semantics, event links, fallback lifecycle, and server responsibilities |
| [Screenshot contract](docs/screenshots/README.md) | Canonical scenes, deterministic capture, manifest, hashes, references, and review |
| [CSS token contract](docs/css-tokens.md) | Stable styling surface, tokens, theming, responsive styling, and CSP implications |
| [Error guide](docs/errors.md) | Error classification, presentation ownership, announcements, and recovery |
| [Accessibility guide](ACCESSIBILITY.md) | Interaction behavior, application obligations, test procedure, and assistive-technology evidence |
| [Browser support](docs/browser-support.md) | Rolling browser window, required platform features, and explicit exclusions |
| [Support policy](SUPPORT.md) | Help channels, report content, and supported integration boundary |
| [Release process](docs/releasing.md) | Public alpha preparation, immutable bundle handoff, trusted publishing, and registry verification |
| [Alpha release checklist](docs/alpha-release-checklist.md) | One-time setup and per-release operator checks |
| [Changelog](CHANGELOG.md) | User-visible additions, removals, and breaking alpha changes |

Avoid copying normative tables or detailed rules into multiple files. A short task-oriented summary is useful, but it should link to the canonical contract. Public API changes normally require the API reference, example coverage guide, relevant examples, and `CHANGELOG.md`; update the feature guide only when capability or scope changes.

Keep the advanced example's `CompleteCalendarOptions`, `CompleteCalendarExtension`, and `calendarMethods` maps exhaustive. A new public option, method, or extension hook must receive a successful scenario, a relevant smoke assertion, and a coverage-guide entry in the same change. Put deliberate source, validation, action, extension, and presentation failures in the async-errors example instead of obscuring the advanced success path.

Run `npm run check:docs` after changing Markdown headings, links, or root exports. The dependency-free check validates repository-local paths and anchors, rejects missing reference links and vague link labels, and requires every named root export to appear in `docs/api.md`. It does not validate external URLs or prove that prose and examples match runtime behavior, so review those manually and run `npm run typecheck:examples` and `npm run test:examples` when public behavior or example coverage changes. A visual change must also run `npm run screenshots:update` and `npm run check:screenshots`; the six PNGs, manifest, hashes, source fingerprint, references, and alt text change together.

## Implementation expectations

- Preserve the documented public TypeScript and CSS contracts or clearly identify a breaking alpha change. API names, defaults, module boundaries, and integration patterns may change before 1.0 when that materially reduces concepts, boilerplate, casts, or adoption friction; update types, tests, docs, migration guidance, examples, and screenshots together without weakening accessibility, security, or behavior.
- Keep TypeScript strict; do not hide unknown values with unsafe assertions or `any`.
- Reserve `.litefold-calendar` and `data-litefold-calendar` for the public rendered root. Prefix every internal package-owned class, custom data attribute, ID, layer, keyframe, container, and token with `lfc`; native, ARIA, and SVG attributes retain their platform-defined names.
- Render untrusted content as text. Do not use HTML-string APIs, dynamic code evaluation, or style sinks. The only core URL sink is the documented, length-bounded, relative/HTTP(S)-only `CalendarEventInput.url` path; do not add another.
- Keep package-owned work bounded, abortable, and fully disposable.
- Make loading, empty, degraded, and failed states visibly and programmatically distinguishable.
- Test keyboard, touch, pen, horizontal precision-scroll, narrow-width, zoom, RTL, reduced-motion, and forced-color behavior when affected. For native paging, assert public outcomes and fallbacks rather than exact user-agent physics.
- Update documentation and dependency-free examples for observable behavior or API changes.
- Keep the root facade small and follow the [internal architecture](docs/architecture.md): runtime may compose DOM/domain and public contracts, DOM may compose domain and public contracts, and domain remains independent. Do not create internal barrels or revive retired catch-all modules.

For frontend work, prefer semantic HTML and browser-native layout over custom JavaScript behavior. Make reusable components respond to their container and content rather than device categories. Responsive placement must remain CSS-only unless a public behavior—not layout—requires script; do not add viewport listeners, layout measurement, DOM movement, or visual reordering that conflicts with focus order. Prefer `rem`, `em`, and container-query units according to the [coding conventions](docs/code-style.md). Keep selectors low-specificity and package styles inside the `lfc` cascade layer so application overrides stay predictable. Choose the smallest rule set that communicates layout intent, and remove a declaration only after confirming that it is redundant across supported states and widths.

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
- Call out public API, CSS token, accessibility, security, mobile, packaging, or application-integration effects.
- Keep repository source, fixtures, screenshots, documentation, commit messages, and artifact metadata consumer-neutral. Application identities, branding, domains, paths, supplied screenshots, and implementation details must not enter this repository.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Contain no generated distribution files, local editor state, secrets, or unrelated formatting churn.

By contributing, you agree that your contribution is licensed under the repository's MIT License and that you have the right to submit it.

## Review and decisions

The current single maintainer makes final project and release decisions. Required automated checks apply to every pull request. Non-author approval becomes mandatory when a second maintainer is appointed; see [MAINTAINERS.md](MAINTAINERS.md).
