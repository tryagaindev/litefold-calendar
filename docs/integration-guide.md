# Application integration guide

This guide shows how an existing web application can adopt litefold-calendar while keeping application policy outside the package.

## Ownership boundary

litefold-calendar owns:

- Civil-date parsing, interval placement, inclusive instance bounds, the one-current-range month grid, selected-day agenda, and navigation, including the native month/year jump popover.
- Loading, request cancellation, generation guards, default retry/error UI, managed grid/event focus, progressive fallback coordination, and native pull/snap paging.
- Generic event, action, extension, message, and documented `--lfc-*` token contracts.

The application owns:

- Networking, authentication, authorization, response validation, and diagnostic telemetry.
- Time-zone conversion performed before event strings cross the package boundary.
- Caching, cache invalidation, filtering, and data-freshness policy.
- Application identifiers, metadata, routes, dialogs, commands, design tokens, and per-event surface-color policy.
- Canonical pages, metadata, structured data, privacy, and no-JavaScript fallback content.

Custom attributes such as `data-calendar-filters` and `data-application-calendar` in this guide are application-owned integration selectors. Package output uses the public `data-litefold-calendar` root marker and private `data-lfc-*` attributes.

Do not add application-specific branches, URLs, entity rules, or selectors to the package core.

## Adoption sequence

1. Install an exact prerelease and import `@tryagaindev/litefold-calendar/styles.css` from the application entry point.
2. Adapt validated application data to `CalendarEventInput`; reject the complete snapshot if any item is malformed.
3. Pass local events directly; keep asynchronous transport and range caching in an application-owned event provider.
4. Use `setEvents()` when an existing rendered instance must receive a different complete static snapshot or provider; use `refetchEvents()` when only application-owned filter or cache state changed.
5. Set inclusive `minDate` / `maxDate` bounds when the product must limit calendar navigation or day activation.
6. Pass an existing native filter fieldset through `toolbarEnd` when needed.
7. Package visual decorations as one or more named extensions that return detached, same-document, noninteractive nodes; use the dedicated multiple-event and overflow-content hooks instead of inspecting package structure.
8. Add validated event URLs where native navigation is the correct primary action; gate occurrence-specific context commands with `isEventContextMenuAvailable`.
9. Return promise-like results from `onEventActivate`, `onEventContextMenu`, `onDaySelect`, and `onDayContextMenu` so package error handling can observe failures.
10. Coordinate application-owned no-JavaScript markup with `fallbackElement` when progressive fallback is required.
11. Choose `eventTimeDisplay` only when visual time exposure should differ between grid and agenda; accessible time semantics remain on both surfaces.
12. Map application design tokens to documented `--lfc-*` tokens in application-owned CSS and let package container queries handle responsive placement.
13. Replace private-selector tests with public callbacks, state snapshots, roles/names, application-owned selectors, and user-visible behavior assertions.

## Typed source adapter

Event metadata is optional. A basic calendar needs no metadata interface and no generic argument. Use an application-defined type only when application data must remain available to actions or extensions; typed `events` let `createCalendar()` infer that type and return `Calendar<TMetadata>`. The returned type keeps later `setEvents()` replacements on the same metadata contract as actions and extensions.

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

Build optional fields conditionally because the package uses `exactOptionalPropertyTypes`. Validate required values before returning the array. Event URLs must be relative or HTTP(S), free of whitespace changes, control characters, and credentials, and no longer than 2,048 UTF-16 code units both before and after resolution against the host document. The package validates the complete snapshot again; see the [canonical event input contract](api.md#define-events-calendareventinput-and-calendarevent). When adaptation runs inside an event provider, a thrown adapter error rejects the complete result and activates the package's safe error presentation; keep raw response details in trusted application diagnostics only.

An in-memory or already-cached source can return its array without artificial asynchronous work:

```ts
const localEvents: CalendarEvents<EventData> =
	applicationRecords.map(toCalendarInput);
```

This eager mapping runs before calendar construction, so the application must present and report any adapter failure as a startup error. Use a provider when package-owned source failure and Retry behavior should apply.

An asynchronous source may return any promise-like result. Forward the provided `signal` to cancellable work and reject on transport, authorization, response-validation, or adapter failure:

```ts
const remoteEvents: CalendarEventSource<EventData> = async ({ end, signal, start }) => {
	const records = await scheduleClient.loadRange({ end, signal, start });
	return records.map(toCalendarInput);
};
```

Treat the supplied provider range as authoritative rather than deriving requests from viewport or gesture state. The [event-source contract](api.md#supply-events-calendarevents-and-calendareventsource) owns exact invocation, range, cancellation, replacement, and commit behavior.

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

WebMCP is an optional document-wide integration, so assign each calendar a stable semantic prefix and keep the ordinary UI complete. The package treats an unavailable API as a progressive no-op. Drive the opt-in from application or server policy rather than browser detection; a server-rendered flag can map directly to the explicit `false` branch:

```ts
const webMcpEnabled = host.dataset.webMcpEnabled === "true";

const calendar = createCalendar(host, {
	events: remoteEvents,
	webMcp: webMcpEnabled
		? { toolNamePrefix: "team-schedule" }
		: false
});
```

Use role-based prefixes such as `my-schedule` and `public-calendar` when a page can host more than one calendar. Do not use array positions, counters, random values, tenant secrets, user identifiers, or localized labels. Tool names live in the document registry and are part of the application integration contract.

The two registered tools page through presentation-safe events in the currently loaded 42-day visible range or navigate through the existing public paths. `<prefix>-get-events` can cover the allowed range or filter one date; it never fetches to satisfy a read. Neither tool exposes IDs, URLs, metadata, extension nodes, raw errors, or application activation commands. The read tool does expose each returned title and raw normalized `start`, `end`, and `isAllDay` value even when `eventTimeDisplay` hides time visually, so apply the same signed-in authorization and privacy decision used for the visible calendar.

See the [WebMCP site-tool guide](webmcp.md) for exact tool schemas, lifecycle, compatibility, privacy, and testing. Do not build directly on `document.modelContext` when the calendar option covers the intended operation; package-owned registration keeps cleanup aligned with `destroy()`.

## Native pull/snap paging

Leave `swipe` enabled unless the host context must disable direct-input paging. Do not intercept package touch, pointer, wheel, or scroll events, and do not query or mutate private pager descendants. The [API option](api.md#data-date-and-layout-options) owns public behavior, the [accessibility guide](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) owns input and verification requirements, and [DESIGN.md](../DESIGN.md#pager-direction-and-motion) owns exact presentation.

### Accent conversion

Only one safe per-event accent crosses the public boundary:

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

The package applies `accentColor` only to its built-in SVG marker. It does not tint the event summary or change its text, background, border, or leading-accent colors, and core rendering does not emit a `style` attribute. Use public tokens for application-wide styling and extension-owned classes for a finite event palette; use `renderEventMarker` for richer marker content.

Dynamic event-surface colors remain an application concern. A trusted `eventDidMount` hook can place a previously validated color in an application-owned custom property on `elements.root`, but doing so creates inline style state and is incompatible with `style-src-attr 'none'`. Prefer finite extension-owned classes for strict-CSP integrations. Never copy unvalidated feed values into CSS, and keep text contrast, focus, forced-colors, and cleanup behavior application-owned.

## Choose visual time surfaces

The default exposes localized event times on both grid and agenda surfaces. Choose another visual combination without forking CSS or querying package structure:

```ts
const calendar = createCalendar(host, {
	events,
	eventTimeDisplay: "agenda"
});
```

Choose among `"all"`, `"grid"`, `"agenda"`, and `"none"` through the public option rather than hiding internal time slots. The [API option](api.md#data-date-and-layout-options) and [accessibility semantics](../ACCESSIBILITY.md#interaction-model) own the observable contract; use public tokens for density.

## Application-owned cache and filters

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

Replacement is complete rather than additive. Use `setEvents()` only for event-input replacement and recreate the instance for other configuration changes. The [canonical `setEvents()` contract](api.md#control-the-calendar-calendar) owns lifecycle admission, preserved state and focus, cancellation, retained data, Retry, and reentrancy.

## Toolbar content

Pass an existing host-descendant element through the supported option instead of cloning it or locating private package descendants:

```ts
const toolbarEnd = host.querySelector<HTMLElement>("[data-calendar-filters]");

const calendar = createCalendar(host, {
	events,
	...(toolbarEnd === null ? {} : { toolbarEnd })
});
```

The package temporarily mounts the same node while its state, names, labels, and listeners remain application-owned. Keep custom content flexible and keyboard operable. The [API integration-node contract](api.md#application-integration-options) owns mounting and release, [DESIGN.md](../DESIGN.md#responsive-model) owns composition, and the [accessibility guide](../ACCESSIBILITY.md#responsive-and-direct-input-behavior) owns focus order. Do not interleave content through private selectors.

## Add metadata-driven visuals without private selectors

Render hooks must synchronously create a new, detached, same-document node for each invocation. Output is wholly noninteractive. Event representations are anchors when `url` is present, buttons when a callback action is available without a URL, and static otherwise. Map metadata through a finite application-owned palette instead of turning arbitrary values into classes or attributes:

```ts
const EVENT_CLASS_BY_KIND = {
	appointment: "application-calendar-event--appointment",
	milestone: "application-calendar-event--milestone",
	task: "application-calendar-event--task"
} as const satisfies Readonly<Record<EventKind, string>>;

const MARKER_CLASS_BY_KIND = {
	appointment: "application-calendar-marker--appointment",
	milestone: "application-calendar-marker--milestone",
	task: null
} as const satisfies Readonly<Record<EventKind, string | null>>;

const applicationExtension: CalendarExtension<EventData> = {
	id: "application",
	renderMultipleEventIndicator({ document: ownerDocument, eventCount }) {
		const indicator = ownerDocument.createElement("span");
		indicator.classList.add("application-calendar-multiple-indicator");
		indicator.textContent = String(eventCount);
		return indicator;
	},
	renderGridOverflowContent({ document: ownerDocument, text }) {
		const content = ownerDocument.createElement("span");
		content.classList.add("application-calendar-overflow-content");
		content.textContent = text;
		return content;
	},
	renderEventMarker({ document: ownerDocument, event }) {
		const kind = event.metadata?.kind;
		const markerClass = kind === undefined ? null : MARKER_CLASS_BY_KIND[kind];
		if (markerClass === null) {
			return null;
		}

		const marker = ownerDocument.createElement("span");
		marker.classList.add("application-calendar-marker", markerClass);
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
		elements.root.classList.add("application-calendar-event", eventClass);
		elements.root.setAttribute("data-application-event-kind", kind);

		const action = elements.action;
		if (action !== null) {
			action.setAttribute("data-application-event-id", event.id);
			action.setAttribute("data-application-event-date", dateString);
			action.setAttribute("data-application-event-surface", surface);
		}

		return () => {
			elements.root.classList.remove("application-calendar-event", eventClass);
			elements.root.removeAttribute("data-application-event-kind");
			action?.removeAttribute("data-application-event-id");
			action?.removeAttribute("data-application-event-date");
			action?.removeAttribute("data-application-event-surface");
		};
	}
};
```

The marker hook above replaces the built-in marker for appointments and milestones, and returns `null` to suppress it for tasks or missing metadata. It remains independent of the day-level multiple-event indicator, so an application marker can keep its complete visual composition.

`renderMultipleEventIndicator` runs once for every in-range day with at least two total event occurrences, independent of `maxGridEventsPerDay`. Its context exposes `surface: "day"`, `date`, `dateString`, and the authoritative `eventCount`. Omitting the hook or returning `undefined` keeps the package's compact stacked-card cue; returning `null` suppresses it; returning a node replaces it. The package hides the cue above `42rem` and when the native overflow action is the compact-primary control.

`renderGridOverflowContent` runs whenever the native grid-overflow action exists. Its context exposes `surface: "grid-summary"`, `date`, `dateString`, total `eventCount`, `hiddenEventCount`, and the localized default `text`. A returned node supplies only the non-compact visual content. Omitting the hook or returning `null` / `undefined` retains the default. The custom slot is `aria-hidden`; the native button keeps one canonical localized text node, its accessible name, activation behavior, and agenda focus transfer. Compact-primary and focused overflow actions continue to show that canonical text.

Each of `renderEventMarker`, `renderMultipleEventIndicator`, and `renderGridOverflowContent` has independent singleton ownership; multiple owners of the same hook are rejected during construction. Crossing the `42rem` container boundary changes CSS visibility only, so it does not invoke hooks again, replace nodes, rerender, or measure width.

Style the finite palette in application CSS, without inline styles or package-private selectors:

```css
.application-calendar-marker {
	display: inline-block;
	inline-size: 0.625rem;
	block-size: 0.625rem;
	border: 0.125rem solid currentColor;
	border-radius: 50%;
}

.application-calendar-marker--appointment {
	color: var(--app-appointment-color);
}

.application-calendar-marker--milestone {
	color: var(--app-milestone-color);
}

.application-calendar-event--task {
	font-style: italic;
}
```

Application-owned data attributes can support focus restoration without depending on generated package structure:

```ts
function findAgendaOccurrence(
	eventId: string,
	dateString: string
): CalendarEventActionElement | null {
	return host.querySelector<CalendarEventActionElement>(
		`[data-application-event-id="${CSS.escape(eventId)}"]` +
		`[data-application-event-date="${CSS.escape(dateString)}"]` +
		`[data-application-event-surface="agenda"]`
	);
}
```

Add the application-owned surface attribute from the extension context when focus must return to one representation. This action lookup intentionally returns `null` for a static event. Extension code can use `CalendarEventElements.root` when it needs the representation regardless of interactivity.

Use `context.signal` for signal-aware listeners or observers. A mount hook may return a synchronous cleanup. Application classes, attributes, nodes, styles, listeners, and assets remain the application's cleanup and Content Security Policy responsibility. If an extension throws, returns an invalid or asynchronous result, or fails cleanup, package-mounted nodes are removed only while they remain under their expected package parent; application-reparented nodes are released and preserved. The extension is quarantined, singleton presentation slots return to package defaults, and core UI remains available. The new hooks expose no package selector, CSS token, or message key; style their output only through application-owned classes. See the [canonical extension lifecycle](api.md#extend-rendering-calendarextension).

## Progressive fallback

Keep server-authored or otherwise application-owned fallback content outside the host and pass its element to the calendar:

```ts
const fallbackElement = document.querySelector<HTMLElement>("[data-calendar-fallback]");

const calendar = createCalendar(host, {
	events,
	...(fallbackElement === null ? {} : { fallbackElement })
});
```

The application owns the fallback's content, authorization, freshness, canonical links, metadata, structured data, and privacy policy. The [API reference owns lease and visibility lifecycle](api.md#application-integration-options); [SEO and progressive enhancement](seo-and-progressive-enhancement.md) owns the server-content recipe and verification guidance.

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

Keep application token mapping outside the package and set overrides on the same host passed to `createCalendar()`. [DESIGN.md](../DESIGN.md) owns the canonical roles and defaults; the [CSS token contract](css-tokens.md#apply-token-overrides) provides the single supported bridge example, cascade rules, and CSP implications.

Allow the host to reflect its actual available width and leave exact responsive behavior to [DESIGN.md](../DESIGN.md#responsive-model). Do not override private responsive or pager internals.

## Classic-script entry point

litefold-calendar remains a pure ESM package. An application that cannot mark its entry script as a module can use a regular external script and load the package with standard dynamic `import()`:

```html
<script defer src="./calendar-loader.js"></script>
```

```js
"use strict";

void import("./assets/litefold-calendar/index.js")
	.then(({ createCalendar }) => {
		//Create and render the calendar.
	})
	.catch((error) => {
		//Commit a persistent visible startup error, then report diagnostics.
	});
```

The loader has no static module syntax or module-script tag, but it still requires an ESM-capable evergreen browser. Do not use `nomodule`, present this as a legacy build, or expose the package through a mutable global. Resolve the package path through the application's normal deployment process and serve it with a JavaScript MIME type under the application Content Security Policy. See the runnable [classic-script example](../examples/classic-script/) and the [ECMA-262 `import()` contract](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-import-calls).

## Acceptance checks

An integration is ready when:

- Data adapters, authorization, range caching, filtering, and diagnostic handling remain application-owned and fail atomically.
- Event replacement, actions, toolbar content, extensions, and fallback coordination use documented public hooks without private selectors.
- Multiple-event and grid-overflow customizations preserve canonical overflow text and native behavior, and container resizing changes only CSS visibility without rerunning their hooks.
- Lifecycle, validation, replacement, fallback, and extension scenarios satisfy the [API reference](api.md) and failures satisfy the [error guide](errors.md).
- Keyboard, direct-input, RTL, zoom, forced-color, reduced-motion, localization, and screen-reader flows satisfy the [accessibility verification matrix](../ACCESSIBILITY.md#testing).
- Visual overrides satisfy [DESIGN.md](../DESIGN.md) and the [CSS token contract](css-tokens.md), including affected screenshot evidence.
- No-JavaScript content and indexing policy satisfy the [progressive-enhancement verification](seo-and-progressive-enhancement.md#verify-progressive-behavior).
- Any WebMCP opt-in uses stable unique prefixes, preserves the normal UI when unsupported, exposes only authorized event summaries, and unregisters during teardown.
- A production install adds no transitive runtime dependency or remote asset.
