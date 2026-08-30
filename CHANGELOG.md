# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  Before `1.0.0`, documented breaking changes may occur between prereleases.

## [Unreleased]

### Added

- Added `npm run measure:workflows` for reproducible root-import, render, source-update, DOM-operation, and emitted-size diagnostics. Optional extensions remain excluded from root-load accounting, and timing results remain measurements rather than CI thresholds.
- Added Mermaid event-order and architecture diagrams, an annotated calendar anatomy guide, and an IDE-runnable contributor command launcher.

### Changed

- Reworked visible-range event indexing to sort normalized events once and distribute them across the 42-day grid, avoiding a day-by-event scan while preserving exclusive ends, ordering, and arbitrary date-list behavior. Hook-free calendars now skip render-hook integrity snapshots and unused mount-context construction; event actions share listener types; optional formatters initialize on first use; and `swipe: false` installs no pager listeners or resize observer.
- Minified only the composed public `dist/styles.css` while keeping source modules readable.
- Direct event arrays, including arrays returned by providers, now validate, publish terminal state, render, coordinate fallback, and restore focus before the initiating `void` method returns. They use one full render and never publish `loading` or `aria-busy`. PromiseLike results, including fulfilled promises, async functions, and custom thenables, retain the loading-then-terminal lifecycle. **Migration:** return `Promise.resolve(events)` only when loading callbacks are intentionally required for otherwise immediate data.
- Renamed application-owned hooks throughout runnable examples, copyable documentation, and the Pages site to the `my-*`, `data-my-*`, `--my-*`, and `@layer my` namespaces; repository-only probes now use `data-test-*`. Package-owned `litefold-calendar` and `lfc-*` hooks are unchanged, and `check:ownership` now enforces the boundary.
- Replaced the compact three-slip multiple-event fan with a locale-aware social-style number (`+N` for additional events, or the total when no marker is visible), with the same customizable presentation available in wide cells. When a primary marker/action and passive count coexist, the package places them at the cell's block end in two equal, gap-free auto-fitting grid blocks. Their centers evenly divide the full area beneath the date when both compact-control-size tracks, 44 CSS pixels by default, fit; the blocks stack as centered, equal-width rows otherwise. This keeps them stacked through supported phone widths and moves them onto one row only near the compact ceiling. Markerless totals and `maxGridEventsPerDay: 0` action-backed fallbacks remain single blocks. Consumer compact output must remain concise enough for its assigned block because the auto-fit threshold does not measure arbitrary intrinsic hook-content width.
- **0.4 migration:** Unified `renderMultipleEventIndicator` and `renderGridOverflowContent` as the discriminated `renderEventOverflow` hook. Replace `CalendarMultipleEventIndicatorContext` and `CalendarGridOverflowContentContext` with `CalendarCompactEventOverflowContext`, `CalendarWideEventOverflowContext`, or their `CalendarEventOverflowContext` union; branch on `context.variant`; rename `hiddenEventCount` to `overflowCount`; and use `visibleEventCount`, `text`, and `elements` for package-owned presentation state.

## [0.3.0-alpha.0] - 2026-08-29

### Added

- Added a specification-compliant `DESIGN.md` as the canonical source for the package visual identity, exact light/dark defaults, responsive composition, component states, and public CSS token mapping.
- Added a decorative compact three-layer event-slip fan for days with multiple events, plus `renderMultipleEventIndicator` and `renderGridOverflowContent` render hooks for customizing compact plurality and wide overflow presentation without replacing native actions.
- Added the opaque `CalendarExtension`/`extensions` composition surface for complete, cohesive first-party components, distinct from consumer-owned visual render hooks.
- Added tree-shakeable WebMCP site tools through the explicit `webMcp(options?)` factory at `@tryagaindev/litefold-calendar/extensions/webmcp`. The extension pages through presentation-safe events in the currently loaded visible range, navigates a rendered calendar, cleans up its lifecycle, progressively falls back when the experimental browser API is unavailable, and defaults `toolNamePrefix` to `"litefold-calendar"`.

### Changed

- Defined a 320 CSS-pixel calendar host border box as the minimum supported design width, with narrower hosts treated as best-effort robustness targets.
- Renamed the stable consumer visual API from `CalendarExtension`/`extensions` to `CalendarRenderHooks`/`renderHooks`, including the related render context/cleanup types, `renderHookErrorMessage` / `renderHookErrorTitle`, and `render-hook-failed` diagnostics attributed by `renderHookId`; complete extension failures remain `extension-failed` diagnostics attributed by `extensionId`. `CalendarErrorPhase` no longer includes `extension`: migrate former visual-extension branches to `render`, while complete extension failures use `integration`.
- Removed WebMCP from the root module graph so consumers that omit its explicit extension-subpath import can exclude the feature from application bundles.
- Tightened the alpha TypeScript contract: synchronous observers and render cleanups now reject async returns, `Calendar<TMetadata>` is invariant, and unbound receiver-dependent calendar methods fail type checking.
- Static event inputs now snapshot supported event fields as well as array membership while preserving opaque metadata by reference.
- Simplified successful WebMCP `get-events` results by removing the redundant always-true `dataAvailable` field; `ok` remains the success discriminant.
- Reconciled package CSS with the design system by making base typography explicit, applying the shared component radius to event rows and navigation controls, and centralizing private visual primitives and the documented pixel exceptions.
- Simplified alpha publication around the exact eligible `main` push, a source-free protected npm publisher, and a native same-repository handoff to the separately authorized Pages workflow, and added a step-by-step operations runbook.

### Fixed

- Replaced XHTML namespace duck-typing with a standards-defined cross-realm `HTMLElement` brand check and removed the synthetic URL-normalization base while retaining the required SVG namespace identifier.
- Kept release-only Pages navigation and provenance usable without JavaScript or a manifest refresh, requested mutable example metadata without browser caching, and allowed full source commits to wrap on 320-pixel screens.
- Prevented same-month `gotoDate()` and Today navigation from refetching an unchanged visible range, and preserved expanded agenda disclosure for an identical target.
- Routed destroy-time integration-node detach failures through the configured diagnostic sink.
- Corrected example teardown for the browser back/forward cache, static-demo links, no-end-time semantics, live activation feedback, and dirty-build provenance.
- Hardened changelog-comment, documentation-anchor, and Pages-metadata validation against hidden release state, GFM parser differences, and pathological version input; removed invalid null fixtures from compile-only public API checks.
- Bound retained Pages assembly tooling to the exact approved upstream commit and confined the loopback repository server to its selected public directory, including encoded Windows path separators.
- Corrected release-bundle digest normalization, upgraded artifact downloads to the official Node 24 action, and isolated automatic Pages deployment from manual rollback so their distinct trigger trust contexts cannot be combined.
- Reconstructed rollback snapshots inside the retained-state writer from authenticated Git objects, enforced the root runtime policy during every assembly, serialized Pages writers through deployment with GitHub's maximum queue, and bound forward-repair pushes to the exact reviewed `HEAD`.

## [0.2.0-alpha.0] - 2026-08-25

### Added

- Added an `npm run demo` loopback workflow with an examples landing page for local exploration, plus version-identifiable static deployments for a rolling `main` preview and immutable release demos.
- Added generic `Calendar<TMetadata>` instances and `setEvents()` to replace the complete static event snapshot or provider without recreating the calendar.  The method checks lifecycle before input, cancels older source work, retains usable same-range data on failure, preserves month, selection, focus, and agenda state, and makes the last accepted replacement the source used by Retry and `refetchEvents()`.

### Changed

- Refined direct day-selection feedback to use a short whole-cell color transition and a subtle date-number confirmation instead of an expanding radial reveal.

## [0.1.0-alpha.0] - 2026-08-21

### Added

- Published the initial public alpha as a dependency-free, framework-agnostic ESM package with TypeScript declarations and a scoped stylesheet export.
- Added a responsive six-week month grid, selected-day agenda, static and abort-aware asynchronous event sources, bounded navigation, localization, RTL presentation, and progressive fallback coordination.
- Added native keyboard, pointer, touch, pen, and precision-scroll interaction; accessible state and error presentation; public CSS tokens; node-based render hooks; examples; and verified release packaging.
