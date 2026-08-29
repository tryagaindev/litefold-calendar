# FullCalendar v6 `dayGridMonth` migration example

This runnable example is the smallest useful companion to the [migration guide](../../docs/fullcalendar-v6-migration.md). It rewrites a basic FullCalendar month view; it is not a compatibility layer.

## Run it

From the repository root:

```sh
npm ci --ignore-scripts
npm run demo
```

Open the printed `/examples/` URL and choose **Rewrite a dayGridMonth view**.

[`main.js`](main.js) is committed source, not generated output. TypeScript checks it through `checkJs`; [`index.html`](index.html) provides the page structure, and [`../example.css`](../example.css) supplies shared example styles.

## Follow the migration flow

Read [`main.js`](main.js) from top to bottom:

1. `FULLCALENDAR_STYLE_RESPONSE` represents the already-validated application payload.
2. `adaptFullCalendarSnapshot()` converts required identifiers to strings, carries `extendedProps` into typed `metadata`, and accepts only six-digit hexadecimal marker colors.
3. `previousCivilDate()` validates and converts FullCalendar's exclusive `validRange.end` to Litefold's inclusive `maxDate`.
4. `loadMigratedEvents()` receives Litefold's 42-day range and forwards its `AbortSignal` to cancellable work.
5. `onDaySelect` and `onEventActivate` replace the common `dateClick` and `eventClick` callbacks.
6. **Trigger overlapping refetches** calls `refetchEvents()` twice. The second request aborts the first, and only the latest result can render.

The linked event is still a native anchor, including its path, query, and fragment. The example callback prevents navigation only to keep the demo page open, then reports the preserved target.

## Copy the boundaries, not the fixture

- FullCalendar permits missing event IDs; Litefold requires a non-empty ID that is unique in each returned snapshot. Use a stable domain identifier rather than an array index.
- FullCalendar accepts broader date inputs and time-zone-bearing strings. This adapter assumes date-only or local date-time strings already compatible with Litefold.
- FullCalendar colors may be any CSS color. Litefold's `accentColor` is only a built-in marker and accepts `#RRGGBB`; normalize other color formats in application code or omit them.
- Validate untrusted JSON against the service contract before calling the adapter. Litefold then validates the complete adapted snapshot atomically.

Week/day/time-grid views, recurrence expansion, mutable event objects, drag/drop, resizing, resources, and FullCalendar-specific render hooks need application-level redesign or a different calendar package.
