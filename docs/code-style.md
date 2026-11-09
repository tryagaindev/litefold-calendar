# Coding conventions

Follow these conventions for TypeScript, JavaScript, HTML, CSS, tests, and runnable
examples. ESLint, Stylelint, TypeScript, and repository policy scripts enforce
mechanical rules. This guide explains the design and ownership choices behind
them. For documentation and interface explanations, follow the
[writing style](writing-style.md).

## Documentation version references

Follow the [version-reference rules](writing-style.md#version-references) for
supported release lines, exact versions, and authoritative version sources.

## Documentation scope and history

Follow the [scope and history rules](writing-style.md#scope-and-history). Keep
[one complete specification](writing-style.md#keep-one-complete-specification)
for each contract while reusing familiar terms and short explanations where needed.

## Documentation diagrams

Follow the [diagram and text-equivalent rules](writing-style.md#diagrams-and-text-equivalents)
for Mermaid, annotated SVGs, accessibility, and asset maintenance.

## Browser compatibility

Apply the [Baseline Widely available policy](browser-support.md) to the library,
examples, and published site. Resolve the shared `baseline-widely-available`
preset through Vite's public API. Its support window is fixed per Vite major;
it does not change daily.

Do not hand-copy resolved browser versions into source or prose. The marked
[minimum-browser table](browser-support.md#minimum-browser-versions) is generated
evidence, including its toolchain versions. Follow the
[browser documentation workflow](../CONTRIBUTOR_COMMANDS.md#refresh-browser-documentation)
after dependency changes. The documentation gate checks this table against the
installed resolver without rewriting it.

Review Vite updates, including majors, through CI. Check new platform features
against the installed preset's effective targets; a current Baseline badge alone
is not enough. Features outside those targets need capability detection and an
independently tested supported implementation. Keep compatibility work local to
the missing capability and release its listeners during teardown. Do not add
broad layout-observer systems or global polyfills. WebMCP remains an optional
progressive extension.

## TypeScript contracts

- Keep strict TypeScript and `exactOptionalPropertyTypes`; omit an optional property instead of assigning `undefined`.
- Prefer discriminated contexts and precise platform element types. Do not hide ambiguity with `any`, unchecked casts, non-null assertions, or parallel callback combinations with surprising behavior.
- Preserve type information at its source: prefer inference, checked type annotations, `satisfies`, and literal types over assertions. Use generics when they retain a real relationship between inputs, callbacks, and returned values.
- Narrow uncertain values with runtime checks and carry the validated type through helper signatures. Tests should assert required elements and values before using them rather than casting away missing or invalid cases.
- Keep useful `as const` and justified assertions at dynamic validation, opaque metadata, third-party, and type-erasure boundaries, including intentionally invalid test fixtures. Explain non-obvious boundary assumptions; do not relocate assertions into unchecked generic helpers or suppress lint to remove a cast.
- Validate configuration and application data at the boundary. Diagnostics identify the option or field and corrective action without echoing private event values.
- Treat browser-agent tool arguments as untrusted boundary input. Keep WebMCP schemas structural and JSON-safe, use the current `document.modelContext` API behind feature detection, and do not add ambient experimental browser globals to consumer-facing types.

## Module and package boundaries

- Follow the dependency direction in the [internal architecture guide](architecture.md). Runtime may depend on DOM and domain, DOM may depend on domain, and domain remains independent. `calendar.ts` is the intentional root composition edge. Do not add internal barrels.
- Package-user-facing documentation and copyable snippets import the core API from the package root, WebMCP from the documented `@tryagaindev/litefold-calendar/extensions/webmcp` subpath when needed, and CSS from the stylesheet export. Never direct package users to internal or `dist/` paths. Repository runnable examples intentionally use the [documented relative `dist/` wiring](../examples/README.md#run-locally) to exercise freshly built package output.
- Every new public extension subpath must provide an independently useful, tree-shakeable component and package-artifact verification.
- Keep extension entry modules pure and SSR-safe. Factories validate and snapshot options synchronously; module evaluation must not read browser globals, register tools, discover calendars, or mutate global state.
- Do not re-export extension factories from the root or import one optional
  extension from another. Follow the
  [official extension checklist](architecture.md#author-an-official-extension).

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

Use the [focused validation matrix](../CONTRIBUTOR_COMMANDS.md#choose-focused-validation)
for copyable commands. Changes to this guide or the conventions it describes
must exercise the affected lint, type, unit, documentation, design, example, or
package-policy checks. After committing the intended change and returning to a
clean tree, use the
[final repository gate](../CONTRIBUTOR_COMMANDS.md#run-the-final-gate).
