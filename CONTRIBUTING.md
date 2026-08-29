# Contributing to litefold-calendar

Thanks for helping improve litefold-calendar. The project is maintained by TryAgainDev and released under the MIT License. Participation is governed by the [Contributor Covenant 3.0 Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before proposing duplicate work.
- Use the appropriate issue form for bugs, accessibility barriers, and feature proposals.
- Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md); never include exploit details in a public issue.
- Keep proposals within the alpha constraints: responsive, framework-agnostic, strict TypeScript/CSS, accessible by default, progressive where useful, and zero runtime dependencies.

Small fixes may go directly to a pull request. Discuss large public-API, date-model, accessibility, extension, or release changes before implementation.

## Development

Use the repository-owned toolchain:

- A current stable release on the Node.js 24 line. [`.nvmrc`](.nvmrc) and `package.json#devEngines` define the supported major line.
- The exact npm release in `package.json#packageManager`.
- The exact development dependencies in `package-lock.json` and the locally pinned Chromium binary.

The npm bundled with a Node installation is not automatically the repository-selected client. Activate the required Node and npm versions, verify them, then install the locked dependencies and browser:

```shell
node --version
npm --version
npm ci --ignore-scripts
npx --no-install playwright install chromium
```

On a fresh Linux machine, use `npx --no-install playwright install --with-deps chromium` when operating-system browser dependencies are also absent. Repository checks enforce the Node 24 major line rather than one patch. Generated receipts and screenshot metadata record the patch that actually ran, while npm, Playwright, and Chromium remain exact-pinned. Keep the local Node 24 release current because development tools may raise their minimum compatible patch.

Keep text files UTF-8 with LF line endings. The repository's Git attributes and EditorConfig settings enforce this consistently across operating systems and editors.

Use focused checks while developing. After committing the intended changes and returning to a clean tree, run the complete gate before submitting:

```shell
npm run check
```

This aggregate covers documentation and design validation, linting, type checking, unit and tooling tests, package and example builds, built-output smoke tests, pinned-Chromium behavior, automated accessibility, screenshots, and package policy. Its tarball verification intentionally rejects a dirty worktree. Run any affected manual accessibility checks as well. When Chromium is unavailable, `npm run check:fast` runs the complete non-browser portion; it is a development shortcut, not a substitute for the browser scenarios required before merge.

Do not add `dependencies`, `peerDependencies`, `optionalDependencies`, bundled dependencies, install hooks, remote assets, CDNs, fonts, or icons. Development dependencies and browser tooling must be exact-pinned and justified in the pull request; Node follows the supported 24.x release line.

## Documentation

Follow the required [coding conventions](docs/code-style.md), including the single authoritative rule for documentation version references. The [documentation hub](docs/README.md) is the sole repo-wide index; do not reproduce its inventory in another guide.

Put information in its authoritative document and link to it from shorter overviews:

| Information | Authoritative document |
|---|---|
| Exact signatures, defaults, and lifecycle rules | [API reference](docs/api.md) |
| Application recipes | [Integration guide](docs/integration-guide.md) |
| Extension composition and first-party extension conventions | [First-party extension guide](docs/first-party-extensions.md) |
| Visual roles and values | [Design system](DESIGN.md) |
| WebMCP schemas and compatibility | [Site-tool guide](docs/webmcp.md) |
| Normal publication steps | [Release process](docs/releasing.md) |

Keep contract-bearing artifacts synchronized:

- A public API change updates types, API documentation, affected feature scope, relevant examples and executable coverage, and `CHANGELOG.md`.
- A WebMCP change also covers the optional-subpath boundary, `webMcp(options?)` factory, schemas and annotations, unsupported-browser behavior, collision and partial-registration cleanup, safe output, and teardown.
- A publication change updates release, administration, package-evidence, Pages, security-model, and workflow-contract documentation together.

Keep the advanced example's `CompleteCalendarOptions`, `CompleteCalendarRenderHooks`, and `calendarMethods` maps exhaustive. A new public option, method, render hook, or first-party extension must receive a successful scenario, a relevant smoke/browser assertion, and a coverage-guide entry in the same change. Put deliberate source, validation, action, render-hook, extension, and presentation failures in the async-errors example instead of obscuring the advanced success path.

Run `npm run check:docs` after changing Markdown headings, links, root exports, or WebMCP integration code. It validates local paths and anchors, link quality, index reachability, the deprecated navigator-scoped WebMCP surface, and the root export table in `docs/api.md`. It cannot validate external URLs or prove that prose matches runtime behavior, so review those manually and run affected example tests. Run `npm run check:design` after changing `DESIGN.md`; a visual change must also regenerate and review the six canonical screenshots and their manifest.

## Implementation expectations

- Preserve the documented public TypeScript and CSS contracts or clearly identify a breaking alpha change. API names, defaults, module boundaries, and integration patterns may change before 1.0 when that materially reduces concepts, boilerplate, casts, or adoption friction; update types, tests, docs, migration guidance, examples, and screenshots together without weakening accessibility, security, or behavior.
- Keep TypeScript strict; do not hide unknown values with unsafe assertions or `any`.
- Keep consumer-owned visual customization on the stable `CalendarRenderHooks`/`renderHooks` surface. Complete first-party components use opaque `CalendarExtension` values from documented extension factories and are composed through `extensions`; do not make the two contracts interchangeable or expose an unsupported third-party authoring surface.
- Reserve `.litefold-calendar` and `data-litefold-calendar` for the public rendered root. Prefix every internal package-owned class, custom data attribute, ID, layer, keyframe, container, and token with `lfc`; native, ARIA, and SVG attributes retain their platform-defined names.
- Render untrusted content as text. Do not use HTML-string APIs, dynamic code evaluation, or style sinks. The only core URL sink is the documented, length-bounded, relative/HTTP(S)-only `CalendarEventInput.url` path; do not add another.
- Keep WebMCP out of the root import graph and available only through `webMcp(options?)` from `@tryagaindev/litefold-calendar/extensions/webmcp`, followed by explicit inclusion in `extensions`. The factory's default `toolNamePrefix` is `"litefold-calendar"`; examples with multiple calendars in one document must set distinct prefixes. Revalidate model arguments, bound every result, annotate untrusted event content, exclude identifiers/URLs/metadata/diagnostics, share one abort signal across the sequential registrations, and unregister on every teardown path. Never use the deprecated navigator-scoped surface.
- Keep failure attribution unambiguous: registered extension failures report `extension-failed` with `extensionId`, while consumer render-hook failures report `render-hook-failed` with `renderHookId`. Both paths must remain isolated and disposable.
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
