# FullCalendar v6 `dayGridMonth` migration example

This runnable example is the smallest useful companion to the [migration guide](../../docs/fullcalendar-v6-migration.md). It rewrites the source shape of a basic FullCalendar v6 month view; the version label defines that compatibility boundary and does not make this a compatibility layer.

## Run it

Follow the shared [local run instructions](../README.md#run-locally), then choose **Rewrite a dayGridMonth view**.

[`main.js`](main.js) is committed source, not generated output. The full example build checks it with TypeScript `checkJs`; `typecheck:examples` checks the advanced TypeScript recipe only. [`index.html`](index.html) provides the page structure, and [`../example.css`](../example.css) supplies shared example styles.

## Choose a package version

Use `npm install @tryagaindev/litefold-calendar@alpha` only for evaluation against the moving prerelease channel. After selecting a version for migration or production-like validation, install that exact prerelease version and commit the resulting lockfile so later channel movement cannot change the tested package.

## Follow the migration flow

Read [`main.js`](main.js) from top to bottom:

1. `FULLCALENDAR_STYLE_RESPONSE` represents the already-validated application payload.
2. `adaptFullCalendarSnapshot()` converts required identifiers to strings, carries `extendedProps` into typed `metadata`, and accepts only six-digit hexadecimal marker colors.
3. `previousCivilDate()` validates and converts FullCalendar's exclusive `validRange.end` to Litefold Calendar's inclusive `maxDate`.
4. `loadMigratedEvents()` receives Litefold Calendar's 42-day range and forwards its `AbortSignal` to cancellable work.
5. `onDaySelect` and `onEventActivate` replace the common `dateClick` and `eventClick` callbacks.
6. **Trigger overlapping refetches** calls `refetchEvents()` twice. The second request aborts the first, and only the latest result can render.

`loadMigratedEvents()` is `async`, so every invocation first renders loading with `aria-busy` and later renders its terminal result. A provider that directly returned an adapted array would instead complete one terminal render before the initiating method returned; even `Promise.resolve(array)` deliberately keeps the two-render async lifecycle.

The linked event is still a native anchor, including its path, query, and fragment. The example callback prevents navigation only to keep the demo page open, then reports the preserved target.

## Copy the boundaries, not the fixture

- FullCalendar permits missing event IDs; Litefold Calendar requires a non-empty ID that is unique in each returned snapshot. Use a stable domain identifier rather than an array index.
- FullCalendar accepts broader date inputs and time-zone-bearing strings. This adapter assumes date-only or local date-time strings already compatible with Litefold Calendar.
- FullCalendar colors may be any CSS color. Litefold Calendar's `accentColor` is only a built-in marker and accepts `#RRGGBB`; normalize other color formats in application code or omit them.
- Validate untrusted JSON against the service contract before calling the adapter. Litefold Calendar then validates the complete adapted snapshot atomically.

Week/day/time-grid views, recurrence expansion, mutable event objects, drag/drop, resizing, resources, and FullCalendar-specific render hooks need application-level redesign or a different calendar package.
