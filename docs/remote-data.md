# Remote data: load, filter, and refresh

This walkthrough is for an application that already renders a calendar and needs events from an API. It uses JavaScript with optional JSDoc types. Start with the [first render](../README.md#first-render) if you have not created a calendar yet.

The [runnable remote-data example](../examples/remote-data/) fetches a same-origin JSON file, offers a category filter, and opens an application-owned event chooser. Its source adapter is small enough to copy and adapt. It deliberately leaves caching and advanced render hooks to the [integration guide](integration-guide.md).

## 1. Supply a function

The `events` option can be a function. Litefold Calendar calls it for the current range on initial render, month navigation, and explicit refresh. Return the complete event array for that request, or throw on failure.

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";
import { loadEvents } from "./source.js";

const host = document.querySelector("[data-my-calendar]");
const filter = document.querySelector("[data-my-category]");
if (!(host instanceof HTMLElement) || !(filter instanceof HTMLSelectElement)) {
	throw new Error("Calendar controls were not found.");
}

const calendar = createCalendar(host, {
	initialDate: "2026-08-06",
	events: (range) => loadEvents(range, filter.value)
});
calendar.render();
```

To try the fixture, copy [source.js](../examples/remote-data/source.js) and [events.json](../examples/remote-data/events.json) beside your application entry point. Replace `../../dist/index.js` in the source's JSDoc imports with `@tryagaindev/litefold-calendar`. The shown initial date matches the fixture; choose an application date when connecting your service.

The adapter uses `fetch(url, { signal })`, checks `response.ok`, parses JSON as unknown data, validates every record, and maps only supported fields. Its example schema is date-only `{ id, title, start, end?, category }`; adapt the validator when your service uses timed events or another shape. A `200` response does not prove its body is valid.

The supplied `signal` aborts superseded requests and pending work during `destroy()`. Forward it to `fetch` and any other cancellable work. Do not convert a transport error or cancellation into `[]`: that represents a successful empty result. The library also prevents superseded results from replacing the current range.

## 2. Send the range and filter to your service

The fixture's URL includes `start`, `end`, and `category`, but a static server ignores those parameters. **The runnable example downloads public fixture records and filters them in the browser.** This is not authorization, server filtering, or a production data-storage service.

For a real endpoint, keep the request and validation steps and let the server apply the range and category:

```js
import { validateEvents } from "./source.js";

async function loadEvents({ start, end, signal }, category) {
	const url = new URL("/api/events", window.location.origin);
	url.searchParams.set("start", start);
	url.searchParams.set("end", end);
	url.searchParams.set("category", category);
	const response = await fetch(url, {
		signal,
		headers: { Accept: "application/json" }
	});
	if (!response.ok) {
		throw new Error(`Event request failed (${response.status}).`);
	}
	return validateEvents(await response.json());
}
```

| Request field | Meaning |
| --- | --- |
| `start` | Included civil date, such as `2026-07-26` |
| `end` | Excluded civil date, such as `2026-09-06` |
| `category` | Application-owned filter value; validate it on the server |

Return events that overlap the requested interval, including events that start earlier and continue into it. An event ending exactly at `start` or starting exactly at `end` is outside the range. Apply the documented default duration for missing ends: one day for all-day events, or a point at the start for timed events. An all-day event ending `2026-08-11` occupies dates through August 10. Do not derive requests from the viewport or assume every request begins on the month's first day.

Keep authentication, authorization, time-zone conversion, and response validation in the application. Filtering authorized results is not a substitute for authorization. The [event-source contract](api.md#supply-events-calendarevents-and-calendareventsource) owns exact range, date, and source behavior.

## 3. Change filters and refresh

```js
const lifetime = new AbortController();
filter.addEventListener("change", () => {
	calendar.refetchEvents();
}, { signal: lifetime.signal });
```

Read the filter once when the provider is invoked, as in `loadEvents(range, filter.value)`. Rapid changes start new requests and cancel older ones. Do not recreate the calendar for ordinary filters; keep the user's month and selected date.

Use the same method for an explicit Refresh button. After your application confirms a successful write, refresh the current source:

```js
async function saveAndRefresh(changes) {
	await applicationApi.saveEvent(changes);
	if (!lifetime.signal.aborted) {
		calendar.refetchEvents();
	}
}
```

`applicationApi.saveEvent` represents your application's authenticated write operation. Handle its failure in the editing form and leave it open for correction. The lifetime check skips a refresh if permanent teardown occurred while saving; abort that lifetime before destroying the calendar, as shown below. `refetchEvents()` returns `void`; it starts loading and does not await the next snapshot. Use [state callbacks](api.md#observe-state-calendarstate) if other application UI needs to observe loading or completion.

| Task | Method |
| --- | --- |
| Same provider, changed filter, saved event, or invalidated cache | `refetchEvents()` |
| Replace a local array with a complete updated snapshot | `setEvents(updatedEvents)` |
| Switch to another provider | `setEvents(nextProvider)` |

Passing an array to `setEvents()` replaces the provider. Subsequent `refetchEvents()` calls use that array; they do not restore your previous remote source. There is no per-event mutation API.

## 4. Keep empty and error states distinct

Return `[]` when the server successfully finds no matching events. The selected-day agenda displays its empty message. Throw when transport, HTTP status, parsing, or validation fails; the calendar supplies persistent source-error UI and Retry. A failed refresh can retain the previous events while warning that they may be out of date.

The runnable example's “Sports (empty)” category demonstrates an empty result. Use the browser's network tooling or the [async-errors example](../examples/async-errors/) to explore failure and recovery. Leave package-owned error presentation enabled until your application has a complete alternative. See [error handling](errors.md) before returning `"handled"` from `onError`.

## 5. Connect actions and clean up

Use [event-count settings](integration-guide.md#choose-event-counts) to make busy days recognizable. The [application-owned chooser recipe](integration-guide.md#own-the-event-chooser) receives every loaded occurrence for the date and connects naturally to an existing details or scheduling dialog. The runnable example records a local choice; it does not send a write request.

For a component or route, run both operations during permanent teardown:

```js
lifetime.abort();
calendar.destroy();
```

Close application dialogs and release their listeners too. The [runnable entry point](../examples/remote-data/main.js) demonstrates cleanup on non-cached `pagehide`, native dialog dismissal, and returning focus after a request has replaced the originating event or count button.
