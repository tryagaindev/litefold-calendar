# Migrate a basic FullCalendar month view

This guide covers a focused rewrite from FullCalendar v6 `dayGridMonth` to Litefold.  It is intended for applications that show a month grid, load events for the visible range, react to day or event activation, and navigate programmatically.  Litefold is not a FullCalendar compatibility layer.

## Install and render

Replace the FullCalendar package and stylesheet imports with Litefold's root exports:

```sh
npm install @tryagaindev/litefold-calendar@alpha
```

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";

const calendar = createCalendar(host, {
	events: [],
	initialDate: "2026-08-04"
});

calendar.render();
```

Call `destroy()` when the owning page or component is disposed.

## Map the common options

| FullCalendar v6 | Litefold | Notes |
| --- | --- | --- |
| `initialView: "dayGridMonth"` | No option | Month grid plus selected-day agenda is the only view. |
| `initialDate` | `initialDate` | Same civil-date use case. |
| `events: []` | `events: []` | Static arrays map directly after field adaptation. |
| `events(info, success, failure)` | `events({ start, end, signal })` | Return an array or promise; use the supplied abort signal. |
| `dateClick` | `onDaySelect` | Receives a strict civil date and native button context. |
| `eventClick` | `onEventActivate` | Receives the event, native action element, native event, and surface. |
| `eventContent` / `eventDidMount` | Litefold extensions | Return same-document nodes; do not return HTML strings. |
| `headerToolbar` | Built-ins plus `toolbarEnd` | Previous/Next are at the start, title is centered, Today is at the end. |
| `customButtons` | Application buttons inside `toolbarEnd` | The application owns markup, behavior, and cleanup. |
| `locale`, `firstDay` | `locale`, `firstDay` | The numeric Sunday-through-Saturday values map directly; Litefold also accepts `"locale"`. |
| `dayMaxEvents` | `maxGridEventsPerDay` | Litefold uses a fixed numeric cap and an agenda overflow route. |
| `validRange.start` | `minDate` | Both are inclusive for selectable dates. |
| `validRange.end` | `maxDate` | FullCalendar's range end is exclusive; convert it to the preceding civil date. |
| `timeZone` | `timeZone` | Applies when Litefold projects JavaScript `Date` values; strict event strings remain civil values. |
| `buttonText`, locale text | `messages` | Override only the message keys the application needs. |
| `height`, `contentHeight`, `aspectRatio` | Container/application CSS | Litefold sizes from its container and content rather than a JavaScript height option. |


### Convert an exclusive `validRange.end`

FullCalendar commonly treats `validRange.end` as exclusive, while Litefold's `maxDate` is inclusive.  Convert the boundary as a civil date rather than subtracting milliseconds in local time:

```js
function previousCivilDate(value) {
	const date = new Date(`${value}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

const options = {
	minDate: fullCalendarOptions.validRange?.start,
	maxDate: fullCalendarOptions.validRange?.end === undefined
		? undefined
		: previousCivilDate(fullCalendarOptions.validRange.end)
};
```

## Adapt event fields

The common event fields are deliberately close:

| FullCalendar event input | Litefold event input |
| --- | --- |
| `id`, `title`, `start`, `end`, `url` | Same field names |
| `backgroundColor` or `borderColor` | `accentColor` |
| `extendedProps` | `metadata` |

A small adapter is normally enough:

```js
function adaptFullCalendarEvents(events) {
	return events.map((event) => {
		const accentColor = event.backgroundColor ?? event.borderColor;
		return {
			id: String(event.id),
			title: event.title,
			start: event.start,
			...(event.end === undefined ? {} : { end: event.end }),
			...(event.url === undefined ? {} : { url: event.url }),
			...(accentColor === undefined ? {} : { accentColor }),
			...(event.extendedProps === undefined
				? {}
				: { metadata: event.extendedProps })
		};
	});
}
```

Every event needs a stable identifier.  Litefold accepts strict Gregorian date-only or local date-time strings and validates the entire returned snapshot atomically.  `end` remains exclusive.  `accentColor` is a validated marker color, not a replacement for arbitrary FullCalendar event backgrounds.

Validate untrusted transport JSON against the application's server contract before adapting it.  Keep the adapter concerned with field mapping and let Litefold enforce its public event contract.

## Rewrite a JSON feed or event function

FullCalendar passes a fetch range through callback arguments.  Litefold passes one inclusive-start/exclusive-end range for the visible six-week grid and expects a return value:

```js
const calendar = createCalendar(host, {
	events: async ({ start, end, signal }) => {
		const query = new URLSearchParams({ start, end });
		const response = await fetch(`/api/events?${query}`, { signal });
		if (!response.ok) {
			throw new Error(`Event request failed with ${response.status}.`);
		}

		const payload = await response.json();
		return adaptFullCalendarEvents(payload);
	}
});
```

Litefold aborts superseded or destroyed requests and ignores stale results.  It does not cache or combine first-class event sources.  Aggregate, authorize, cache, and expand recurrence in application code before returning the snapshot.

## Replace event input

When the application receives a different complete static snapshot or provider, replace the event input on the rendered instance:

```js
calendar.setEvents(adaptFullCalendarEvents(nextEvents));
```

`setEvents()` is a complete replacement, not an add or merge operation.  It keeps the displayed month, selected date, current agenda reveal count, and package-owned focus when the same day or event occurrence remains.  A removed focused event falls back to its day.  The replacement aborts superseded source work, and `refetchEvents()` thereafter uses the latest accepted source.

Call the method only after `render()` and before `destroy()`.  Litefold checks that lifecycle before inspecting the argument.  Invalid top-level input throws synchronous `invalid-argument` without changing current work.  Once accepted, a provider or payload failure uses the normal source-error flow and retains usable same-range data; the accepted source stays current for Retry and refetch.  If application callbacks replace events reentrantly, the last accepted replacement wins.

This narrow event-data method does not update locale, time zone, `minDate`, `maxDate`, callbacks, extensions, limits, or other options.  Recreate the calendar instance when those construction-time values change.

## Rewrite callbacks

```js
const calendar = createCalendar(host, {
	events,
	onDaySelect: ({ dateString, element, nativeEvent }) => {
		openDay(dateString, { element, nativeEvent });
	},
	onEventActivate: ({ event, element, nativeEvent, surface }) => {
		if (element instanceof HTMLAnchorElement && shouldOpenDialog(event)) {
			nativeEvent.preventDefault();
		}
		openEvent(event, { element, nativeEvent, surface });
	}
});
```

Grid event activation does not select its represented day.  Use `surface` when behavior differs between the compact grid summary and the full agenda row.

## Map navigation methods

| FullCalendar method | Litefold method |
| --- | --- |
| `prev()` | `prev()` |
| `next()` | `next()` |
| `today()` | `today()` |
| `gotoDate(value)` | `gotoDate(value)` |
| `getEventSources()` / `EventSource::remove()` / `addEventSource(value)` | `setEvents(value)` |
| `refetchEvents()` | `refetchEvents()` |
| `getDate()` | `getState().displayedMonth` or `getState().selectedDate` |
| `destroy()` | `destroy()` |

Litefold navigation, lifecycle, and event-data methods return `void`; `getState()` returns an immutable snapshot.  `setEvents()` replaces the whole source rather than mirroring FullCalendar's mutable event store.  Inclusive `minDate` and `maxDate` constraints apply consistently to controls, keyboard movement, touch paging, the month/year picker, and methods.

## Replace styling hooks

Import the public stylesheet and override documented `--lfc-*` tokens from application CSS.  Use `toolbarEnd` and extension hooks for application-owned nodes.  Do not port selectors that depend on FullCalendar markup, and do not depend on Litefold's private `.lfc-*` or `data-lfc-*` implementation details.

## Know when this migration is not a fit

Choose a full scheduling suite when the application requires week/day/time-grid or resource views, recurrence expansion, date-range selection, drag-and-drop editing, resizing, built-in event creation, multiple first-class feeds, or mutable event objects.  Litefold deliberately focuses on a responsive month grid and selected-day agenda.

The [runnable migration example](../examples/fullcalendar-v6-migration/) demonstrates the adapter, abort-aware provider, callbacks, native links, and superseded refetch behavior.  The [API reference](api.md) is the normative contract.
