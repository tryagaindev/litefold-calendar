# Application integration guide

Use this guide to add a specific capability to a calendar that already renders.
For ordinary API loading, filtering, and refresh, follow [Remote data](remote-data.md).
Exact signatures, defaults, and failure behavior are in the [API reference](api.md).

| Task | Recipe |
| --- | --- |
| Preserve typed application metadata | [Typed source adapter](#typed-source-adapter) |
| Show busy-day totals | [Event counts](#choose-event-counts) |
| Open an existing picker or details dialog | [Application-owned chooser](#own-the-event-chooser) |
| Add metadata-driven visual content | [Render-hook styling](#add-metadata-driven-visuals-without-private-selectors) |
| Load from an existing non-module entry point | [Classic-script entry point](#classic-script-entry-point) |

## Ownership boundary

Litefold Calendar handles date placement, rendering, navigation, request
cancellation, focus, and default recovery UI.  Your application handles networking,
authorization, response validation, time-zone conversion, caching, filters, editing,
routing, dialogs, and diagnostics.  Server content, search metadata, and privacy
policy also remain application responsibilities.

In the recipes, `my-*` names are application-owned placeholders; rename them
consistently.  Use `.litefold-calendar`, `data-litefold-calendar`, documented
`--lfc-*` tokens, and public callbacks or hooks instead of private `.lfc-*` or
`data-lfc-*` descendants.  See [Styling and customization](styling.md) for themes and visual content.

## Adoption sequence

New integrations should complete [Getting started](getting-started.md), then
connect [remote data](remote-data.md) as needed.  Return here for optional recipes;
a typed adapter, cache, render hook, or extension is not a prerequisite for the
first render.  Verify the behavior you add, including failure recovery and
[application accessibility responsibilities](../ACCESSIBILITY.md#integration-responsibilities).

## Typed source adapter

Event metadata is optional. A basic calendar needs no metadata interface and no generic argument. Use an application-defined type only when application data must remain available to actions or render hooks; typed `events` let `createCalendar()` infer that type and return `Calendar<TMetadata>`. The returned type keeps later `setEvents()` replacements on the same metadata contract as actions and render hooks.

Namespace IDs when records from multiple application categories can share a numeric or short identifier:

```ts
type EventKind = "appointment" | "milestone" | "task";

interface EventData {
	readonly actionId: string;
	readonly kind: EventKind;
	readonly statusLabel?: string;
}

interface ApplicationRecord {
	readonly accent: string | null;
	readonly detailsPath: string | null;
	readonly end: string | null;
	readonly id: string;
	readonly kind: EventKind;
	readonly start: string;
	readonly statusLabel: string | null;
	readonly title: string;
}

function toCalendarInput(record: ApplicationRecord): CalendarEventInput<EventData> {
	const accentColor = toAccentColor(record.accent);

	return {
		id: `${record.kind}:${record.id}`,
		title: record.title,
		start: record.start,
		...(record.end === null ? {} : { end: record.end }),
		...(record.detailsPath === null ? {} : { url: record.detailsPath }),
		...(accentColor === undefined ? {} : { accentColor }),
		metadata: {
			actionId: record.id,
			kind: record.kind,
			...(record.statusLabel === null
				? {}
				: { statusLabel: record.statusLabel })
		}
	};
}
```

Build optional fields conditionally because the package uses `exactOptionalPropertyTypes`, and validate required values before returning the array.

Event URLs must be relative or HTTP(S), free of whitespace changes, control characters, and credentials, and no longer than 2,048 UTF-16 code units before and after resolution against the host document. The package validates the complete snapshot again; see the [event input contract](api.md#define-events-calendareventinput-and-calendarevent).

When adaptation runs inside an event provider, a thrown adapter error rejects the complete result and activates the package's safe error presentation. Keep raw response details in trusted application diagnostics only.

### Validate event marker colors

Only one validated per-event marker color crosses the public boundary:

```ts
const OPAQUE_HEX_COLOR = /^#[0-9A-F]{6}$/u;

function toAccentColor(value: string | null): string | undefined {
	if (value === null) {
		return undefined;
	}

	const normalized = value.toUpperCase();
	return OPAQUE_HEX_COLOR.test(normalized) ? normalized : undefined;
}
```

The package applies the event marker color field, `accentColor`, only to its built-in SVG marker. It does not tint the event summary or change its text, background, border, or event leading-rule color, and core rendering does not emit a `style` attribute. The [calendar anatomy and color guide](styling.md#three-color-roles-that-sound-similar) distinguishes this per-event field from the calendar-wide primary interface color and event leading-rule color. Use public tokens for application-wide styling and render-hook-owned classes for a finite event palette; use `renderEventMarker` for richer marker content.

Dynamic event-surface colors remain an application concern. A trusted `eventDidMount` hook can place a previously validated color in an application-owned custom property on `elements.root`, but doing so creates inline style state and is incompatible with `style-src-attr 'none'`. Prefer finite render-hook-owned classes for strict-CSP integrations. Never copy unvalidated feed values into CSS, and keep text contrast, focus, forced-colors, and cleanup behavior application-owned.

### Choose a local snapshot or provider

An in-memory or already-cached source can return its array without artificial asynchronous work:

```ts
const localEvents: CalendarEvents<EventData> =
	applicationRecords.map(toCalendarInput);
```

This eager mapping runs before calendar construction, so the application must present and report any adapter failure as a startup error. A static array validates and commits its terminal state before the initiating `render()` or `setEvents()` call returns. It uses one full calendar render and never publishes `"loading"` or `aria-busy`.

Use a provider when package-owned source failure and Retry behavior should
apply. A directly returned array follows the immediate path; a PromiseLike uses
loading then terminal state. The
[source-timing contract](api.md#source-timing-and-renders) owns exact
classification and callback order. Forward the supplied `signal` to
cancellable work and reject on transport, authorization, response-validation,
or adapter failure:

```ts
const remoteEvents: CalendarEventSource<EventData> = async ({ end, signal, start }) => {
	const records = await scheduleClient.loadRange({ end, signal, start });
	return records.map(toCalendarInput);
};
```

Treat the supplied provider range as authoritative rather than deriving
requests from viewport or gesture state. The
[event-source contract](api.md#supply-events-calendarevents-and-calendareventsource)
owns invocation, range, cancellation, replacement, and commit behavior.

### Yield during expensive response adaptation

If profiling shows that adapting a large validated response blocks interaction,
yield between records inside the already asynchronous event source. This can
improve responsiveness while adding elapsed time. Keep the simple mapping above
for small responses such as the five-record remote-data fixture. The **8 ms**
budget below is a starting point to profile and tune on your target devices.

```ts
async function adaptLargeResponse(
	records: readonly ApplicationRecord[],
	signal: AbortSignal
): Promise<CalendarEventInput<EventData>[]> {
	signal.throwIfAborted();
	const WORK_BUDGET_MS = 8;
	const events: CalendarEventInput<EventData>[] = [];
	let deadline = performance.now() + WORK_BUDGET_MS;

	for (const record of records) {
		events.push(toCalendarInput(record));
		if (events.length < records.length && performance.now() >= deadline) {
			if (typeof globalThis.scheduler?.yield === "function") {
				await globalThis.scheduler.yield();
			} else {
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			}
			signal.throwIfAborted();
			deadline = performance.now() + WORK_BUDGET_MS;
		}
	}

	return events;
}
```

After the provider fetches and validates its response, replace
`return records.map(toCalendarInput)` with `return adaptLargeResponse(records, signal)`.
The helper returns the whole array only after adaptation succeeds; an adapter
failure or cancellation rejects the request without publishing a partial result.
The provider's signal is checked before work and after every yield.

Feature detection uses [`scheduler.yield()`](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)
when available and a timer fallback otherwise. A yield cannot preempt one adapter
call or split JSON parsing, sorting, or DOM layout into smaller operations; profile
those separately. See [Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
for the scheduling tradeoffs. This application-side helper preserves the core's
synchronous local-array behavior.

## Bound one calendar instance

Use independently optional, inclusive civil-date bounds when product policy limits navigation or selection:

```ts
const calendar = createCalendar(host, {
	events: remoteEvents,
	initialDate: "2026-08-06",
	minDate: "2026-07-15",
	maxDate: "2026-09-15"
});
```

Keep application-owned date controls aligned by applying the same bounds to external inputs that call `gotoDate()` or `focusDate()`. The [API configuration contract](api.md#data-date-and-layout-options) owns exact bound admission, navigation, and initial-date behavior.

## WebMCP site tools

WebMCP is an optional first-party extension with document-wide tool names. Assign each selected calendar a stable semantic prefix and keep the ordinary UI complete. The package treats an unavailable API as a progressive no-op. Drive activation from application or server policy rather than browser detection:

```ts
import { createCalendar } from "@tryagaindev/litefold-calendar";
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";

const myWebMcpEnabled = host.dataset.myWebMcpEnabled === "true";

const calendar = createCalendar(host, {
	events: remoteEvents,
	extensions: myWebMcpEnabled
		? [webMcp({ toolNamePrefix: "my-schedule" })]
		: []
});
```

`webMcp()` defaults to `"litefold-calendar"`. Use explicit role-based prefixes such as `my-schedule` and `my-public-calendar` whenever a page can host more than one calendar. Do not use array positions, counters, random values, tenant secrets, user identifiers, or localized labels. Tool names live in the document registry and are part of the application integration contract.

The static import above remains in the application import graph even when `myWebMcpEnabled` is false at runtime. Builds that must remove WebMCP bytes should omit the subpath import through an application build-time branch, or dynamically import the extension before constructing the calendar. Litefold Calendar performs no runtime extension discovery. See [first-party extensions](api.md#extension-imports-and-bundles) for the exact bundle boundary.

The two tools either page through presentation-safe events in the currently loaded 42-day range or navigate through existing public paths. `<prefix>-get-events` can cover the allowed range or filter one date; it never fetches to satisfy a read. Neither tool exposes IDs, URLs, metadata, render-hook nodes, raw errors, or application activation commands.

The read tool does expose each title and normalized `start`, `end`, and `isAllDay` value, even when `eventTimeDisplay` hides time visually. Apply the same signed-in authorization and privacy decision used for the visible calendar.

See the [WebMCP site-tool guide](webmcp.md) for exact tool schemas, lifecycle, compatibility, privacy, and testing. Do not build directly on `document.modelContext` when the extension covers the intended operation; package-owned registration keeps cleanup aligned with `destroy()`.

## Native pull/snap paging

Leave `swipe` enabled unless the host context must disable direct-input paging. Below a `24rem` calendar content width, package container CSS shows the locale's abbreviated month with a numeric year in both the toolbar and decorative pager lanes; exactly `24rem` and above uses the full month. Complete accessible month naming is unchanged, and the lanes remain entirely decorative. Do not measure the viewport or host to select this state, intercept package touch, pointer, wheel, or scroll events, or query or mutate private toolbar and pager descendants. The [API option](api.md#data-date-and-layout-options) owns public behavior, the [accessibility guide](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) owns input and verification requirements, and [DESIGN.md](../DESIGN.md#pager-direction-and-motion) owns exact presentation.

## Choose visual time surfaces

The default exposes localized event times on both grid and agenda surfaces. Choose another visual combination without forking CSS or querying package structure:

```ts
const calendar = createCalendar(host, {
	events,
	eventTimeDisplay: "agenda"
});
```

Choose among `"all"`, `"grid"`, `"agenda"`, and `"none"` through the public option rather than hiding internal time slots. The [API option](api.md#data-date-and-layout-options) and [accessibility semantics](../ACCESSIBILITY.md#interaction-model) own the observable contract; use public tokens for density.

## Choose month-grid layout

The defaults give all six weeks the intrinsic height required by the tallest
week and align each complete event/overflow stack to the top of the available
space below its date:

```ts
const calendar = createCalendar(host, {
	events,
	weekRowSizing: "equal",
	gridEventPlacement: "top"
});
```

In compact layout, `"equal"` also gives package-owned, normally visible
primary-event, count, and compact-primary overflow roots one common full slot;
later summaries exposed only on focus remain intrinsic. Choose `"content"` when
each week and its compact roots should follow intrinsic sizing. Choose `"center"`
or `"bottom"` when the complete event/overflow stack should use that alignment at
every width. Center and bottom safely fall back toward the top when the stack
cannot fit; the date remains top-aligned. Equal week rows may make the grid taller
because no content is clipped or constrained to a fixed height. Both options are
construction-time configuration, so recreate the calendar to change them.

## Choose event counts

Use `gridEventDisplay` when a single marker plus a small additional count hides
the significance of a busy day. Each width can make its own choice:

```js
const calendar = createCalendar(host, {
	events,
	gridEventDisplay: {
		compact: "count",
		wide: "count-when-multiple"
	}
});
```

| Mode | Empty day | One event | Multiple events |
| --- | --- | --- | --- |
| `"events"` | Nothing | Existing event representation | Summaries and overflow |
| `"count"` | Nothing | Total-count button | Total-count button |
| `"count-when-multiple"` | Nothing | Existing event representation | Total-count button |

The defaults are `compact: "count-when-multiple"` and `wide: "events"`.
Compact means the calendar container is at most `42rem` wide, including a
narrow calendar inside a wide application page. Container CSS chooses the
presentation; resizing neither refetches events nor reruns render hooks.

Counts include every loaded, normalized occurrence for the date, including
multi-day events. They are independent of `maxGridEventsPerDay`, agenda
pagination, and render-hook visual suppression. The grid cap still controls
individual summaries: `0` suppresses those summaries but does not hide a count.
Compact buttons show localized numbers; wide buttons show localized event
nouns. Accessible names always include the complete count and date.

**Upgrade note:** Busy compact days now show a total-count action by default.
To retain the earlier marker-and-additional-count presentation, set
`gridEventDisplay: { compact: "events" }`. Set both widths to `"count"` to show
total counts on every nonempty date, or both to `"count-when-multiple"` to keep
single-event actions at all sizes. Exact hook and focus behavior belongs in the
[API contract](api.md#handle-user-actions-calendaraction).

## Own the event chooser

Without a callback, activating a count or native overflow button selects that
date, resets agenda pagination, and focuses the agenda heading. It does not
invoke `onDaySelect`. This is sufficient when the selected-day agenda is your
event picker.

Use the same application dialog controller for individual events and complete
day lists when the application owns scheduling or details:

```js
const calendar = createCalendar(host, {
	events,
	gridEventDisplay: { compact: "count-when-multiple", wide: "count-when-multiple" },
	onEventActivate({ dateString, element, event, nativeEvent }) {
		nativeEvent.preventDefault();
		return eventDialog.open({ events: [event], dateString, invoker: element });
	},
	onEventOverflowActivate({ dateString, element, events, nativeEvent }) {
		nativeEvent.preventDefault();
		return eventDialog.open({ events, dateString, invoker: element });
	}
});
```

`eventDialog` is your application's dialog controller. The
[runnable remote-data example](../examples/remote-data/main.js) implements it
with a native `<dialog>`, accessible heading, event buttons, and Close action.
Its local choice is a demonstration; your application remains responsible for
authorization, saving, and [refreshing after a save](remote-data.md#3-change-filters-and-refresh).

Call `preventDefault()` synchronously, before any `await`. The callback runs
before day selection or DOM replacement; cancelling transfers interaction and
focus ownership to your application. Return promises so action failures can be
reported by the library. On dismissal, restore focus to a still-connected
invoker; if a refresh replaced it, use `calendar.focusDate(dateString)` as the
public fallback. Close application dialogs during permanent teardown.

The callback receives an immutable ordered array of normalized events for the
date. Metadata stays application-owned by reference. Do not infer the list from
visible summaries or a paged agenda, and use `dateString` for multi-day
occurrences instead of assuming `event.start` is the activated date.

## Application-owned cache and filters

For a provider without caching, use the [basic filtering and refresh recipe](remote-data.md#3-change-filters-and-refresh). Add a cache only when your application needs one; cache identity must include authorization scope, range, and all filters that change the response.

Key cached raw responses by the requested range and every authorization-relevant input. A filter change can reuse an already validated raw response and call `refetchEvents()` once; the source then returns the currently enabled categories.

Application cache rules should:

- Isolate entries by user and authorization context.
- Pass the current `AbortSignal` to cancellable uncached work.
- Never retain an aborted or rejected promise.
- Invalidate overlapping ranges after mutations.
- Preserve failures as failures instead of silently converting them to empty arrays.

## Replace event input without recreating

Use `setEvents()` when the complete event array or provider identity changes after render:

```ts
const calendar = createCalendar(host, {
	events: localEvents,
	initialDate: "2026-08-06"
});

calendar.render();
calendar.setEvents(remoteEvents);
```

Replacement is complete rather than additive. A static array or directly returned provider array commits before `setEvents()` returns; a PromiseLike replacement returns after its loading render and settles later. An immediate replacement supersedes pending async work and clears its busy state. Use `setEvents()` only for event-input replacement and recreate the instance for other configuration changes. The [canonical `setEvents()` contract](api.md#control-the-calendar-calendar) owns lifecycle admission, preserved state and focus, cancellation, retained data, Retry, and reentrancy.

## Toolbar content

Pass an existing host-descendant element through the supported option instead of cloning it or locating private package descendants:

```ts
const toolbarEnd = host.querySelector<HTMLElement>("[data-my-calendar-filters]");

const calendar = createCalendar(host, {
	events,
	...(toolbarEnd === null ? {} : { toolbarEnd })
});
```

The package temporarily mounts the same node while its state, names, labels, and listeners remain application-owned. Keep custom content flexible and keyboard operable. The [API integration-node contract](api.md#application-integration-options) owns mounting and release, [DESIGN.md](../DESIGN.md#responsive-model) owns composition, and the [accessibility guide](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) owns focus order. Do not interleave content through private selectors.

## Add metadata-driven visuals without private selectors

Render hooks must synchronously create a new, detached, same-document node for each invocation. Output is wholly noninteractive. Event representations are anchors when `url` is present, buttons when a callback action is available without a URL, and static otherwise. Map metadata through a finite application-owned palette instead of turning arbitrary values into classes or attributes:

### Create and register a hook set

```ts
import type { CalendarRenderHooks } from "@tryagaindev/litefold-calendar";

const EVENT_CLASS_BY_KIND = {
	appointment: "my-calendar-event--appointment",
	milestone: "my-calendar-event--milestone",
	task: "my-calendar-event--task"
} as const satisfies Readonly<Record<EventKind, string>>;

const MARKER_CLASS_BY_KIND = {
	appointment: "my-calendar-marker--appointment",
	milestone: "my-calendar-marker--milestone",
	task: null
} as const satisfies Readonly<Record<EventKind, string | null>>;

const applicationRenderHooks: CalendarRenderHooks<EventData> = {
	id: "my-calendar",
	renderEventOverflow(context) {
		const ownerDocument = context.document;
		if (context.variant === "compact") {
			//Keep locale-aware compact formatting while making a small text-only tweak.
			return ownerDocument.createTextNode(`${context.text}…`);
		}

		const content = ownerDocument.createElement("span");
		content.classList.add("my-calendar-overflow-content");

		const label = ownerDocument.createElement("strong");
		label.classList.add("my-calendar-overflow-label");
		label.textContent = context.text;
		content.append(label);
		return content;
	},
	renderEventMarker({ document: ownerDocument, event }) {
		const kind = event.metadata?.kind;
		const markerClass = kind === undefined ? null : MARKER_CLASS_BY_KIND[kind];
		if (markerClass === null) {
			return null;
		}

		const marker = ownerDocument.createElement("span");
		marker.classList.add("my-calendar-marker", markerClass);
		marker.setAttribute("aria-hidden", "true");
		return marker;
	},
	renderEventDetails({ document: ownerDocument, event }) {
		const label = event.metadata?.statusLabel;
		if (label === undefined) {
			return null;
		}

		const status = ownerDocument.createElement("span");
		status.textContent = label;
		return status;
	},
	eventDidMount({ dateString, elements, event, surface }) {
		const kind = event.metadata?.kind;
		if (kind === undefined) {
			return;
		}

		const eventClass = EVENT_CLASS_BY_KIND[kind];
		elements.root.classList.add("my-calendar-event", eventClass);
		elements.root.setAttribute("data-my-event-kind", kind);

		const action = elements.action;
		if (action !== null) {
			action.setAttribute("data-my-event-id", event.id);
			action.setAttribute("data-my-event-date", dateString);
			action.setAttribute("data-my-event-surface", surface);
		}

		return () => {
			elements.root.classList.remove("my-calendar-event", eventClass);
			elements.root.removeAttribute("data-my-event-kind");
			action?.removeAttribute("data-my-event-id");
			action?.removeAttribute("data-my-event-date");
			action?.removeAttribute("data-my-event-surface");
		};
	}
};
```

Pass the consumer-owned hook set through the visual option, independently of complete first-party extensions:

```ts
const calendar = createCalendar(host, {
	events,
	renderHooks: [applicationRenderHooks]
});
```

Use one owner for each singleton hook, `renderEventMarker` and
`renderEventOverflow`. Return new, detached, noninteractive nodes and style
only your application classes. In the overflow hook, use `context.text` for
the package-localized visual and inspect `display` (`"count"` or `"overflow"`)
and `variant` (`"compact"` or `"wide"`) when the design needs different content.
A total-count action always remains available, including when the hook returns
`null`.

The package owns the native action, accessible name, focus behavior, and
responsive placement. Fit compact content inside its assigned slot. Increase
`--lfc-control-min-size` and `--lfc-grid-event-min-block-size` together when the
custom content needs more room. Container resizing changes visibility without
rerunning hooks. The [render-hook API](api.md#customize-rendering-calendarrenderhooks)
owns context fields, return semantics, singleton rules, and failure behavior;
[DESIGN.md](../DESIGN.md#responsive-model) owns sizing and width transitions.

### Style hook output

Style the finite palette in application CSS, without inline styles or package-private selectors:

```css
.my-calendar-marker {
	display: inline-block;
	inline-size: 0.625rem;
	block-size: 0.625rem;
	border: 0.125rem solid currentColor;
	border-radius: 50%;
}

.my-calendar-marker--appointment {
	color: var(--my-appointment-color);
}

.my-calendar-marker--milestone {
	color: var(--my-milestone-color);
}

.my-calendar-event--task {
	font-style: italic;
}

.my-calendar-overflow-content {
	display: inline-flex;
	align-items: baseline;
}

.my-calendar-overflow-label {
	font-weight: 700;
}
```

### Restore focus with application selectors

Application-owned data attributes can support focus restoration without depending on generated package structure:

```ts
function findAgendaOccurrence(
	eventId: string,
	dateString: string
): CalendarEventActionElement | null {
	return host.querySelector<CalendarEventActionElement>(
		`[data-my-event-id="${CSS.escape(eventId)}"]` +
		`[data-my-event-date="${CSS.escape(dateString)}"]` +
		`[data-my-event-surface="agenda"]`
	);
}
```

Add the application-owned surface attribute from the render context when focus must return to one representation. This action lookup intentionally returns `null` for a static event. Render-hook code can use `CalendarEventElements.root` when it needs the representation regardless of interactivity.

### Handle lifecycle and failure

Use `context.signal` for signal-aware listeners or observers, and return synchronous cleanup from mount hooks. The application owns every class, attribute, node, style, listener, and asset that its hooks add.

If a hook set throws, returns an invalid or asynchronous result, or fails cleanup, Litefold Calendar quarantines that set and restores package defaults for its singleton slots. Core UI and other hook sets remain available. Style hook output only through application-owned classes; hooks add no public package selector, token, or message key. See the [canonical render-hook lifecycle](api.md#customize-rendering-calendarrenderhooks) for node release and cleanup details.

## Progressive fallback

Keep server-authored or otherwise application-owned fallback content DOM-disjoint from the host—normally as a sibling, with neither element containing the other—and pass its element to the calendar:

```ts
const fallbackElement = document.querySelector<HTMLElement>("[data-my-calendar-fallback]");

const calendar = createCalendar(host, {
	events,
	...(fallbackElement === null ? {} : { fallbackElement })
});
```

The application owns the fallback's content, authorization, freshness, canonical links, metadata, structured data, and privacy policy. With a direct array, the terminal fallback visibility decision completes before the initiating void method returns. A PromiseLike source leaves the fallback at its loading visibility while settlement is pending. The [API reference owns lease and visibility lifecycle](api.md#application-integration-options); [SEO and progressive enhancement](seo-and-progressive-enhancement.md) owns the server-content recipe and verification guidance.

## Actions and errors

Return action promises rather than detaching work:

```ts
const calendar = createCalendar(host, {
	events,
	isEventContextMenuAvailable({ event }) {
		return event.metadata?.kind === "appointment";
	},
	onEventActivate: async ({ dateString, element, event, nativeEvent, surface }) => {
		const metadata = event.metadata;
		if (metadata === undefined) {
			throw new Error("Expected event data.");
		}
		if (event.url !== null) {
			nativeEvent.preventDefault();
		}

		await actionController.open({
			actionId: metadata.actionId,
			invoker: element,
			occurrenceDate: dateString,
			surface
		});
	},
	onEventContextMenu: ({ clientX, clientY, dateString, element, event, surface }) => {
		return contextMenuController.open({
			eventId: event.id,
			invoker: element,
			occurrenceDate: dateString,
			surface,
			x: clientX,
			y: clientY
		});
	},
	onError(error) {
		applicationTelemetry.capture(error);
		return "default";
	}
});
```

Use the occurrence `dateString` rather than assuming `event.start`, and call `nativeEvent.preventDefault()` synchronously only when a linked event has a complete alternative action. Position keyboard-invoked context UI from the supplied element when coordinates are not meaningful.

The [action contract](api.md#handle-user-actions-calendaraction) owns callback shapes, representation, admission, concurrency, and failure behavior. The [error guide](errors.md) owns current versus diagnostic failures, `"default"` versus `"handled"` presentation, programmer errors, and recovery.

## Token bridge

Keep application token mapping outside the package and set overrides on the same host passed to `createCalendar()`. [DESIGN.md](../DESIGN.md) owns the canonical roles and defaults; the [Styling and customization](styling.md#apply-token-overrides) provides the single supported bridge example, cascade rules, and CSP implications.

Place the calendar in a host whose border box meets the [minimum supported design width](../DESIGN.md#responsive-model). Hosts below that floor receive best-effort graceful degradation only. Above it, allow the host to reflect its actual available width and leave exact responsive behavior to the design contract. Do not override private responsive or pager internals.

## Classic-script entry point

Litefold Calendar remains a pure ESM package. An application that cannot mark its entry script as a module can use a regular external script and load the package with standard dynamic `import()`:

```html
<link rel="stylesheet" href="/assets/litefold-calendar/styles.css">
<script defer src="./calendar-loader.js"></script>
```

```js
"use strict";

void import("/assets/litefold-calendar/index.js")
	.then(({ createCalendar }) => {
		//Create and render the calendar.
	})
	.catch((error) => {
		//Commit a persistent visible startup error, then report diagnostics.
	});
```

The loader has no static module syntax or module-script tag, but it still requires an ESM-capable evergreen browser. Do not use `nomodule`, present this as a legacy build, or expose the package through a mutable global.

Resolve the package path through the application's normal deployment process.
Copy the complete ESM output tree and stylesheet while preserving relative
module paths, serve JavaScript with the correct MIME type, and permit the
same-origin stylesheet, entry, and dependent modules under the application
Content Security Policy. The displayed URLs are illustrative application-owned
deployment paths, not package specifiers. See the runnable
[classic-script example](../examples/classic-script/) and the
[ECMA-262 `import()` contract](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-import-calls).

## Acceptance checks

An integration is ready when:

- Data adapters, authorization, range caching, filtering, and diagnostic handling remain application-owned and fail atomically.
- Event replacement, actions, toolbar content, render hooks, extensions, and fallback coordination use documented public surfaces without private selectors.
- Compact and wide `renderEventOverflow` customizations preserve canonical
  native-action behavior, use the package-supplied localized text and counts,
  stay within package-assigned blocks, and satisfy the
  [responsive design checks](../DESIGN.md#responsive-model) without rerunning
  the hook on resize.
- Lifecycle, validation, replacement, fallback, render-hook, and extension scenarios satisfy the [API reference](api.md) and failures satisfy the [error guide](errors.md).
- Keyboard, direct-input, RTL, zoom, forced-color, reduced-motion, localization, and screen-reader flows satisfy the [accessibility verification matrix](../ACCESSIBILITY.md#testing).
- Visual overrides satisfy [DESIGN.md](../DESIGN.md) and the [Styling and customization](styling.md), including affected screenshot evidence.
- No-JavaScript content and indexing policy satisfy the [progressive-enhancement verification](seo-and-progressive-enhancement.md#verify-progressive-behavior).
- Any WebMCP extension uses a stable unique prefix when calendars can share a document, preserves the normal UI when unsupported, exposes only authorized event summaries, and unregisters during teardown.
- A production install adds no transitive runtime dependency or remote asset.
