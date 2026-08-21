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
4. Set inclusive `minDate` / `maxDate` bounds when the product must limit calendar navigation or day activation.
5. Pass an existing native filter fieldset through `toolbarEnd` when needed.
6. Package visual decorations as one or more named extensions that return detached, noninteractive nodes.
7. Add validated event URLs where native navigation is the correct primary action; gate occurrence-specific context commands with `isEventContextMenuAvailable`.
8. Return promise-like results from `onEventActivate`, `onEventContextMenu`, `onDaySelect`, and `onDayContextMenu` so package error handling can observe failures.
9. Coordinate application-owned no-JavaScript markup with `fallbackElement` when progressive fallback is required.
10. Choose `eventTimeDisplay` only when visual time exposure should differ between grid and agenda; accessible time semantics remain on both surfaces.
11. Map application design tokens to documented `--lfc-*` tokens in application-owned CSS and let package container queries handle responsive placement.
12. Replace private-selector tests with public callbacks, state snapshots, roles/names, application-owned selectors, and user-visible behavior assertions.

## Typed source adapter

Event metadata is optional. A basic calendar needs no metadata interface and no generic argument. Use an application-defined type only when application data must remain available to actions or extensions; typed `events` let `createCalendar()` infer that type.

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

Build optional fields conditionally because the package uses `exactOptionalPropertyTypes`. Validate required values before returning the array. Event URLs must be relative or HTTP(S), no longer than 2,048 characters, and free of whitespace changes, control characters, and credentials; the package resolves them against the host document and validates the snapshot again. When adaptation runs inside an event provider, a thrown adapter error rejects the complete result and activates the package's safe error presentation; keep raw response details in trusted application diagnostics only.

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

The provider always receives the complete fixed 42-day grid for the committed displayed month. Configured `minDate` and `maxDate` bounds do not clip `start` or `end`; preserve the inclusive-start/exclusive-end query contract even when the first or last grid contains disabled days. A pager pull does not request or prefetch either adjacent range, so application caching must react only to provider calls rather than inferred gesture direction.

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

The title jump popover, Previous, Next, Today, pull/snap paging, grid keyboard commands, public navigation methods, and day activation all use the same bounds. Partial first and last months remain visible; days outside the range are unavailable. An explicit `initialDate` must be in range and renderable, while an omitted initial date resolves the configured current date to the nearest in-range date in a renderable month. Keep application-owned controls aligned by applying the same `min` and `max` values to any external date input that calls `gotoDate()` or `focusDate()`.

## Native pull/snap paging

`swipe` remains an optional boolean and defaults to `true`; no additional pager option or CSS token is exposed. The enabled route accepts touch, pen, and horizontal precision-scroll input, maps direction through inherited RTL, and commits at most one month after the native scroller settles. Mouse dragging is not synthesized. Vertical page scrolling and pinch zoom continue to belong to the browser.

The visible Previous/Next lanes are decorative and contain no adjacent grid or event data. The calendar keeps one interactive 42-day grid and one committed `CalendarState.range`; partial pulls do not call the source, run extensions for another month, or publish speculative state. Set `swipe: false` when the host context must disable horizontal gesture paging; native toolbar buttons, Page Up/Down, the picker, and public methods remain available.

Do not intercept and redispatch the calendar's touch, pointer, wheel, or scroll events, and do not query or mutate private scroll positions, snap points, or pager descendants. Browser and operating-system momentum, rubber-banding, overscroll, and snap timing vary by input stack and are not part of the package contract. Test semantic outcomes on supported devices instead: direction, one-month commit, bounds, focus/state retention, and return to the current snap point.

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

`"all"`, `"grid"`, `"agenda"`, and `"none"` affect visual exposure only. Every timed or all-day representation keeps its native `<time datetime>` element, accessible event name, and localized extension `timeText`. Use CSS tokens to adjust density; do not hide internal time slots with private selectors.

## Application-owned cache and filters

Key cached raw responses by the requested range and every authorization-relevant input. A filter change can reuse an already validated raw response and call `refetchEvents()` once; the source then returns the currently enabled categories.

Application cache rules should:

- Isolate entries by user and authorization context.
- Pass the current `AbortSignal` to cancellable uncached work.
- Never retain an aborted or rejected promise.
- Invalidate overlapping ranges after mutations.
- Preserve failures as failures instead of silently converting them to empty arrays.

## Toolbar content

Pass an existing host-descendant element through the supported option instead of cloning it or locating private package descendants:

```ts
const toolbarEnd = host.querySelector<HTMLElement>("[data-calendar-filters]");

const calendar = createCalendar(host, {
	events,
	...(toolbarEnd === null ? {} : { toolbarEnd })
});
```

The package temporarily moves the same node into its toolbar. State, names, labels, and listeners remain application-owned. `destroy()` detaches the unchanged node so it can be reinserted or passed to a replacement calendar instance.

The built-in DOM and focus sequence is Previous, Next, month title, then Today; `toolbarEnd` follows. At `42rem` and below, application content moves to a second row. At `20rem` and below, Previous/Next and title occupy the first built-in row, Today is on the second, and application content is on the third. Keep custom content flexible, keyboard operable, and valid at each width; do not use CSS `order` or private selectors to interleave it with built-in controls.

## Add metadata-driven visuals without private selectors

Render hooks must create a new, detached, same-document node for each invocation. Output is wholly noninteractive. Event representations are anchors when `url` is present, buttons when a callback action is available without a URL, and static otherwise. Map metadata through a finite application-owned palette instead of turning arbitrary values into classes or attributes:

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

The marker hook above replaces the built-in marker for appointments and milestones, and returns `null` to suppress it for tasks or missing metadata. At most one extension may define `renderEventMarker`; multiple owners are rejected during construction.

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

Use `context.signal` for signal-aware listeners or observers. A mount hook may return a synchronous cleanup. Application classes, attributes, nodes, styles, listeners, and assets remain the application's cleanup and Content Security Policy responsibility. If an extension fails, its nodes are removed and the extension is quarantined for that calendar instance while core UI remains available.

## Progressive fallback

Keep server-authored or otherwise application-owned fallback content outside the host and pass its element to the calendar:

```ts
const fallbackElement = document.querySelector<HTMLElement>("[data-calendar-fallback]");

const calendar = createCalendar(host, {
	events,
	...(fallbackElement === null ? {} : { fallbackElement })
});
```

The element must belong to the host document, stay outside the host, and be available for one calendar's exclusive lease. Construction and initial loading leave its current `hidden` state unchanged. The first usable snapshot hides it, including a successful empty snapshot. A degraded refresh with retained usable data keeps it hidden. When an unavailable or fatal state has no usable snapshot, the package restores the original state; a successful retry hides it again. Each write occurs only while the current value still matches the package's last observed or written value. If application code changes `hidden` during the lease, package writes are skipped while that value differs, and `destroy()` preserves the differing application value. If application code later restores the package's last value, normal package management can resume. `destroy()` always releases the lease and restores the original value only while the package still manages the current value. Invalid construction or a failed host claim leaves it untouched.

The application owns the fallback's content, authorization, freshness, canonical links, metadata, structured data, and privacy policy. See [SEO and progressive enhancement](seo-and-progressive-enhancement.md).

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

`dateString` is the represented occurrence date and `surface` is `"grid-summary"` or `"agenda"`. For a multi-day event, the occurrence date can differ from `event.start`, so use it for commands and focus restoration. Direct grid activation never selects its day. For a native anchor, call `nativeEvent.preventDefault()` synchronously only when the callback provides a complete alternative to navigation.

`isEventContextMenuAvailable` is a synchronous, per-occurrence predicate. It receives date, event, and surface but no DOM element or native event. A throw, non-boolean, or thenable fails closed and reports one recoverable `host-integration-failed` issue. When a linked event is ineligible, the package leaves the browser's native context menu untouched. An eligible non-link event with no `onEventActivate` callback remains a native button; because the context callback is its only application action, click, tap, Enter, or Space invokes `onEventContextMenu` as its primary action. A keyboard-generated click may supply zero coordinates, so position any application surface from the callback's `element` bounds when no meaningful pointer location is available.

`onError` observes current operational failures and diagnostic-only late or stale failures; it does not receive synchronous errors thrown for invalid public arguments or lifecycle ordering. Returning `"default"` preserves persistent package-owned presentation for a current error. Return the exact value `"handled"` only after the application has committed an equivalent visible and accessible error experience. A non-abort failure from a superseded request or action arrives with `stale: true` but does not enter state or produce package UI or announcements, so its disposition has no presentation to transfer. Validate user-controlled arguments and catch typed failures at the application command boundary as described in [Handle programmer errors](errors.md#handle-programmer-errors).

## Token bridge

Keep application token mapping outside the package:

```css
.litefold-calendar[data-application-calendar] {
	--lfc-font-family: var(--app-font-family, system-ui, sans-serif);
	--lfc-color: var(--app-body-color, #202124);
	--lfc-muted-color: var(--app-muted-color, #5F6368);
	--lfc-background: var(--app-page-background, #FFFFFF);
	--lfc-surface-background: var(--app-surface-background, #FFFFFF);
	--lfc-border-color: var(--app-border-color, #C7CBD1);
	--lfc-accent-color: var(--app-primary-color, #2457D6);
	--lfc-focus-ring-color: var(--app-focus-color, #123B92);
	--lfc-event-accent-width: 0.0625rem;
	--lfc-grid-event-font-size: 0.75em;
	--lfc-grid-event-min-block-size: 1.5rem;
	--lfc-compact-day-min-block-size: 3.75rem;
}
```

Place the application-owned `data-application-calendar` attribute on the same host passed to `createCalendar()`. The compound selector targets that rendered host directly, so its tokens override package defaults instead of relying on inheritance from an ancestor. The attribute is not package output; do not copy package-private selectors into application CSS.

The package owns its named inline-size container, CSS-only thresholds, and native paging viewport. Allow the host to reflect its actual available width; do not add viewport listeners, `ResizeObserver`, breakpoint-driven option changes, DOM movement, or private scroll styling. Container resizing changes presentation without refetching events, replacing owned nodes, or moving focus.

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

- Invalid records reject the complete snapshot instead of disappearing silently.
- Range caching and filtering remain application-owned and respect authorization boundaries.
- Toolbar content, extension output, and `onEventActivate` / `onEventContextMenu` / `onDaySelect` / `onDayContextMenu` actions use only documented hooks.
- Linked, callback-driven, context-eligible, and static events use the expected anchor/button/static representation on both grid and agenda surfaces.
- The selected `eventTimeDisplay` mode changes only visual time exposure; native time values, accessible names, and extension `timeText` remain present.
- F2 enters visible grid actions; Up/Down does not wrap; Escape/F2/Shift+Tab returns to the day; Tab exits toward the agenda; direct event activation does not select a day.
- Progressive fallback state is correct during initial load, empty success, retained refresh failure, unavailable/fatal failure, retry, application `hidden` mutation, and destroy.
- Configured bounds are mirrored by application-owned date inputs, while providers still accept each complete 42-day request.
- Touch, pen, and horizontal precision-scroll paging changes at most one month per settle, obeys RTL and bounds, keeps one interactive grid, and does not prefetch an adjacent range; Previous/Next remain usable with `swipe: false`.
- The month/year trigger, bounded fields, successful Jump, Cancel, Escape, light-dismiss, boundary controls, and trigger-focus return are verified in supported browsers.
- Current initial-load, retained-refresh, action, and extension failures use persistent package presentation once, or equivalent application presentation after an explicit `"handled"` return; superseded request/action and other post-lifecycle failures remain diagnostic-only.
- Mobile, keyboard, RTL, forced-color, reduced-motion, localization, and screen-reader flows are verified by the application.
- Container resizing changes CSS layout without source calls, callback state changes, node replacement, or focus loss; toolbar focus order remains Previous, Next, month title, Today, then application content at every breakpoint.
- Event markers and extension-owned visual satellites are not clipped, and empty event slots do not reserve visible gaps.
- No production or test code depends on private `.lfc-*` classes or `data-lfc-*` attributes.
- A production install adds no transitive runtime dependency or remote asset.
