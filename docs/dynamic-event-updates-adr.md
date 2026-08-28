# Dynamic event update decision record

> **Status:** Implemented.  `setEvents()` is the current narrow event-data replacement API; other `CalendarOptions` values remain construction-time configuration.

## Decision summary

The public API exposes one narrow event-data method:

```ts
interface Calendar<TMetadata = unknown> {
	setEvents(events: CalendarEvents<TMetadata>): void;
}
```

`createCalendar<TMetadata>()` returns `Calendar<TMetadata>`.  `setEvents()` replaces the complete static snapshot or provider, then loads the current visible range on the existing instance.  It does not update locale, time zone, date bounds, callbacks, extensions, messages, icons, limits, or integration nodes.  Those values remain construction-time configuration and require recreation.

Do not add a general `setOptions()` method.  Event data is the repeated dynamic case, while the other options own formatters, bounds, DOM leases, callbacks, or rendering policy whose safe partial replacement would turn a focused calendar into a general state-reconciliation system.

## Fixture evidence

The disposable [integration fixtures](../tests/fixtures/dynamic-update-integrations.ts) exercise the selected contract through public APIs only.  Their [focused DOM tests](../tests/dynamic-update-integrations.test.ts) cover the following framework lifecycle shapes without adding a dependency or making a framework support claim:

| Integration shape | Current approach | Result |
|---|---|---|
| Plain TypeScript | Call `setEvents()` for event/filter input and recreate for construction-time configuration | Direct and predictable; recreation still needs a valid new `initialDate` when bounds exclude the prior selection |
| React-style component effect | Keep one instance while a memoized configuration object is stable; call `setEvents()` when event props change; destroy in effect cleanup | Event and agenda focus survive data replacement, while configuration identity remains the explicit recreation boundary |
| Vue-style reactive watcher | Watch event state separately from locale, time-zone, and bound state; dispose watchers before destroying the instance | Maps directly to reactive stores without hiding current data behind a mutable provider closure |
| Progressive enhancement | Keep fallback markup outside the host; replace data while a usable snapshot exists; recreate only for construction-time changes | Replacement keeps the usable calendar visible and fallback hidden; recreation correctly restores fallback content during the new instance's first load |

The fixtures also establish these behavior differences:

* Replacing a static array through provider state works, but makes static data look asynchronous and requires the application to snapshot the correct source and filter for each request.
* Filters belong to application state.  Updating filter state and calling `refetchEvents()` is already sufficient because the provider can derive a filtered snapshot for the requested range.
* Locale, time zone, and inclusive date bounds affect formatters, date projection, navigation, and renderability.  Recreating the instance is the safer and smaller contract for those changes.
* Same-instance refetch and replacement preserve an exact focused event action when it still exists and fall back to the owning day when it does not.  Recreation can restore a selected day through public methods, but cannot restore an exact event action without querying private DOM.
* Refetch preserves the current revealed agenda count.  Recreation starts at one page.  `setEvents()` also preserves that count, bounded by the new result length and `agendaDomLimit`, so a background update does not collapse content or displace focus.
* Refetch aborts the prior request and ignores its late result.  Recreation also aborts through `destroy()`, but additionally replaces all DOM, listeners, extensions, integration-node leases, and observable instance identity.

## Alternatives

### Recreate the instance

Recreation remains the correct operation when construction-time configuration changes.  It provides a clean ownership boundary and already aborts source and extension work.  It is a poor default for event replacement because it clears the usable snapshot, resets agenda paging, replaces focused nodes, reruns every extension mount, and temporarily returns progressive enhancement to its fallback state.

### Provider state plus `refetchEvents()`

This remains the recommended approach for filters, cache invalidation, authorization state, and remote data refreshes.  It retains the current snapshot while the same range reloads, preserves instance identity, and uses cancellation and stale-result protection without changing provider identity.

Before `setEvents()`, a component receiving a new static event array needed a stable provider, external array state, per-request filter capture, and exactly one refetch.  That baseline boilerplate was the reason to select the narrow method.

### Selected: narrow `setEvents()` method

This expresses complete event-input replacement.  Static arrays stay static, provider identity changes explicitly, and component or reactive integrations use one imperative call instead of a mutable-provider adapter.  The method reuses the request, normalization, focus-token, agenda, error, and generation machinery without making unrelated options mutable.

The tradeoff is a public and internal contract change.  `Calendar<TMetadata>` preserves the metadata type selected by `CalendarOptions<TMetadata>`, and the coordinator stores a safely replaceable current event provider.

## Current contract

The implementation uses all of the following rules:

* **Meaning:** `setEvents(events)` replaces the entire `CalendarEvents<TMetadata>` input.  It is not additive, does not merge arrays, and does not mutate any other option.
* **Lifecycle:** require a rendered, non-destroyed instance using the same live guard as `refetchEvents()`.  Calls before `render()`, after `destroy()`, or after a fatal unavailable transition throw synchronous `invalid-state` errors.  A recoverable source-unavailable instance may accept a replacement and recover.
* **Validation order:** check lifecycle before inspecting the argument.  Then synchronously require an array or function and safely snapshot a static array.  A top-level inspection or snapshot failure throws `invalid-argument` without aborting the current request, changing the current source, changing state, or invoking `onError`.
* **Payload validation:** once the top-level input is accepted, make it the current source and run its result through the existing event-count, event-shape, URL, and atomic-normalization pipeline.  A provider rejection or invalid payload follows the existing operational error route and retains a usable same-range snapshot.  The accepted replacement remains current so Retry or `refetchEvents()` retries it; failure does not silently restore the previous provider.
* **Cancellation and generations:** clear an active swipe transaction, increment the source generation, abort the previous source signal, and start exactly one load for the current 42-day range.  Late success, failure, normalization, announcement, and render work from older generations must not commit.
* **State and focus:** keep `displayedMonth` and `selectedDate`.  Preserve the current focus token across loading and commit.  Restore an exact day or event action when it still exists; when a focused event disappears, use the existing owning-day fallback.  Do not move focus when it was outside the calendar.
* **Agenda:** preserve `agendaVisibleCount` rather than resetting it to one page.  Rendering still caps the visible result by the new event count and `agendaDomLimit`; adding more events does not reveal beyond the previously requested count.
* **Refetch interaction:** `refetchEvents()` always invokes the most recently accepted static snapshot or provider.  It never restores the construction-time source and never changes provider identity itself.
* **Reentrancy:** an accepted reentrant `setEvents()` call from `onStateChange`, `onError`, or another application callback supersedes the outer request/render generation.  Generation checks after every callback boundary must make the last accepted call win.  Invalid reentrant input leaves the active accepted source unchanged.
* **Return and errors:** return `void`.  Programmer errors remain synchronous and outside the operational `onError` pipeline; source and payload failures remain observable operational errors.

## Implementation and verification

The coordinator stores a mutable current `CalendarEventSource<TMetadata>` separate from the immutable options snapshot.  Argument resolution reuses the hardened array inspection used at construction while mapping method misuse to `invalid-argument`.  Source replacement calls the existing same-range loading path as an ordinary data change, so Retry-only recovery announcements are not emitted.

Public declarations, the exhaustive `Calendar` method map, API and integration documentation, the changelog, built examples, and packed-package consumer verification change together.  Focused tests cover static arrays, provider replacement, invalid top-level input, invalid payloads, stale success and failure, abort signals, recoverable source failure, before-render and after-destroy calls, callback reentrancy, exact focus restoration, removed-event fallback, preserved agenda paging, filters, and `refetchEvents()` after multiple replacements.

The decision record, integration fixtures, and measurement harness remain repository-only artifacts; the package manifest publishes `dist/` alone. The [API reference](api.md#control-the-calendar-calendar) is authoritative for the current `setEvents()` signature and behavior when this historical rationale and the implementation differ.

## Measurement protocol

The opt-in harness compares `setEvents()`, application-owned provider state followed by `refetchEvents()`, and instance recreation against the same visible range and event data:

```sh
npm run measure:dynamic-events
```

The default protocol alternates two deterministic snapshots of 10,000 valid events across the fixed `2026-07-26` through `2026-09-06` visible range. Each strategy receives five warmup operations and at least twenty measured operations. Strategy order rotates between cycles, the snapshot alternates each cycle, and the report uses the median and nearest-rank 95th percentile. Pass `--runs N` for more samples, `--size-only` for distribution size only, or `--json` for machine-readable output and raw samples.

The harness runs the built package in JSDOM. Use results to compare the three paths on one machine and toolchain, not as browser latency or Interaction to Next Paint data. No timing or size threshold is part of the repository gate. Lifecycle, ready-state, event-count, and visible-range mismatches still fail because they invalidate the comparison.

The report also includes raw and maximum-compression gzip byte counts for `dist/index.js`, `dist/internal/runtime/coordinator.js`, and every JavaScript module beneath `dist/`. Preserve a complete prior `dist/` directory outside the candidate build, then request baseline deltas:

```sh
npm run measure:dynamic-events -- --baseline .cache/dynamic-update-baseline/dist
```

The graph total compresses each module separately and is not a tarball size. A single prior `index.js` remains accepted when only the entry delta is available. Package verification remains authoritative for publishable bytes and consumer behavior.

Record Node, operating system, architecture, sample counts, median, p95, raw bytes, gzip bytes, and baseline identity when sharing results. Compare runs only when build, runtime, hardware, and protocol match. Historical local numbers are deliberately not retained as a current performance claim; use the reproducible command to gather evidence for the code under review.
