# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  Before `1.0.0`, documented breaking changes may occur between prereleases.

## [Unreleased]

### Added

- Added a specification-compliant `DESIGN.md` as the canonical source for the package visual identity, exact light/dark defaults, responsive composition, component states, and public CSS token mapping.
- Added a decorative compact stacked-card cue for days with multiple events, plus `renderMultipleEventIndicator` and `renderGridOverflowContent` extension hooks for customizing compact plurality and wide overflow presentation without replacing native actions.
- Added explicit, default-off WebMCP site tools for paging through presentation-safe events in the currently loaded visible range and navigating a rendered calendar, with date filtering, safe output projection, lifecycle cleanup, and progressive fallback when the experimental browser API is unavailable.

### Changed

- Reconciled package CSS with the design system by making base typography explicit, applying the shared component radius to event rows and navigation controls, and centralizing private visual primitives and the documented pixel exceptions.
- Simplified alpha publication around the exact eligible `main` push, a source-free protected npm publisher, and a separately authorized Pages release operation, and consolidated repository documentation around one index and one canonical guide per contract.

### Fixed

- Kept release-only Pages navigation and provenance usable without JavaScript or a manifest refresh, requested mutable example metadata without browser caching, and allowed full source commits to wrap on 320-pixel screens.

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
- Added native keyboard, pointer, touch, pen, and precision-scroll interaction; accessible state and error presentation; public CSS tokens; node-based extension hooks; examples; and verified release packaging.
