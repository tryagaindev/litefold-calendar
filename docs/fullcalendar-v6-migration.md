# Migrate a basic FullCalendar month view

This guide covers a focused rewrite from FullCalendar v6 `dayGridMonth` to Litefold Calendar. It fits applications that render one month grid, load events for the visible range, react to day or event activation, and navigate programmatically.

Litefold Calendar is not a FullCalendar compatibility layer. Check the [feature gaps](#know-when-this-migration-is-not-a-fit) before starting.

## Install and render

Add Litefold Calendar to the application:

```sh
npm install @tryagaindev/litefold-calendar@alpha
```

Use the movable `alpha` tag only to evaluate the current candidate. For a
repeatable migration or production-like environment, replace `alpha` with the
exact prerelease reported by the registry and save that exact version.

Remove the FullCalendar packages and plugins after the rewrite no longer imports them. Unlike FullCalendar v6, Litefold Calendar requires an explicit stylesheet import.

```html
<div id="my-calendar"></div>
```

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";

const host = document.querySelector("#my-calendar");
if (!(host instanceof HTMLElement)) {
	throw new Error("Calendar host was not found.");
}

const calendar = createCalendar(host, {
	events: [],
	initialDate: "2026-08-04"
});

calendar.render();
```

The CSS import assumes a bundler that supports package CSS. Call `calendar.destroy()` when the owning page or component is disposed.

## Map common options

| FullCalendar v6 | Litefold Calendar | Migration note |
| --- | --- | --- |
| `initialView: "dayGridMonth"` | No option | Month grid plus selected-day agenda is Litefold Calendar's only view. |
| `initialDate` | `initialDate` | Prefer an exact civil-date string when no time-zone projection is needed. FullCalendar also accepts epoch-millisecond numbers; convert those to `Date` first because Litefold Calendar does not accept numeric date inputs. |
| `events: []` | `events: []` | Adapt the event fields first. |
| `events(fetchInfo, success, failure)` | `events({ start, end, signal })` | Return an array or PromiseLike. The returned shape selects immediate or loading timing for that invocation; forward the supplied abort signal. |
| `dateClick` | `onDaySelect` | Receives the selected civil date, the new live day button after Litefold Calendar commits its rerender, and the native event from the replaced button. |
| `eventClick` | `onEventActivate` | Receives the event, native action element, native event, and surface. |
| `eventContent` | Node-producing `renderHooks` members | Return detached same-document nodes, not HTML strings. |
| `eventDidMount` | `eventDidMount` render hook | Mutate the supplied live elements and return `undefined` or a synchronous cleanup function—not a node. |
| `headerToolbar` | Built-ins plus `toolbarEnd` | Previous/Next are at the start, the month title is centered, and Today is at the end. |
| `customButtons` | Application controls in `toolbarEnd` | The application owns the markup, behavior, and cleanup. |
| `locale`, `firstDay` | `locale`, `firstDay` | Numeric Sunday-through-Saturday values map directly; Litefold Calendar also accepts `"locale"`. |
| `dayMaxEvents` | `maxGridEventsPerDay` | Litefold Calendar requires a fixed numeric cap and routes overflow to the agenda. |
| `validRange.start` | `minDate` | Both boundaries are inclusive. |
| `validRange.end` | `maxDate` | FullCalendar's end is exclusive; convert a date-only end to the preceding civil date. |
| `timeZone` | `timeZone` or omission | Pass an IANA zone or `"UTC"`. Map FullCalendar's `"local"` sentinel to an omitted Litefold Calendar option, which uses device-local fields for `Date` inputs. Litefold Calendar never reinterprets event strings. |
| `buttonText`, localized text | `messages` | Override only the message keys the application needs. |
| `height`, `contentHeight`, `aspectRatio` | Application CSS | Litefold Calendar sizes from its host and content. The host must meet the [minimum supported design width](../DESIGN.md#responsive-model). |

FullCalendar also permits `validRange` to be a function. Resolve dynamic bounds in application state before creating Litefold Calendar, then recreate the instance when those construction-time bounds change.

### Convert an exclusive `validRange.end`

For a FullCalendar date-only boundary, subtract one civil day in UTC so the result does not depend on the browser's local time zone:

```js
function previousCivilDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
		throw new TypeError("validRange.end must be a valid date-only ISO string in years 0001-9999.");
	}

	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
		throw new TypeError("validRange.end must be a valid date-only ISO string in years 0001-9999.");
	}

	date.setUTCDate(date.getUTCDate() - 1);
	const previous = date.toISOString().slice(0, 10);
	if (previous.startsWith("0000-")) {
		throw new RangeError("validRange.end has no preceding date supported by Litefold Calendar.");
	}
	return previous;
}

const litefoldBounds = {
	minDate: fullCalendarOptions.validRange?.start,
	maxDate: fullCalendarOptions.validRange?.end === undefined
		? undefined
		: previousCivilDate(fullCalendarOptions.validRange.end)
};
```

## Adapt event fields

The common event names are close, but their accepted values are not identical:

| FullCalendar event input | Litefold Calendar event input |
| --- | --- |
| Optional string or numeric `id` | Required non-empty string `id`, unique in the returned snapshot |
| `title`, `url` | Same names after application validation |
| `start`, `end` | Same names when already strict date-only or local date-time strings; `end` remains exclusive |
| `allDay` | No field; inferred from date-only versus date-time strings |
| Six-digit hexadecimal `backgroundColor` or `borderColor` | `accentColor` event marker color |
| `extendedProps` | Typed `metadata` |

A small adapter is enough when the incoming service contract already meets those assumptions:

```js
const OPAQUE_HEX_COLOR = /^#[0-9A-F]{6}$/iu;

function adaptFullCalendarEvents(events) {
	return events.map((event) => {
		if (typeof event.id !== "string" && typeof event.id !== "number") {
			throw new TypeError("Every migrated event needs a stable id.");
		}
		if (event.allDay !== undefined && typeof event.allDay !== "boolean") {
			throw new TypeError("FullCalendar allDay must be a boolean when supplied.");
		}

		const inferredAllDay = /^\d{4}-\d{2}-\d{2}$/.test(event.start);
		if ((event.end !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(event.end) !== inferredAllDay) ||
			(event.allDay !== undefined && event.allDay !== inferredAllDay)) {
			throw new TypeError("FullCalendar allDay must match the date-only or date-time start and end values.");
		}

		const accentColor = [event.backgroundColor, event.borderColor]
			.find((value) => typeof value === "string" && OPAQUE_HEX_COLOR.test(value));

		return {
			id: String(event.id),
			title: event.title,
			start: event.start,
			...(event.end === undefined ? {} : { end: event.end }),
			...(event.url === undefined ? {} : { url: event.url }),
			...(accentColor === undefined
				? {}
				: { accentColor: accentColor.toUpperCase() }),
			...(event.extendedProps === undefined
				? {}
				: { metadata: event.extendedProps })
		};
	});
}
```

Do not derive an ID from the array index: pagination, filtering, or sorting would change event identity. If the FullCalendar feed omitted IDs, add a stable domain identifier before adapting it.

FullCalendar's explicit `allDay` can override what its date strings imply. Litefold Calendar has no override: date-only `start` and `end` values are all-day, while local date-times are timed. Reject a mismatch as above or normalize it deliberately before returning the event; silently dropping `allDay` can change duration and placement.

Litefold Calendar accepts Gregorian `YYYY-MM-DD` strings and local date-times such as `YYYY-MM-DDTHH:mm`; seconds and fractional seconds are also supported. It does not accept `Date` objects, UTC `Z` suffixes, or numeric offsets in event fields. Convert those values according to the application's scheduling semantics rather than stripping an offset.

`accentColor` is the built-in event marker color, not a replacement for arbitrary FullCalendar backgrounds, borders, or text colors. The [calendar anatomy guide](component-anatomy.md#three-color-roles-that-sound-similar) distinguishes it from the two calendar-wide color tokens. Use render hooks and application CSS when metadata needs richer treatment.

Validate untrusted transport JSON against the application's service schema before adapting it. Litefold Calendar then validates the entire adapted snapshot atomically.

## Rewrite a JSON feed or event function

FullCalendar supplies `Date` values and ISO strings through `fetchInfo`, then uses callbacks or a returned promise. Litefold Calendar passes one fixed 42-day range with strict date-only strings and expects the provider's return value:

```js
const calendar = createCalendar(host, {
	events: async ({ start, end, signal }) => {
		const query = new URLSearchParams({ start, end });
		const response = await fetch(`/api/events?${query}`, { signal });
		if (!response.ok) {
			throw new Error(`Event request failed with ${response.status}.`);
		}

		const payload = await response.json();
		//Validate payload against the application's service schema here.
		return adaptFullCalendarEvents(payload);
	}
});
```

The range start is inclusive and the end is exclusive. The
[source-timing contract](api.md#source-timing-and-renders) defines
direct-versus-PromiseLike behavior. Litefold Calendar aborts superseded or
destroyed requests and ignores stale results. It does not cache, combine
first-class event sources, or expand recurrence; keep that work in application
code.

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

Grid event activation does not select the represented day. Use `surface` when compact grid summaries and full agenda rows need different behavior. Linked events remain native anchors; call `preventDefault()` synchronously only when application behavior replaces navigation.

Day selection commits and rerenders before `onDaySelect` runs. Its `element` is the new live selected-day button; `nativeEvent.target` and `nativeEvent.currentTarget` may refer to the detached button that received the gesture. Use `element` for follow-up focus or geometry.

## Replace the complete event input

Use `setEvents()` when the application receives a new complete static snapshot or provider:

```js
calendar.setEvents(adaptFullCalendarEvents(nextEvents));
```

`setEvents()` replaces rather than adds or merges. A direct array replacement commits before this void call returns; a PromiseLike replacement publishes loading and settles later. It preserves the displayed month and selected date, aborts superseded provider work, and makes the replacement current for later Retry and `refetchEvents()` calls. Call it only after `render()` and before `destroy()`.

Recreate the calendar to change locale, time zone, bounds, callbacks, render hooks, extensions, limits, or any other construction-time option. The [API reference](api.md) documents focus preservation and failure behavior.

## Map navigation and data methods

| FullCalendar method | Litefold Calendar replacement |
| --- | --- |
| `prev()` | `prev()` |
| `next()` | `next()` |
| `today()` | `today()` |
| `gotoDate(value)` | `gotoDate(value)`; convert FullCalendar epoch-millisecond numbers with `new Date(value)` first |
| `refetchEvents()` | `refetchEvents()` |
| `getDate()` | `getState().displayedMonth`, a frozen `{ year, month, day: 1 }` civil object with a one-based month—not a native `Date`; use `selectedDate` when the selected agenda day is required |
| `getEvents()` | Keep the canonical event data in application state |
| `getEventSources()`, `addEventSource()`, source `remove()` | Compose sources in application code, then pass the complete result or provider to `setEvents()` |
| `destroy()` | `destroy()` |

Litefold Calendar navigation and data methods return `void`; `getState()` returns an immutable snapshot. Inclusive `minDate` and `maxDate` constraints apply to controls, keyboard movement, touch paging, the month/year picker, and public methods.

## Replace styling hooks

Import the public stylesheet and override documented `--lfc-*` tokens from application CSS. Use `toolbarEnd` and `renderHooks` for application-owned nodes. Do not port selectors that depend on FullCalendar markup, and do not depend on Litefold Calendar's private `.lfc-*` or `data-lfc-*` implementation details.

## Know when this migration is not a fit

Choose a full scheduling suite when the application requires week/day/time-grid or resource views, recurrence expansion, date-range selection, drag-and-drop editing, resizing, built-in event creation, multiple independently managed feeds, or mutable event objects. Litefold Calendar deliberately focuses on a responsive month grid and selected-day agenda.

The [runnable migration example](../examples/fullcalendar-v6-migration/) demonstrates the adapter, abort-aware provider, callbacks, native links, and overlapping refetches. The [API reference](api.md) is the normative Litefold Calendar contract.
