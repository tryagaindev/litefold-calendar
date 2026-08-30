# Coding conventions

This document defines required repository conventions for TypeScript and JavaScript source, HTML, CSS, documentation, tests, and runnable examples. ESLint, Stylelint, TypeScript, and repository policy scripts are the executable source for mechanical rules; this guide explains the design and ownership choices those tools cannot express on their own.

## Documentation version references

Do not duplicate exact package or runtime patch versions in prose. Name the supported major or release line and point readers to the authoritative manifest, lockfile, generated metadata, or executable configuration. Supported ranges and major selectors belong in repository configuration; exact resolved versions belong in lockfiles, generated receipts, capture metadata, and commands where the value is a required input.

## Documentation diagrams

Use diagrams when they make a relationship materially easier to understand, while keeping the surrounding prose or table as the complete text equivalent and canonical contract.

- Use fenced Mermaid flowcharts or sequence diagrams for dependency direction, event order, and lifecycle. Every Mermaid block requires a concise `accTitle` and `accDescr`.
- Use an annotated SVG under `docs/assets/` when spatial placement or component anatomy matters. Give it useful Markdown alternative text and describe every callout in nearby prose or a table. Its SVG source must include a maintenance comment naming the canonical code and documentation it illustrates and the changes that require reviewing or updating the asset.
- Let the renderer own Mermaid colors and styling. Communicate meaning with labels, arrows, shapes, and text rather than color alone, and verify that static assets remain legible with repository light and dark presentation.
- Do not use Mermaid frontmatter, embedded HTML, initialization/configuration directives, or `click` directives. Put navigation in ordinary Markdown links so repository checks can validate it.
- Diagram stable concepts, public vocabulary, and ownership boundaries. Do not duplicate exhaustive module inventories, private selectors, incidental DOM order, or other volatile implementation details that would create a second source of truth.

## TypeScript contracts

- Keep strict TypeScript and `exactOptionalPropertyTypes`; omit an optional property instead of assigning `undefined`.
- Prefer discriminated contexts and precise platform element types. Do not hide ambiguity with `any`, unchecked casts, non-null assertions, or parallel callback combinations with surprising behavior.
- Validate configuration and application data at the boundary. Diagnostics identify the option or field and corrective action without echoing private event values.
- Treat browser-agent tool arguments as untrusted boundary input. Keep WebMCP schemas structural and JSON-safe, use the current `document.modelContext` API behind feature detection, and do not add ambient experimental browser globals to consumer-facing types.

## Module and package boundaries

- Follow the dependency direction in the [internal architecture guide](architecture.md). Runtime may depend on DOM and domain, DOM may depend on domain, and domain remains independent. `calendar.ts` is the intentional root composition edge. Do not add internal barrels.
- Consumer-facing documentation and copyable snippets import the core API from the package root, selected first-party components from documented `/extensions/<id>` entries, and CSS from the stylesheet export. Never direct consumers to internal or `dist/` paths. Repository runnable examples intentionally use the [documented relative `dist/` wiring](../examples/README.md#run-locally) to exercise freshly built package output.
- Every new public extension subpath must provide an independently useful, tree-shakeable component and package-artifact verification.
- Keep extension entry modules pure and SSR-safe. Factories validate and snapshot options synchronously; module evaluation must not read browser globals, register tools, discover calendars, or mutate global state.
- Do not re-export extension factories from the root or import one optional extension from another. Follow the [first-party authoring checklist](first-party-extensions.md#first-party-authoring-checklist).

## JavaScript and repository scripts

- Use ECMAScript modules for repository scripts and browser examples. The classic-script example is the intentional exception.
- Do not use dynamic code evaluation (`eval`, implied eval, or `new Function`).
- Keep scripts deterministic, noninteractive unless their documented workflow requires input, and explicit about files or generated artifacts they change.
- Keep browser examples dependency-free at runtime and apply the same input validation and untrusted-content rules as the TypeScript source.

## Preserve structured values

Application-owned data must remain structured for as long as any consumer needs its components. Do not compose dates, times, identifiers, ranges, or state into a display string and later recover the parts with `split`, a regular expression, substring operations, or reparsing.

When code owns both producer and consumer, return a typed interface containing the source components and any serialized or localized representation. Parsing is appropriate at actual boundaries such as event-provider payloads, URLs, CSS values, ARIA token lists, native form values, and configuration. Parse and validate once, then carry the typed value internally.

## Dates and time

- Keep Gregorian civil dates distinct from JavaScript `Date` instants.
- Use strict `YYYY-MM-DD` or documented local date-time strings for event data; never infer a time zone from a civil value.
- Treat provider and event ends as exclusive, while `minDate` and `maxDate` are inclusive selection bounds.
- Name date-only, time-only, date-time, range, and instant values explicitly. Do not call a time-only value a date-time.
- Reuse the domain civil-date, range, grid, and normalization helpers rather than recreating parsing or arithmetic in runtime, DOM, examples, or consumers.

## HTML and accessibility

- Prefer native semantic elements: anchors for navigation, buttons for actions, ordered lists for ordered agendas, and `<time datetime>` for machine-readable dates/times.
- Never nest interactive controls. Each grid cell contains the day proxy and a sibling summaries container; event and overflow actions remain inside that container and outside the day proxy.
- Preserve the managed grid contract: one day proxy in the Tab sequence, F2 entry to actions, Up/Down movement without wrapping, Escape/F2 return, and predictable Tab/Shift+Tab exit.
- Use documented element references and surface discriminators. Do not query private package classes, data attributes, IDs, or DOM order.
- Preserve visible focus, target size, contrast, reflow, RTL, forced-color, increased-contrast, reduced-motion, and assistive-technology behavior when changing layout or themes.

## CSS

- Use kebab-case class names and the `lfc` namespace for package-owned selectors, containers, layers, keyframes, IDs, and custom data attributes.
- Keep package selectors low-specificity and inside the package cascade layer.
- Author readable package CSS in the canonical `tokens`, `base`, `toolbar`, `pager`, `month-grid`, `agenda`, `responsive`, and `preferences` module order beneath `src/styles/`. Each module contains one newline-terminated `@layer lfc` block; `scripts/lib/styles.mjs` validates and composes them, then minifies only the single public `dist/styles.css` file. Do not add another public stylesheet or bypass the composer.
- Follow [DESIGN.md](../DESIGN.md) for visual roles, values, state distinctions, and responsive composition. Expose reusable application-facing values through its documented `--lfc-*` map; reserve `--lfc-internal-*` for unsupported implementation details.
- Use logical properties, container queries, CSS Grid, Flexbox, intrinsic sizing, and normal DOM flow to implement that design. Do not add physical-direction overrides, device-category breakpoints, viewport listeners, `ResizeObserver`, layout measurement, breakpoint-driven DOM movement, CSS `order`, reversed flow, or dense placement for interactive content. Interaction code may observe geometry only when a public behavior such as native pager recentering requires it.
- Enforce the [design system's unit policy and documented pixel exceptions](../DESIGN.md#layout). Keep the Stylelint pixel-unit prohibition enabled and scope each allowed hairline or visually hidden literal to its canonical internal token declaration with an adjacent explanation.
- Do not add inline styles, remote assets, downloaded fonts, or consumer-specific selectors to core.

## Tests and fixtures

- Test observable behavior and artifact contracts, not verbatim implementation source, exact library/code versions, helper placement, or incidental runtime state.
- Use relative URLs, loopback, or names beneath the reserved `.test`, `.invalid`, and `.example` top-level domains. Tests must not depend on a routable public host.
- Keep tests deterministic, isolated, abort-safe, and responsible for restoring any global or DOM state they change.
- Treat documentation, examples, declarations, browser behavior, screenshots, hashes, and package receipts as one contract-bearing change when public behavior moves.

## Validate a change

Run the focused checks while iterating:

```shell
npm run lint
npm run typecheck
npm run test:unit
```

Add `npm run check:docs` for documentation or export changes and `npm run check:design` for `DESIGN.md`. After committing the intended changes and returning to a clean tree, run the complete `npm run check` gate described in [CONTRIBUTING.md](../CONTRIBUTING.md#development).
