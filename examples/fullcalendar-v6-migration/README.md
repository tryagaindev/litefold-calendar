# FullCalendar v6 `dayGridMonth` migration example

Run `npm run demo` from the repository root, then choose **FullCalendar v6 migration** from the examples landing page.

This example keeps the adapter intentionally small.  The common event fields map directly, numeric identifiers become strings, `backgroundColor` or `borderColor` becomes Litefold's marker `accentColor`, and `extendedProps` becomes typed `metadata`.  Litefold then validates the complete event snapshot before rendering it.

The example also demonstrates:

- One abort-aware `events({ start, end, signal })` provider for the visible 42-day grid.
- The `dateClick` equivalent through `onDaySelect`.
- The `eventClick` equivalent through `onEventActivate` on both grid and agenda surfaces.
- URL path, query, and fragment preservation through native event links.
- `refetchEvents()` superseding stale requests.

Treat JSON received from an untrusted service as application input.  Validate that service contract before adapting it; do not duplicate Litefold's documented event validation inside a migration shim.

Litefold is not a FullCalendar compatibility layer.  Week/day/time-grid views, recurrence expansion, mutable event objects, drag/drop, resizing, resources, and FullCalendar render hooks require application-level redesign or a different calendar package.

Browse the source: [checked JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css).
