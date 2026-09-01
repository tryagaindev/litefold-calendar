# Application integration guide

This guide shows how an existing web application can adopt Litefold Calendar while keeping application policy outside the package.

## Ownership boundary

Litefold Calendar owns:

- Civil-date parsing, interval placement, inclusive instance bounds, the one-current-range month grid, selected-day agenda, and navigation, including the native month/year jump popover.
- Loading, request cancellation, generation guards, default retry/error UI, managed grid/event focus, progressive fallback coordination, and native pull/snap paging.
- Generic event, action, consumer render-hook, opaque first-party extension, message, and documented `--lfc-*` token contracts.

The application owns:

- Networking, authentication, authorization, response validation, and diagnostic telemetry.
- Time-zone conversion performed before event strings cross the package boundary.
- Caching, cache invalidation, filtering, and data-freshness policy.
- Application identifiers, metadata, routes, dialogs, commands, design tokens, and per-event surface-color policy.
- Canonical pages, metadata, structured data, privacy, and no-JavaScript fallback content.

In copyable examples, `my-*` names are application-owned placeholders: DOM IDs and classes, `data-my-*` attributes, `--my-*` custom properties, `@layer my` or `my.*` layers, render-hook IDs, and WebMCP prefixes. Replace them consistently for your application. `.litefold-calendar`, `data-litefold-calendar`, and documented `--lfc-*` properties are public hooks owned by Litefold Calendar; generated `.lfc-*` and `data-lfc-*` identifiers remain private.

Do not add application-specific branches, URLs, entity rules, or selectors to the package core.

## Adoption sequence

Follow these phases in order and skip the optional ones that do not apply:

1. **Render the core calendar.** Install an exact prerelease, import `@tryagaindev/litefold-calendar/styles.css`, and pass a validated local event array.
2. **Connect application data.** Add a typed adapter and, when needed, an abort-aware provider with application-owned authorization, caching, and filters. Use `setEvents()` to replace the complete input and `refetchEvents()` to rerun the current input after external state changes.
3. **Apply product policy.** Configure inclusive date bounds, visual time exposure, toolbar content, native event links, and action callbacks.
4. **Add optional customization.** Use named render-hook sets for application-owned visuals and explicit extension subpaths for complete first-party components. Do not inspect or style private package descendants.
5. **Add progressive and visual integration.** Coordinate server-authored fallback markup with `fallbackElement`, then map application design tokens to documented `--lfc-*` tokens on the host.
6. **Verify public behavior.** Test state, callbacks, roles and names, application-owned selectors, failure recovery, responsive layout, and input methods instead of private `lfc-*` structure.

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

The package applies the event marker color field, `accentColor`, only to its built-in SVG marker. It does not tint the event summary or change its text, background, border, or event leading-rule color, and core rendering does not emit a `style` attribute. The [calendar anatomy and color guide](component-anatomy.md#three-color-roles-that-sound-similar) distinguishes this per-event field from the calendar-wide primary interface color and event leading-rule color. Use public tokens for application-wide styling and render-hook-owned classes for a finite event palette; use `renderEventMarker` for richer marker content.

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

The static import above remains in the application import graph even when `myWebMcpEnabled` is false at runtime. Builds that must remove WebMCP bytes should omit the subpath import through an application build-time branch, or dynamically import the extension before constructing the calendar. Litefold Calendar performs no runtime extension discovery. See [first-party extensions](first-party-extensions.md#bundle-and-import-behavior) for the exact bundle boundary.

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

The two singleton presentation hooks have distinct behavior:

| Hook | Hook omitted | `null` / `undefined` return | Returned node |
| --- | --- | --- | --- |
| `renderEventMarker` | Keeps the built-in marker | `null` suppresses it; `undefined` is invalid | Replaces the built-in marker |
| `renderEventOverflow` | Keeps the social-style compact number and localized wide text | `undefined` keeps that variant; `null` suppresses only a passive compact cue and otherwise keeps the native action's default | Replaces that variant's visual content |

Only one hook set can own each singleton hook. `renderEventOverflow` owns its compact and wide branches together and receives each applicable variant during the calendar render. When a native overflow action has both responsive presentations, both are pre-rendered before CSS chooses which one to expose. The compact branch has `variant: "compact"`, `surface: "day"`, and package-formatted social text such as `+1` when paired with a visible primary marker or an unsigned total when there is no marker. The wide branch has `variant: "wide"`, `surface: "grid-summary"`, and localized exact text such as `2 more`.

Both contexts expose `eventCount`, `visibleEventCount`, `overflowCount`, `text`, and stable `elements.root` / `elements.content` references. `elements.action` is `null` for a passive compact cue and is the package-owned overflow button for the wide branch or a compact-primary overflow action. Treat those elements as inspection and placement context rather than mutation targets; return the visual node. That button's accessible name, activation, focus transfer, and canonical fallback remain package-owned. Returned nodes must be new, detached, same-document, synchronous, and entirely noninteractive; the package treats them as presentational content.

The package owns the responsive placement and gives each compact visual an
assigned block. A markerless total uses one centered block, and
`maxGridEventsPerDay: 0` keeps the fallback inside one package-owned overflow
action. The hook replaces only visual content; no public overflow-layout
selector or CSS token overrides placement. Fit returned compact content within
its assigned slot to preserve equal sizing. If it needs more space, increase
`--lfc-control-min-size` and `--lfc-grid-event-min-block-size` on the calendar
root so normal package-owned roots grow together. Oversized output remains
unclipped but opts out of equal visual sizing. [DESIGN.md](../DESIGN.md#responsive-model)
owns the exact geometry and width transitions.

Container resizing changes CSS visibility only; it does not invoke the hook again or replace either returned node. A failure in either branch quarantines the complete hook set and restores both compact and wide defaults. See the [render-hook API](api.md#customize-rendering-calendarrenderhooks) for every context field and return rule.

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

Keep application token mapping outside the package and set overrides on the same host passed to `createCalendar()`. [DESIGN.md](../DESIGN.md) owns the canonical roles and defaults; the [CSS token contract](css-tokens.md#apply-token-overrides) provides the single supported bridge example, cascade rules, and CSP implications.

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
- Visual overrides satisfy [DESIGN.md](../DESIGN.md) and the [CSS token contract](css-tokens.md), including affected screenshot evidence.
- No-JavaScript content and indexing policy satisfy the [progressive-enhancement verification](seo-and-progressive-enhancement.md#verify-progressive-behavior).
- Any WebMCP extension uses a stable unique prefix when calendars can share a document, preserves the normal UI when unsupported, exposes only authorized event summaries, and unregisters during teardown.
- A production install adds no transitive runtime dependency or remote asset.
