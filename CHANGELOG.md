# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).  Before `1.0.0`, documented breaking changes may occur between prereleases.

## [Unreleased]

### Added

- TBD

### Changed

- TBD

### Removed

- TBD

## [0.2.0-alpha.0] - 2026-08-25

### Added

- Added an `npm run demo` loopback workflow with an examples landing page for local exploration, plus version-identifiable static deployments for a rolling `main` preview and immutable release demos.
- Added generic `Calendar<TMetadata>` instances and `setEvents()` to replace the complete static event snapshot or provider without recreating the calendar.  The method checks lifecycle before input, cancels older source work, retains usable same-range data on failure, preserves month, selection, focus, and agenda state, and makes the last accepted replacement the source used by Retry and `refetchEvents()`.

### Changed

- Refined direct day-selection feedback to use a short whole-cell color transition and a subtle date-number confirmation instead of an expanding radial reveal.
