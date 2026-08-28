# Coding conventions

This document defines required repository conventions for TypeScript and JavaScript source, HTML, CSS, documentation, tests, and runnable examples.

## Documentation version references

Do not duplicate exact package or runtime patch versions in prose. Name the supported major or release line and point readers to the authoritative manifest, lockfile, generated metadata, or executable configuration. Supported ranges and major selectors belong in repository configuration; exact resolved versions belong in lockfiles, generated receipts, capture metadata, and commands where the value is a required input.

## TypeScript contracts

- Keep strict TypeScript and `exactOptionalPropertyTypes`; omit an optional property instead of assigning `undefined`.
- Prefer discriminated contexts and precise platform element types. Do not hide ambiguity with `any`, unchecked casts, non-null assertions, or parallel callback combinations with surprising behavior.
- Keep public contracts runtime-independent except for the intentional `calendar.ts` composition edge. Internal runtime code may depend on DOM and domain modules; DOM may depend on DOM and domain modules; domain remains independent. Do not add internal barrels. See the [internal architecture guide](architecture.md).
- Use a single root JavaScript/TypeScript import and the documented stylesheet export in consumer examples. Additional JavaScript API subpaths require evidence that they materially improve adoption.
- Validate configuration and application data at the boundary. Diagnostics identify the option or field and corrective action without echoing private event values.
- Treat browser-agent tool arguments as untrusted boundary input. Keep WebMCP schemas structural and JSON-safe, use the current `document.modelContext` API behind feature detection, and do not add ambient experimental browser globals to consumer-facing types.

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
- Author package CSS in the canonical `tokens`, `base`, `toolbar`, `pager`, `month-grid`, `agenda`, `responsive`, and `preferences` module order beneath `src/styles/`. Each module contains one newline-terminated `@layer lfc` block; `scripts/lib/styles.mjs` validates and composes them into the single public `dist/styles.css` file. Do not add another public stylesheet or bypass the composer.
- Follow [DESIGN.md](../DESIGN.md) for visual roles, values, state distinctions, and responsive composition. Expose reusable application-facing values through its documented `--lfc-*` map; reserve `--lfc-internal-*` for unsupported implementation details.
- Use logical properties, container queries, CSS Grid, Flexbox, intrinsic sizing, and normal DOM flow to implement that design. Do not add physical-direction overrides, device-category breakpoints, viewport listeners, `ResizeObserver`, layout measurement, breakpoint-driven DOM movement, CSS `order`, reversed flow, or dense placement for interactive content. Interaction code may observe geometry only when a public behavior such as native pager recentering requires it.
- Enforce the [design system's unit policy and documented pixel exceptions](../DESIGN.md#layout). Keep the Stylelint pixel-unit prohibition enabled and scope each allowed hairline or visually hidden literal to its canonical internal token declaration with an adjacent explanation.
- Do not add inline styles, remote assets, downloaded fonts, or consumer-specific selectors to core.

## Tests and fixtures

- Test observable behavior and artifact contracts, not verbatim implementation source, exact library/code versions, helper placement, or incidental runtime state.
- Use relative URLs, loopback, or names beneath the reserved `.test`, `.invalid`, and `.example` top-level domains. Tests must not depend on a routable public host.
- Keep tests deterministic, isolated, abort-safe, and responsible for restoring any global or DOM state they change.
- Treat documentation, examples, declarations, browser behavior, screenshots, hashes, and package receipts as one contract-bearing change when public behavior moves.
