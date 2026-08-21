# Documentation

Use this page to choose the shortest path to the information you need. The README remains the package overview and first-run guide; these documents cover the detailed public contracts.

## Start by goal

| Goal | Guide |
|---|---|
| Evaluate capabilities and deliberate omissions | [Features and alpha scope](features.md) |
| Install and render a first calendar | [README quick start](../README.md#quick-start) and [basic JavaScript example](../examples/basic/) |
| Look up public methods, inclusive bounds, month/year jumping, pull/snap paging, events, or date rules | [Public API reference](api.md) |
| Adapt application data, caching, filters, actions, extensions, and compact toolbar content | [Application integration guide](integration-guide.md) |
| Rewrite a basic FullCalendar v6 `dayGridMonth` integration | [FullCalendar migration](fullcalendar-v6-migration.md) |
| Add meaningful links and a no-JavaScript fallback | [SEO and progressive enhancement](seo-and-progressive-enhancement.md) |
| Find which example exercises a feature | [Example coverage guide](../examples/) |
| Customize colors, spacing, responsive behavior, or themes | [CSS token contract](css-tokens.md) |
| Handle loading, failure, Retry, and application-owned presentation | [Error handling](errors.md) and [async errors example](../examples/async-errors/) |
| Verify keyboard, touch, pen, precision scrolling, zoom, contrast, and assistive technology | [Accessibility guidance](../ACCESSIBILITY.md) |
| Check pager fallbacks, supported browsers, and excluded legacy environments | [Browser support](browser-support.md) |
| Verify a local package artifact before release | [Package verification](package-verification.md) |
| Prepare and publish a public alpha | [Release process](releasing.md) and [operator checklist](alpha-release-checklist.md) |
| Understand internal ownership, dependency direction, and refactoring boundaries | [Internal architecture](architecture.md) |
| Reproduce and validate the six canonical images | [Screenshot contract](screenshots/README.md) |
| Get help or report a problem | [Support policy](../SUPPORT.md) |
| Apply repository source and documentation conventions | [Coding conventions](code-style.md) |

## Examples

The [example coverage guide](../examples/) maps public features to runnable fixtures and explains the compile-time and smoke-test drift guards.

- [Basic JavaScript](../examples/basic/) — the smallest complete integration.
- [Advanced TypeScript](../examples/advanced/) — the complete successful-feature showcase, including inclusive bounds, native pull/snap paging and month/year jump, compact toolbar placement, typed metadata, caching, filters, extensions, and an application-owned dialog.
- [Async errors](../examples/async-errors/) — loading, retained-data warnings, Retry, and explicit error ownership.
- [Classic-script loader](../examples/classic-script/) — a classic page entry that loads the ESM package with `import()`.
- [FullCalendar v6 migration](../examples/fullcalendar-v6-migration/) — a dependency-free rewrite of basic `dayGridMonth` concepts.
- [Progressive enhancement](../examples/progressive-enhancement/) — native fallback HTML coordinated with a client calendar.

## Project contracts

- [Accessibility](../ACCESSIBILITY.md)
- [Browser support](browser-support.md)
- [Security model](security-model.md) and [private reporting](../SECURITY.md)
- [Support](../SUPPORT.md)
- [Release process](releasing.md) and [alpha checklist](alpha-release-checklist.md)
- [Release notes](../CHANGELOG.md)
- [Contributing](../CONTRIBUTING.md)
- [Internal architecture](architecture.md)
- [Coding conventions](code-style.md)

The package is a public alpha.  Public contracts are documented here and in the generated TypeScript declarations; private `lfc-*` DOM details are not integration APIs.  Before `1.0.0`, an API or default may change when that materially improves developer experience, but declarations, tests, documentation, migration guidance, examples, accessibility behavior, and security guarantees must stay synchronized.
