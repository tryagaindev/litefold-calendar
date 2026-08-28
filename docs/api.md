# Public API reference

This reference describes the public alpha surface declared by the package manifest.  Import runtime values and types from `@tryagaindev/litefold-calendar`; import CSS from `@tryagaindev/litefold-calendar/styles.css`.  No internal module is a supported entry point.  Before `1.0.0`, names or defaults may change when doing so materially improves developer experience; declarations, tests, documentation, migration guidance, examples, accessibility, and security contracts must change together.

Start with the [feature guide](features.md) to decide whether the focused month-and-agenda feature set fits your application. Use this page when writing or reviewing an integration.

## Choose a task

| Goal | Start here |
|---|---|
| Create, render, and tear down a calendar | [`createCalendar()`](#create-and-render-createcalendar) and [`Calendar`](#control-the-calendar-calendar) |
| Supply, replace, or reload local or remote events | [`CalendarEvents`](#supply-events-calendarevents-and-calendareventsource) and [`Calendar`](#control-the-calendar-calendar) |
| Validate dates and event occupancy | [`CalendarEventInput`](#define-events-calendareventinput-and-calendarevent) |
| Configure layout, localization, callbacks, and limits | [`CalendarOptions`](#configure-behavior-calendaroptions) |
| Expose bounded browser site tools | [WebMCP site tools](#webmcp-site-tools) |
| Handle day and event actions | [Action callbacks](#handle-user-actions-calendaraction) |
| Observe displayed month, selection, loading, and failures | [`CalendarState`](#observe-state-calendarstate) |
| Localize text or replace navigation icons | [Messages and icons](#customize-messages-and-icons) |
| Add trusted visual content | [`CalendarExtension`](#extend-rendering-calendarextension) |
| Handle and classify failures | [`LitefoldCalendarError`](#handle-failures-litefoldcalendarerror) |
| Find a complete runnable scenario | [Example coverage guide](../examples/) |

## Find a public export

The root module exports exactly the following symbols. Entries in the Types column are erased at runtime.

| Area | Runtime values | Types |
|---|---|---|
| Construction | `createCalendar` | `Calendar`, `CalendarOptions`, `CalendarEventTimeDisplay`, `CalendarWebMcpOptions` |
| Dates and events | — | `CalendarDate`, `CalendarDateInput`, `CalendarEvent`, `CalendarEventInput`, `CalendarEvents`, `CalendarEventSource`, `CalendarRange`, `CalendarRangeBounds` |
| Actions | — | `CalendarAction`, `CalendarDayContextMenu`, `CalendarDaySelection`, `CalendarEventActionElement`, `CalendarEventActivation`, `CalendarEventContextMenu`, `CalendarEventContextMenuAvailability`, `CalendarEventSurface` |
| State and announcements | — | `CalendarAnnouncement`, `CalendarIssue`, `CalendarPhase`, `CalendarState` |
| Localization and icons | — | `CalendarFirstDay`, `CalendarHeadingLevel`, `CalendarIconFactory`, `CalendarIcons`, `CalendarMessages` |
| Extensions | — | `CalendarDayElements`, `CalendarDayExtensionContext`, `CalendarEventElements`, `CalendarEventExtensionContext`, `CalendarExtension`, `CalendarExtensionCleanup`, `CalendarExtensionContext`, `CalendarGridOverflowContentContext`, `CalendarMultipleEventIndicatorContext`, `CalendarSurface` |
| Errors | `LitefoldCalendarError` | `CalendarErrorCode`, `CalendarErrorDisposition`, `CalendarErrorPhase`, `CalendarErrorSeverity`, `LitefoldCalendarErrorOptions` |

## Create and render: `createCalendar()`

```ts
function createCalendar<TMetadata = unknown>(
	host: HTMLElement,
	options: CalendarOptions<TMetadata>
): Calendar<TMetadata>;
```

`events` is the only required option. Pass an array for static data or a `CalendarEventSource` for range-aware data. `TMetadata` defaults to `unknown` and is normally inferred from typed events, an action, or an extension. A basic calendar needs no generic argument.

```ts
import { createCalendar, type CalendarEventInput } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";

const events = [
	{
		id: "release-window",
		title: "Release window",
		start: "2026-08-06"
	}
] satisfies readonly CalendarEventInput[];

const calendar = createCalendar(host, {
	events,
	initialDate: "2026-08-06"
});

calendar.render();
```

### Construction and host lifecycle

| Stage | Contract |
|---|---|
| Module import | Does not read `window` or `document`; the ESM entry is safe to evaluate during server rendering. |
| `createCalendar()` | Validates configuration, resolves package-owned defaults, and retains application callbacks, metadata, and nodes by reference. It does not claim or modify the host. |
| `render()` | Atomically claims a connected or detached host and its accepted integration nodes, replaces the host's children, adds `.litefold-calendar` and the presence-only `data-litefold-calendar` discovery marker, renders, and starts the first source request. An integration node that became leased, reparented, or otherwise unavailable after construction causes recoverable `invalid-state` without modifying the host. Detached rendering still creates DOM and starts source work; insert the host into its document before relying on focus, pointer, or visual layout behavior. |
| Active instance | Owns the host's children. Another live calendar cannot claim the same host. Mutating the original options object does not reconfigure the instance; use `setEvents()` to replace event input and recreate the calendar for other configuration changes. |
| `destroy()` | If rendered, aborts pending work, removes host listeners and generated content, conditionally restores package-managed `fallbackElement` visibility, detaches an eligible `toolbarEnd` node, removes the root markers, and leaves the owned host empty. Before render, it leaves unclaimed nodes unchanged. Destruction is terminal. |

Invalid construction input throws a synchronous `LitefoldCalendarError` with code `invalid-configuration`. This includes an invalid or reversed `minDate` / `maxDate` range, a range that intersects no renderable month, and an explicitly supplied `initialDate` that is outside the inclusive range or cannot render its month. When `initialDate` is omitted, the date produced by `now` instead resolves to the nearest in-range date in a renderable month. Because no usable instance exists after a construction failure, `onError` cannot observe it; catch it at the application bootstrap boundary when startup fallback UI is required.

The root class is the supported styling hook. The data attribute is a stable presence-only JavaScript discovery marker, has no value contract, and must not be used for styling. See the [CSS token contract](css-tokens.md).

## Control the calendar: `Calendar`

```ts
interface Calendar<TMetadata = unknown> {
	render(): void;
	destroy(): void;
	setEvents(events: CalendarEvents<TMetadata>): void;
	refetchEvents(): void;
	gotoDate(date: CalendarDateInput): void;
	focusDate(date: CalendarDateInput): void;
	focusToday(): void;
	prev(): void;
	next(): void;
	today(): void;
	getState(): Readonly<CalendarState>;
}
```

The [advanced TypeScript example](../examples/advanced/) exposes controls for every method. An exhaustive `Record<keyof Calendar, ...>` makes a future method addition fail example typechecking until it receives a scenario, and the example smoke test verifies the behavior.

| Method | Purpose and focus behavior | Lifecycle and failure behavior |
|---|---|---|
| `render()` | Renders once and starts the visible-range request. Repeated calls on a live rendered instance are no-ops; use `refetchEvents()` to reload. | A call after `destroy()`, competing ownership, or an unavailable integration node throws synchronously without claiming or changing the host. |
| `destroy()` | Releases package resources and clears a rendered, owned host. | Idempotent and terminal. A call before render leaves the unclaimed host unchanged. |
| `setEvents(events)` | Replaces the complete static snapshot or provider, then starts one load for the current visible range without recreating the instance. It preserves the displayed month, selected date, current agenda reveal count, and package-owned focus where the represented day or event still exists. | Requires a rendered, live instance. Lifecycle is checked before the argument. An invalid top-level value throws `invalid-argument` without changing or aborting current work; an accepted source or payload failure follows the operational-error flow and retains usable same-range data. |
| `refetchEvents()` | Revalidates the most recently accepted static snapshot or requests the current visible range from the most recently accepted provider again without a package cache. | Requires a rendered, live instance. A same-range failure retains the last usable snapshot. |
| `gotoDate(date)` | Displays the containing month and selects the date without explicitly moving DOM focus. | Accepts a `CalendarDate`, strict civil string, or valid `Date`; invalid or unrenderable values, and values outside the configured range, throw `invalid-argument` without changing state. |
| `focusDate(date)` | Displays, selects, and focuses the requested day button. | Uses the same validation, time-zone projection, and inclusive `minDate` / `maxDate` enforcement as `gotoDate()`. |
| `today()` | Displays and selects the date returned by `now` without explicitly moving DOM focus. | A later clock failure enters the fatal `internal-error` flow; navigation quietly stops when that date is outside the configured range or no supported destination is available. |
| `focusToday()` | Displays, selects, and focuses the date returned by `now`. | Requires a rendered, live instance and follows the same clock-failure and quiet configured-boundary behavior as `today()`. |
| `prev()` / `next()` | Moves one month while preserving the selected day-of-month where possible and clamping it to the target month and configured bounds where necessary. | Partial boundary months are reachable. Navigation quietly stops when the adjacent month contains no selectable date or cannot render a complete supported grid. |
| `getState()` | Returns the latest immutable, presentation-safe snapshot without raw causes. | Safe before render and after destroy; it does not mutate or refetch. |

Invalid configuration, public method arguments, and lifecycle calls are programmer errors and throw synchronous `LitefoldCalendarError` instances. Methods that require a live calendar throw `invalid-state` before `render()`, after `destroy()`, or after a fatal failure. These errors do not invoke `onError`, alter `CalendarState.issues`, or create user-facing package UI. Runtime source, validation, action, extension, host-callback, and internal failures continue through the observable operational-error pipeline.

`setEvents()` checks that lifecycle first, including before inspecting a hostile argument. On a rendered, non-destroyed instance—including an instance in a recoverable source-unavailable state—the method then requires an array or function and safely snapshots a static array. A top-level inspection or snapshot failure throws synchronous `invalid-argument` without aborting an active request, changing the current source or state, or invoking `onError`.

Once a replacement passes that top-level check, it becomes the current source before its load starts. The replacement clears an active pull transaction, aborts superseded source work, and uses the normal generation guards so late success, failure, validation, announcement, and render work cannot commit. A provider rejection or invalid returned payload keeps the replacement current for Retry and `refetchEvents()`; it does not restore the prior provider. Usable data for the same range stays rendered with the normal degraded-data presentation.

Replacement rendering preserves the displayed month and selected date. Package-owned focus returns to the same day or event occurrence when possible, and a removed focused event falls back to its owning day; focus outside the calendar is not moved. The current agenda reveal count is retained, capped by the replacement result and `agendaDomLimit`, so new events are not revealed beyond the count the user already requested. If application callbacks call `setEvents()` reentrantly, every accepted call supersedes earlier work and the last accepted source wins; invalid reentrant input leaves the active accepted source unchanged.

### Built-in month-and-year jump

The configured `h1` through `h6` month heading contains a native button showing the localized displayed month and year. Activating it with pointer, Enter, or Space opens a package-owned `popover="auto"` with dialog semantics, synchronizes its fields, and focuses the localized month `<select>`. The form pairs that select with a required numeric year input whose limits follow the configured bounds; changing the year dynamically disables months that do not intersect the range. A successful Jump navigates to the requested allowed month, preserves the selected day where possible, and clamps it to the target month's length and the nearest inclusive configured bound. Submitting the already displayed month is a no-op, and a month Jump never invokes `onDaySelect`. Invalid native form input keeps the popover open for correction. Cancel makes no date change. Successful Jump, Cancel, and Escape close the popover and restore focus to the month-title trigger; pointer light-dismiss does not move focus.

The picker, day buttons, Previous, Next, Today, native pull/snap pager, and Page Up/Down keyboard navigation all use the same configured bounds. Dates outside the bounds remain present when required by the fixed 42-day layout but their native day buttons are disabled. Previous, Next, and Today remain in the Tab order and expose `aria-disabled="true"` when they have no permitted destination; their handlers are guarded no-ops in that state. Other package-owned interaction quietly stops or clamps at a boundary. Only an out-of-range application call to `gotoDate()` or `focusDate()` throws.

## Supply events: `CalendarEvents` and `CalendarEventSource`

```ts
interface CalendarRangeBounds {
	readonly start: string;
	readonly end: string;
}

interface CalendarRange extends CalendarRangeBounds {
	readonly signal: AbortSignal;
}

type CalendarEventSource<TMetadata = unknown> = (
	this: void,
	range: Readonly<CalendarRange>
) => readonly CalendarEventInput<TMetadata>[] |
	PromiseLike<readonly CalendarEventInput<TMetadata>[]>;

type CalendarEvents<TMetadata = unknown> =
	readonly CalendarEventInput<TMetadata>[] |
	CalendarEventSource<TMetadata>;
```

Pass an array directly for static data. Use a provider when data depends on the visible range; the provider may return an array immediately or a promise-like result:

```ts
const staticEvents: CalendarEvents = localEvents;

const remoteSource: CalendarEventSource = async ({ end, signal, start }) => {
	const url = new URL("/api/calendar", location.origin);
	url.searchParams.set("start", start);
	url.searchParams.set("end", end);

	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Calendar request failed with ${response.status.toString()}.`);
	}

	return validateCalendarResponse(await response.json());
};
```

Use either form through the same option:

```ts
createCalendar(host, { events: staticEvents });
createCalendar(host, { events: remoteSource });
```

After rendering, replace the complete input through the typed instance. Replacement is not an add or merge operation:

```ts
const calendar = createCalendar(host, { events: staticEvents });
calendar.render();

calendar.setEvents(remoteSource);
```

Provider bounds are strict date-only strings. `start` is inclusive and `end` is exclusive. A committed visible month always requests its complete fixed 42-day grid, including adjacent-month filler days. The pull/snap pager retains that one current grid and does not render an adjacent month grid or request or prefetch its event range while the user pulls. `minDate` and `maxDate` limit selection and navigation but never clip the committed provider range, including in a partial boundary month.

Every committed visible-range transition and `refetchEvents()` invocation calls the current provider; a partial pager pull does not. `setEvents()` accepts a replacement source and starts exactly one current-range load. A static array is snapshotted when accepted, then reused and revalidated. litefold-calendar does not cache. Forward `signal` to cancellable work and stop non-fetch work when it aborts. A newer request, accepted replacement, or `destroy()` aborts the previous request, and a stale result never replaces the current snapshot.

The complete returned array is validated atomically. A non-array result, malformed event, duplicate ID, or result beyond `sourceEventLimit` rejects the entire snapshot. A synchronous throw or rejected promise-like result becomes an `event-source-failed` or validation error. Preserve failures as failures rather than converting them to an empty array, because an empty array means a successful range with no events.

## Define events: `CalendarEventInput` and `CalendarEvent`

```ts
interface CalendarEventInput<TMetadata = unknown> {
	readonly id: string;
	readonly title: string;
	readonly start: string;
	readonly end?: string;
	readonly accentColor?: string;
	readonly metadata?: TMetadata;
	readonly url?: string;
}

interface CalendarEvent<TMetadata = unknown> {
	readonly id: string;
	readonly title: string;
	readonly start: string;
	readonly end: string | null;
	readonly isAllDay: boolean;
	readonly accentColor: string | null;
	readonly metadata: TMetadata | undefined;
	readonly url: string | null;
}

interface CalendarDate {
	readonly day: number;
	readonly month: number;
	readonly year: number;
}

type CalendarDateInput = Date | string | Readonly<CalendarDate>;

```

`CalendarEventInput` is the provider shape. `CalendarEvent` is the frozen normalized shape received by actions and extensions. `CalendarDate` uses a one-based month. `CalendarDateInput` is accepted by `minDate`, `maxDate`, `initialDate`, `gotoDate()`, and `focusDate()`. Its string form accepts the same strict date or local date-time grammar as event fields, uses only the civil date portion, and is never time-zone-projected; only `Date` instants are projected.

Metadata is optional and opaque. The package preserves it by reference without inspecting, serializing, or copying it into DOM attributes. Treat callback metadata as potentially absent unless the source adapter establishes a stronger application invariant.

Event IDs must contain a non-whitespace character, remain at most 256 UTF-16 code units, and be unique within one returned snapshot. IDs are preserved without trimming. Titles are trimmed and must then contain 1 through 1,024 UTF-16 code units.

`accentColor` accepts exactly an opaque six-digit hexadecimal color (`#RRGGBB`, case-insensitive input) and normalizes it to uppercase. An invalid value becomes `null` rather than invalidating the event. It colors only the built-in SVG marker; it does not tint an event summary or choose event text, background, or border colors. Core rendering does not emit a `style` attribute. Use `renderEventMarker` when metadata-driven visual treatment needs more than the built-in marker, and keep that application-owned output compatible with the application Content Security Policy.

`url` is optional. It must be unchanged by trimming, contain no control character or credentials, and resolve against the host document to a relative or HTTP(S) destination. Both the supplied string and the resolved destination must be no longer than 2,048 UTF-16 code units. Empty, malformed, unsupported-scheme, credential-bearing, control-character, trim-altered, or oversized values reject the complete snapshot. A normalized event exposes the validated relative reference unchanged, a canonical absolute HTTP(S) string, or `null`; the native anchor resolves a relative reference in the host document.

### Accepted civil values

The parser accepts only:

```text
YYYY-MM-DD
YYYY-MM-DDTHH:mm
YYYY-MM-DDTHH:mm:ss
YYYY-MM-DDTHH:mm:ss.f through YYYY-MM-DDTHH:mm:ss.fffffff
```

- Gregorian years are `0001` through `9999`, and every field must form a real date or time.
- Hours are `00` through `23`; minutes and seconds are `00` through `59`.
- Whitespace, `Z`, UTC offsets, IANA annotations, a time without minutes, leap seconds, and `24:00` are rejected.
- A date-only start is all-day. A date-time start is timed.
- An explicit end must use the same date-only/date-time kind as start and must be later than start.
- End is exclusive. An all-day event without end occupies one day. A timed event without end is a zero-duration point at start.
- A timed event ending exactly at midnight does not occupy the end date; any later wall time does.

Event strings are civil values, not instants. `timeZone` never reinterprets them. `Date` values supplied through `minDate`, `maxDate`, `initialDate`, navigation methods, or `now()` are instants projected into the configured `timeZone`; without one, their device-local calendar fields are used. A `CalendarDate` object is already a civil date and is never time-zone projected. Prefer a strict string or `CalendarDate` when the caller intends an exact civil date.

The accepted event syntax spans years `0001` through `9999`, but a displayed month must admit its complete 42-day grid and exclusive request end. December 9999 is not renderable. January 0001 is renderable only when the resolved first day is Monday, so the grid does not cross into year 0000.

The date-only/date-time kinds, default durations, and exclusive-end model follow [RFC 5545 VEVENT](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6.1). String shape is a narrower profile of the [WHATWG date/time microsyntaxes](https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#dates-and-times), with one extension allowing four through seven fractional-second digits. Locale and time-zone projection use [ECMA-402](https://tc39.es/ecma402/).

## Configure behavior: `CalendarOptions`

```ts
interface CalendarOptions<TMetadata = unknown> {
	readonly events: CalendarEvents<TMetadata>;
	readonly minDate?: CalendarDateInput;
	readonly maxDate?: CalendarDateInput;
	readonly initialDate?: CalendarDateInput;
	readonly locale?: string;
	readonly timeZone?: string;
	readonly firstDay?: CalendarFirstDay;
	readonly headingLevel?: CalendarHeadingLevel;
	readonly now?: (this: void) => Date;
	readonly sourceEventLimit?: number;
	readonly maxGridEventsPerDay?: number;
	readonly eventTimeDisplay?: CalendarEventTimeDisplay;
	readonly agendaPageSize?: number;
	readonly agendaDomLimit?: number;
	readonly messages?: Readonly<Partial<CalendarMessages>>;
	readonly icons?: Readonly<Partial<CalendarIcons>>;
	readonly toolbarEnd?: HTMLElement;
	readonly fallbackElement?: HTMLElement;
	readonly swipe?: boolean;
	readonly webMcp?: false | Readonly<CalendarWebMcpOptions>;
	readonly onEventActivate?: CalendarAction<CalendarEventActivation<TMetadata>>;
	readonly isEventContextMenuAvailable?: (
		this: void,
		context: Readonly<CalendarEventContextMenuAvailability<TMetadata>>
	) => boolean;
	readonly onEventContextMenu?: CalendarAction<CalendarEventContextMenu<TMetadata>>;
	readonly onDaySelect?: CalendarAction<CalendarDaySelection>;
	readonly onDayContextMenu?: CalendarAction<CalendarDayContextMenu>;
	readonly extensions?: readonly Readonly<CalendarExtension<TMetadata>>[];
	readonly onError?: (
		this: void,
		error: LitefoldCalendarError
	) => void | CalendarErrorDisposition;
	readonly onAnnounce?: (
		this: void,
		announcement: Readonly<CalendarAnnouncement>
	) => void;
	readonly onStateChange?: (
		this: void,
		state: Readonly<CalendarState>
	) => void;
}

interface CalendarWebMcpOptions {
	readonly toolNamePrefix: string;
}

type CalendarFirstDay = "locale" | 0 | 1 | 2 | 3 | 4 | 5 | 6;
type CalendarHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type CalendarEventTimeDisplay = "all" | "grid" | "agenda" | "none";
```

The options snapshot is immutable for the life of an instance. `setEvents()` is the one narrow replacement API; mutating `options.events` or the original options object has no effect. Recreate the calendar to change locale, time zone, date bounds, callbacks, extensions, messages, icons, limits, integration nodes, or other construction-time configuration. External filter or cache state may change independently; call `refetchEvents()` after changing it. Unknown own string keys on the top-level options object, `messages`, `icons`, or an extension definition are rejected as `invalid-configuration`, so misspelled configuration does not fail silently.

Every public callback and factory declares `this: void`. Use an arrow function or a function that does not depend on a dynamic receiver.

The [advanced TypeScript example](../examples/advanced/) supplies every option. Its exhaustive `CalendarOptions` map and behavioral smoke checks prevent a new option from silently lacking example coverage; failure and recovery scenarios are kept in the [async errors example](../examples/async-errors/).

### Data, date, and layout options

| Option | Default | Purpose and lifecycle | Invalid or failed behavior |
|---|---|---|---|
| `events` | Required | Sets the initial static events or abort-aware provider for the one current fixed 42-day grid. Providers run for initial load, each committed displayed-month change, and each explicit refetch; a partial pager pull makes no adjacent-range call. Replace the complete input after render with `setEvents()`. | Invalid construction input is `invalid-configuration`. Provider and snapshot failures use the visible source-error flow; invalid top-level `setEvents()` input is `invalid-argument`. |
| `minDate` | No configured lower bound | Sets the earliest selectable date, inclusive. A boundary may fall within a month; earlier grid dates remain visible but disabled. `Date` values use the configured time-zone projection. | An invalid or unprojectable value, or a value later than `maxDate`, is `invalid-configuration`. Absolute supported-date and complete-grid renderability limits still apply. |
| `maxDate` | No configured upper bound | Sets the latest selectable date, inclusive. A boundary may fall within a month; later grid dates remain visible but disabled. `Date` values use the configured time-zone projection. | An invalid or unprojectable value, or a value earlier than `minDate`, is `invalid-configuration`. Absolute supported-date and complete-grid renderability limits still apply. |
| `initialDate` | Nearest in-range date in a renderable month, starting from `now` | Selects the initial day and displayed month from a `CalendarDate`, strict string, or `Date` without moving DOM focus. | An invalid, unprojectable, or unrenderable explicit value, or an explicit value outside the configured inclusive range, is `invalid-configuration`. |
| `locale` | Browser-resolved locale | Controls `Intl` month, short/narrow weekday, full accessible date, and time labels. | An empty or invalid BCP 47 language tag is `invalid-configuration`. |
| `timeZone` | None; `Date` inputs use device-local fields | Projects supplied `Date` instants into an IANA zone. It never changes event strings. | An empty or invalid zone identifier is `invalid-configuration`. |
| `firstDay` | `"locale"` | Uses the locale week convention from either the platform's `Intl.Locale#getWeekInfo()` method or `Intl.Locale#weekInfo` accessor, or accepts explicit `0 = Sunday` through `6 = Saturday`. | Any other value is `invalid-configuration`; locale mode falls back to Sunday when neither platform form yields a valid `firstDay`. |
| `headingLevel` | `2` | Chooses the native `h1` through `h6` month-title level. Its native title button opens the built-in month-and-year popover. The agenda, popover, and status-panel headings use the next level, capped at `h6`. | A non-integer or value outside `1` through `6` is `invalid-configuration`. |
| `now` | `() => new Date()` | Supplies the current instant during construction, every grid render, and Today actions. It may run more than once during one public operation, so keep it synchronous and free of observable side effects. | A construction-time throw/invalid date is `invalid-configuration`; a later failure enters fatal `internal-error`. |
| `sourceEventLimit` | `10,000` | Caps one complete source snapshot. Allowed range: `1` through `10,000`. | An invalid setting is `invalid-configuration`; an oversized result is `event-limit-exceeded`. |
| `maxGridEventsPerDay` | `3` | Caps direct event representations in a day cell. Allowed range: `0` through `10`; `0` suppresses individual representations while retaining the accessible day count, agenda events, and native overflow action. Compact presentation follows the [responsive design](../DESIGN.md#responsive-model); the first actionable event remains named and later actions remain available when focused. | An invalid setting is `invalid-configuration`. |
| `eventTimeDisplay` | `"all"` | Controls where localized event times are visually exposed: `"all"`, `"grid"`, `"agenda"`, or `"none"`. A time hidden from a surface remains a native `<time datetime>` value with visually hidden text, remains part of the event's accessible name, and remains available as `CalendarEventExtensionContext.timeText`. All-day labels follow the same surface policy. | Any other value is `invalid-configuration`; the diagnostic identifies `eventTimeDisplay`. |
| `agendaPageSize` | `50` | Controls how many agenda rows each Show more action reveals. Allowed range: `10` through `100`. | An invalid setting is `invalid-configuration`. |
| `agendaDomLimit` | `200` | Caps agenda events retained in the DOM. Allowed range: `50` through `500`; persistent text reports hidden overflow. | An invalid setting is `invalid-configuration`. |
| `swipe` | `true` | Enables an RTL-aware native pull/snap route for touch, pen, and horizontal precision scrolling. Device-to-scroll mapping, qualifying settle thresholds, and physics belong to the browser and operating system; a settled route commits at most one month. Decorative lanes never load an adjacent grid or event range, and native navigation remains available. | A non-boolean value is `invalid-configuration`. |

### Application integration options

| Option | Default | Purpose and lifecycle | Invalid or failed behavior |
|---|---|---|---|
| `messages` | Immutable English messages | Partially replaces package-owned labels, errors, and announcements. | A non-object, unknown own string key, supported key with a non-string or whitespace-only value, or unsupported complete `{token}` placeholder is `invalid-configuration`. |
| `icons` | Text previous/next icons | Partially replaces decorative navigation content through document-aware factories. | An unknown own string key, invalid factory, factory throw, or reused, interactive, parented, cross-document, or otherwise invalid factory result is `invalid-configuration` during construction. If an accepted icon node becomes leased, reparented, or otherwise unavailable before `render()` claims it, `render()` throws recoverable `invalid-state`. |
| `toolbarEnd` | No custom toolbar element | Moves one detached or host-descendant, same-document `HTMLElement` after the built-in controls in DOM and focus order. The application retains its state and listeners. | A structurally invalid, cross-document, or externally parented element is `invalid-configuration` during construction. If an accepted element becomes leased, reparented, or otherwise unavailable before `render()` claims it, `render()` throws recoverable `invalid-state`. `destroy()` detaches an unchanged eligible element; the application owns reinsertion. |
| `fallbackElement` | No fallback element | Exclusively leases a same-document element outside the host, records its original `hidden` state, and coordinates that property without overwriting an application mutation; see the lifecycle below. | A structurally invalid, cross-document, or host-descendant element is `invalid-configuration` during construction. An element that is already leased or otherwise unavailable when `render()` claims integration nodes produces `invalid-state`. Both failures leave it untouched. |
| `webMcp` | `false` | Explicitly registers `<prefix>-get-events` and `<prefix>-navigate` through the host document's experimental WebMCP API while the instance is rendered. Omission and `false` disable the integration; an unavailable API is a progressive no-op. `toolNamePrefix` is 1 through 117 ASCII letters, digits, `_`, `.`, or `-`, keeping each derived tool name within WebMCP's 128-character limit. | A malformed object, unknown own string key, or invalid prefix is synchronous `invalid-configuration`. A runtime registration rejection is diagnostic-only `host-integration-failed` with hook `webMcp`; it leaves `CalendarState` and the ordinary UI unchanged. |
| `onEventActivate` | No callback action | Handles native anchor/button activation on `"grid-summary"` and `"agenda"`; may return `void` or `PromiseLike<void>`. A linked event remains an anchor regardless. | A throw or rejection becomes `action-failed`. A callback may synchronously prevent a link's default navigation. |
| `isEventContextMenuAvailable` | Every occurrence is eligible when `onEventContextMenu` exists; otherwise none are | Synchronously narrows context-action availability per occurrence and surface. It receives date, event, and surface only. | A throw, non-boolean, or thenable fails closed and reports one recoverable `host-integration-failed` issue per calendar instance. |
| `onEventContextMenu` | No event context action | Handles right-click, Context Menu, or Shift+F10 on eligible grid/agenda event actions. For an eligible non-link event with no `onEventActivate`, it also handles click, tap, Enter, or Space as the native button's only primary action. | A throw or rejection becomes `action-failed`. No long-press is synthesized; an ineligible link retains the native browser menu. |
| `onDaySelect` | No day action | Provides a non-cancellable notification after pointer or keyboard selection updates the selected day and agenda. | A throw or rejection becomes `action-failed`; selection remains committed. |
| `onDayContextMenu` | No context action | Handles right-click, Context Menu, or Shift+F10 day gestures. | A throw or rejection becomes `action-failed`. No long-press gesture is synthesized. |
| `extensions` | Empty array | Runs ordered, named, node-based render and mount hooks for each replacement render. One extension may independently own each of `renderEventMarker`, `renderMultipleEventIndicator`, and `renderGridOverflowContent`. | Unknown own string keys, invalid definitions, duplicate IDs, or multiple owners of a singleton hook are `invalid-configuration`; a runtime extension failure quarantines that extension and produces `extension-failed`. |
| `onError` | Package presentation plus global reporting when needed | Synchronously observes current operational errors and diagnostic-only late or stale failures. The exact value `"handled"` transfers presentation ownership only for a current error accepted into state. | A throw preserves current package UI and globally reports both failures. A thenable cannot claim ownership and is observed. |
| `onAnnounce` | Package-owned live regions | Synchronously hands announcements to an application-owned live region. It does not transfer visible-error ownership. | A throw or thenable becomes `host-integration-failed`; the original message falls back to the internal live region. |
| `onStateChange` | No state observer | Synchronously observes immutable state after transitions. | A throw or thenable becomes `host-integration-failed` without recursively invoking the failed observer. |

Toolbar layout is container-driven and never changes sequential focus order: Previous, Next, month title, and Today, then `toolbarEnd`. The [responsive design](../DESIGN.md#responsive-model) owns the row composition. The title keeps one canonical full localized DOM string and accessible name; compact visual labels are `aria-hidden` and use a complete locale-formatted abbreviated month and year.

`fallbackElement` stays unchanged through construction and initial loading. The first usable snapshot hides it, including a successful empty snapshot. A degraded refresh with retained usable data keeps it hidden. An unavailable or fatal state with no usable snapshot restores its original `hidden` state; retry success hides it again. Before each write, the package requires the current value to match its last observed or written value. If application code changes `hidden`, package writes are skipped while that value differs, and `destroy()` preserves the differing application value. If application code later restores the package's last value, normal package management can resume. `destroy()` always releases the lease and restores the original value only when the package still manages the current value.

## WebMCP site tools

`webMcp` is an explicit, construction-time integration. Supply `{ toolNamePrefix }` to opt in; omission and `false` disable it, and `true` is not accepted. A successfully rendered instance registers the read-only `<prefix>-get-events` tool and the navigating `<prefix>-navigate` tool through `document.modelContext`. The option is immutable after construction, so recreate the calendar to change or disable an accepted prefix.

The package never reads the deprecated navigator-scoped predecessor, never registers automatically, and preserves the complete normal calendar when the API is absent. See the canonical [WebMCP site-tool contract](webmcp.md) for the two tools, result and error envelopes, lifecycle, privacy boundary, compatibility matrix, and testing guidance. The experimental browser API is not part of the package's general browser-support baseline.

## Handle user actions: `CalendarAction`

```ts
type CalendarAction<TContext> = (
	this: void,
	context: Readonly<TContext>
) => void | PromiseLike<void>;

type CalendarEventActionElement = HTMLAnchorElement | HTMLButtonElement;
type CalendarEventSurface = "grid-summary" | "agenda";

interface CalendarEventActivation<TMetadata = unknown> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly element: CalendarEventActionElement;
	readonly event: CalendarEvent<TMetadata>;
	readonly nativeEvent: MouseEvent;
	readonly surface: CalendarEventSurface;
}

interface CalendarEventContextMenuAvailability<TMetadata = unknown> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly event: CalendarEvent<TMetadata>;
	readonly surface: CalendarEventSurface;
}

interface CalendarEventContextMenu<TMetadata = unknown>
	extends Omit<CalendarEventActivation<TMetadata>, "nativeEvent"> {
	readonly clientX: number;
	readonly clientY: number;
	readonly nativeEvent: MouseEvent | KeyboardEvent;
}

interface CalendarDaySelection {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly element: HTMLButtonElement;
	readonly nativeEvent: MouseEvent;
}

interface CalendarDayContextMenu
	extends Omit<CalendarDaySelection, "nativeEvent"> {
	readonly clientX: number;
	readonly clientY: number;
	readonly nativeEvent: MouseEvent | KeyboardEvent;
}
```

Return the action promise so litefold-calendar can observe completion and rejection. Detached work cannot be associated with its originating action and can create unhandled failures.

The same rendering matrix applies to grid and agenda occurrences:

| Event state | Element |
|---|---|
| Validated `url` present | Native anchor; `onEventActivate` may synchronously call `nativeEvent.preventDefault()` |
| No URL, but activation or an eligible context action exists | Native button |
| No URL or available action | Static representation; `CalendarEventElements.action` is `null` |

The selected-day agenda is a native `<ol>` whose event representations are `<li>` descendants. Day-number and event-time values use `<time datetime>`; extension element types expose those nodes as `HTMLTimeElement`.

`isEventContextMenuAvailable` is called synchronously for each occurrence/surface. It fails closed on a throw, non-boolean, or thenable and reports one recoverable integration issue. For an ineligible anchor, the package does not intercept the native browser context menu.

| User gesture | Option | Notes |
|---|---|---|
| Click or tap a day; Enter or Space on a focused day | `onDaySelect` | The selected-day agenda is updated before the action runs; returning or throwing does not cancel selection. |
| Click an event action with an activation callback; Enter or Space | `onEventActivate` | `element` is the native anchor/button and `surface` identifies grid or agenda. Direct event activation never selects a day or calls `onDaySelect`. |
| Right-click a day; Context Menu or Shift+F10 | `onDayContextMenu` | Coordinates are viewport-relative and suitable for positioning an application-owned context surface. |
| Right-click an eligible event; Context Menu or Shift+F10 | `onEventContextMenu` | Includes the normalized event, represented occurrence date, surface, action element, native event, and viewport-relative coordinates. |
| Click or tap an eligible non-link event with no activation callback; Enter or Space | `onEventContextMenu` | Context-only events remain native buttons. Primary activation invokes their only application action and supplies the resulting click event and coordinates. |

Keyboard-generated primary clicks may report zero viewport coordinates. When positioning an application-owned surface for a context-only button, fall back to the supplied `element`'s bounding rectangle rather than assuming `clientX` and `clientY` identify a pointer location.

Day selection commits and rerenders before `onDaySelect` runs. Its `element` is the new live selected-day button in the replacement DOM; `nativeEvent` is the original activation event, whose target and current target may be the detached button that received the gesture. Do not assume `element === nativeEvent.currentTarget`. When motion is allowed, direct activation of a different day in the displayed month may begin presentation-only selection feedback after that commit; it never delays the callback. Reduced motion and every other selection path paint the settled state immediately.

Within the grid, exactly one day proxy has `tabindex="0"`; event and overflow actions remain `-1`. The pager viewport is programmatically focusable only, and its decorative lanes are `aria-hidden` and noninteractive, so Tab continues from the toolbar into the managed grid rather than into paging chrome. F2 enters the current cell's first visible action. Up/Down moves without wrapping; Escape or F2 returns to the day. Tab exits forward toward the agenda, while Shift+Tab returns to the day proxy. Focus restoration identifies an occurrence by surface, date, and event ID rather than retaining a replaced node. Stale or detached elements cannot invoke actions.

The native overflow action uses visible `gridMore` text and the localized `gridMoreLabel` date/count name. Activating it selects the represented date, resets the agenda expansion, and focuses the agenda heading without invoking `onDaySelect`.

## Observe state: `CalendarState`

```ts
type CalendarPhase =
	| "idle"
	| "loading"
	| "ready"
	| "degraded"
	| "unavailable"
	| "destroyed";

interface CalendarState {
	readonly displayedMonth: Readonly<CalendarDate>;
	readonly issues: readonly Readonly<CalendarIssue>[];
	readonly phase: CalendarPhase;
	readonly range: Readonly<CalendarRangeBounds> | null;
	readonly selectedDate: Readonly<CalendarDate>;
}

interface CalendarAnnouncement {
	readonly message: string;
	readonly politeness: "polite" | "assertive";
}
```

| Phase | Meaning |
|---|---|
| `idle` | Constructed but not rendered. |
| `loading` | Waiting for the current source request; a retained snapshot may still be visible. |
| `ready` | The current range has a usable snapshot and no active issues. |
| `degraded` | Usable content remains, but a refresh, extension, action, or integration issue is active. |
| `unavailable` | The current range has no usable snapshot or a fatal failure prevents normal rendering. |
| `destroyed` | The terminal post-destroy state. |

State objects, dates, and issue arrays are frozen. `displayedMonth` is the first day of the month shown by the one current grid, while `selectedDate` owns the visible agenda and always remains within the configured inclusive bounds. `range` contains the inclusive-start/exclusive-end bounds of that complete committed 42-day source range, even when some grid days fall outside `minDate` or `maxDate`; pager lanes never create speculative state or ranges. It is `null` before render and after destroy. Issues contain only bounded, localized, presentation-safe data; they never expose raw causes, stack traces, URLs, response payloads, metadata, extension IDs, or hook names.

Use `getState()` for pull-based inspection and `onStateChange` for synchronous observation. Use `onAnnounce` only when the application already owns a centralized live announcer. Neither callback should perform asynchronous handoff before returning.

## Customize messages and icons

```ts
interface CalendarIcons {
	readonly next: CalendarIconFactory;
	readonly previous: CalendarIconFactory;
}

type CalendarIconFactory = (this: void, document: Document) => Node;
```

Each icon factory receives the host's `Document` and must return distinct, detached, appendable, same-document, wholly noninteractive content. Icons are decorative; the native buttons retain localized accessible names.

`CalendarMessages` contains the following required keys. Supply a partial object through `CalendarOptions.messages`; omitted keys retain their English defaults.

| Key | English default | Supported placeholders |
|---|---|---|
| `actionErrorMessage` | `The action could not be completed. Try again.` | — |
| `actionErrorTitle` | `Action failed` | — |
| `agendaEmpty` | `No events` | — |
| `agendaMore` | `Show {count} more` | `{count}` |
| `agendaProgress` | `Showing {visible} of {total} events` | `{visible}`, `{total}` |
| `agendaTitle` | `Events for {date}` | `{date}` |
| `allDay` | `All day` | — |
| `cancel` | `Cancel` | — |
| `chooseMonthYear` | `Choose month and year, currently {date}` | `{date}` |
| `dayLabel` | `{date}, {count} {eventLabel}` | `{date}`, `{count}`, `{eventLabel}` |
| `event` | `event` | — |
| `events` | `events` | — |
| `extensionErrorMessage` | `Some calendar details could not be displayed.` | — |
| `extensionErrorTitle` | `Some details are unavailable` | — |
| `gridEventInstructions` | `Use arrow keys to move between dates and Enter or Space to select. Press F2 on a date to move to its visible event actions; use Up and Down Arrow between actions, and Escape or F2 to return.` | — |
| `gridMore` | `{count} more` | `{count}` |
| `gridMoreLabel` | `View {count} more {eventLabel} for {date}` | `{count}`, `{eventLabel}`, `{date}` |
| `internalErrorMessage` | `The calendar encountered an unexpected error.` | — |
| `internalErrorTitle` | `Calendar unavailable` | — |
| `jump` | `Jump` | — |
| `jumpToMonthYear` | `Jump to month and year` | — |
| `loadErrorMessage` | `Events could not be loaded. Try again.` | — |
| `loadErrorTitle` | `Calendar unavailable` | — |
| `month` | `Month` | — |
| `navigation` | `Calendar navigation` | — |
| `next` | `Next month` | — |
| `previous` | `Previous month` | — |
| `recovered` | `Calendar updated` | — |
| `refreshErrorMessage` | `The displayed events may be out of date. Try again.` | — |
| `refreshErrorTitle` | `Calendar may be out of date` | — |
| `retry` | `Retry` | — |
| `retrying` | `Retrying` | — |
| `today` | `Today` | — |
| `year` | `Year` | — |

Every supplied message must be a string containing at least one non-whitespace character. Any complete `{token}` placeholder must be listed for that key; an unsupported placeholder is rejected as `invalid-configuration` rather than rendered literally. Only the placeholders shown above are substituted. In particular, `agendaTitle` and `chooseMonthYear` accept only `{date}`; the singular/plural event noun supplies `{eventLabel}` in `dayLabel` and `gridMoreLabel`. `gridMore` remains visible text, while `gridMoreLabel` names the native action with its date and hidden count. Rendered values remain text, not HTML. Override `event` and `events` together, and test long translations; the package does not download locale data or apply language-specific plural rules.

<a id="extensions"></a>

## Extend rendering: `CalendarExtension`

```ts
type CalendarEventSurface = "grid-summary" | "agenda";
type CalendarSurface = "day" | CalendarEventSurface;
type CalendarExtensionCleanup = (this: void) => void;

interface CalendarExtensionContext<
	TSurface extends CalendarSurface = CalendarSurface
> {
	readonly document: Document;
	readonly signal: AbortSignal;
	readonly surface: TSurface;
}

interface CalendarDayElements {
	readonly badge: HTMLElement;
	readonly button: HTMLButtonElement;
	readonly cell: HTMLElement;
	readonly number: HTMLTimeElement;
	readonly summaries: HTMLElement;
}

interface CalendarDayExtensionContext extends CalendarExtensionContext<"day"> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly elements: CalendarDayElements;
	readonly isCurrentMonth: boolean;
	readonly isSelected: boolean;
	readonly isToday: boolean;
}

interface CalendarMultipleEventIndicatorContext
	extends CalendarExtensionContext<"day"> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly eventCount: number;
}

interface CalendarGridOverflowContentContext
	extends CalendarExtensionContext<"grid-summary"> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly eventCount: number;
	readonly hiddenEventCount: number;
	readonly text: string;
}

interface CalendarEventElements {
	readonly action: CalendarEventActionElement | null;
	readonly details: HTMLElement;
	readonly leading: HTMLElement;
	readonly marker: HTMLElement;
	readonly root: HTMLElement;
	readonly time: HTMLTimeElement;
	readonly title: HTMLElement;
	readonly trailing: HTMLElement;
}

interface CalendarEventExtensionContext<TMetadata = unknown>
	extends CalendarExtensionContext<"grid-summary" | "agenda"> {
	readonly date: CalendarDate;
	readonly dateString: string;
	readonly elements: CalendarEventElements;
	readonly event: CalendarEvent<TMetadata>;
	readonly timeText: string;
}

interface CalendarExtension<TMetadata = unknown> {
	readonly id: string;
	readonly renderDayBadge?: (
		this: void,
		context: Readonly<CalendarDayExtensionContext>
	) => Node | null | undefined;
	readonly renderMultipleEventIndicator?: (
		this: void,
		context: Readonly<CalendarMultipleEventIndicatorContext>
	) => Node | null | undefined;
	readonly renderGridOverflowContent?: (
		this: void,
		context: Readonly<CalendarGridOverflowContentContext>
	) => Node | null | undefined;
	readonly renderEventLeading?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
	readonly renderEventMarker?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null;
	readonly renderEventDetails?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
	readonly renderEventTrailing?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => Node | null | undefined;
	readonly dayDidMount?: (
		this: void,
		context: Readonly<CalendarDayExtensionContext>
	) => void | CalendarExtensionCleanup;
	readonly eventDidMount?: (
		this: void,
		context: Readonly<CalendarEventExtensionContext<TMetadata>>
	) => void | CalendarExtensionCleanup;
}
```

Extensions run in array order. Each ID must be a string containing at least one non-whitespace character and must be unique. IDs are preserved exactly, so leading or trailing whitespace remains significant for identity. `renderEventMarker`, `renderMultipleEventIndicator`, and `renderGridOverflowContent` each have independent singleton ownership because each targets one package-owned presentation slot. Multiple owners of any one singleton hook are rejected during construction. One extension may own more than one singleton hook.

`renderEventMarker` returns a new `Node` to replace the built-in marker or `null` to suppress it. `renderMultipleEventIndicator` runs once for each in-range day containing at least two total event occurrences, independent of `maxGridEventsPerDay`. Its frozen context has `surface: "day"` and an authoritative `eventCount`. With no owner or an `undefined` result, the package uses its compact stacked-card cue; `null` suppresses that cue; a `Node` replaces it. The cue remains decorative and does not replace, wrap, or rerun `renderEventMarker`.

`renderGridOverflowContent` runs whenever the native grid-overflow action exists. Its frozen context has `surface: "grid-summary"`, the total `eventCount`, the `hiddenEventCount`, and `text`, the localized default produced from `gridMore`. A returned `Node` replaces only the action's non-compact visual content. With no owner or a `null` / `undefined` result, the localized default remains. The native button, accessible name, activation behavior, agenda focus transfer, and one canonical localized text node remain package-owned. Custom content is `aria-hidden` and visible only above the `42rem` container threshold; compact-primary and focused overflow actions show the canonical text.

Day mount and badge hooks still inspect every structural cell in the fixed grid, including cells whose out-of-range day button is already disabled; they must not make that day interactive. The multiple-event indicator hook is narrower and never runs for out-of-range cells, zero-event days, or one-event days. Container-boundary changes are CSS-only: they do not rerun either new hook, rerender the calendar, measure width, or replace returned nodes.

The [advanced TypeScript example](../examples/advanced/) implements every extension hook, including mount cleanup and marker replacement or suppression. Its `renderDayBadge` scenario deliberately returns `null`, keeping fixture day cells limited to dates and actual event data. The exhaustive `CalendarExtension` map and smoke assertions make hook additions visible during development.

Every returned node must be detached, appendable, belong to `context.document`, be uniquely owned by that hook invocation, and contain no interactive content. Arrays, strings, connected or parented nodes, cross-document nodes, raw HTML, interactive descendants, and reused nodes are rejected. This contract applies equally to the two new decorative-content hooks.

The day-badge and multiple-event indicator slots are decorative and hidden from the accessibility tree. `CalendarEventElements.action` is the native anchor/button for an actionable grid or agenda representation and `null` for a static representation; `CalendarEventElements.root` is always the owned representation root. `CalendarEventElements.marker` is the owned marker container whether it contains the default marker, extension content, or no marker. Day `number` and event `time` slots are native `HTMLTimeElement` values. `eventTimeDisplay` changes only whether an event time is visually exposed on a surface: the time element, `datetime`, accessible event name, and localized `timeText` remain available. Use `surface` to distinguish behavior and application-owned styling without private selectors. These hooks add no public selector, CSS token, or message key; style custom nodes through application-owned classes.

Render hooks, mount hooks, and cleanup functions are synchronous. A mount hook may return one cleanup function. Cleanups run before replacement renders; on quarantine or destroy, `signal` aborts before cleanup. Every mount registration receives its own cleanup call, and every cleanup is attempted if another throws. On replacement cleanup, quarantine, or destroy, a returned node is removed only while it remains under the package parent that received it. If application code reparents the node, the package releases its lease and preserves it.

An extension that throws, returns an invalid node, returns a thenable, or fails cleanup is quarantined for that instance. Its still-package-mounted nodes are removed under the cleanup rule above, package defaults are restored for singleton presentation slots, later extensions still run, and the calendar presents a partial-render warning unless `onError` explicitly transfers ownership. Recreate the calendar to retry a quarantined extension.

## Handle failures: `LitefoldCalendarError`

```ts
type CalendarErrorDisposition = "default" | "handled";

type CalendarErrorCode =
	| "invalid-configuration"
	| "invalid-argument"
	| "invalid-state"
	| "event-source-failed"
	| "event-data-invalid"
	| "event-limit-exceeded"
	| "extension-failed"
	| "action-failed"
	| "host-integration-failed"
	| "internal-error";

type CalendarErrorPhase =
	| "configuration"
	| "argument"
	| "state"
	| "source"
	| "validation"
	| "extension"
	| "action"
	| "integration"
	| "render"
	| "destroy";

type CalendarErrorSeverity = "warning" | "error" | "fatal";

interface CalendarIssue {
	readonly code: CalendarErrorCode;
	readonly message: string;
	readonly recoverable: boolean;
	readonly severity: CalendarErrorSeverity;
	readonly title: string;
}

interface LitefoldCalendarErrorOptions {
	readonly cause?: unknown;
	readonly code: CalendarErrorCode;
	readonly eventIndex?: number;
	readonly extensionId?: string;
	readonly hook?: string;
	readonly message: string;
	readonly phase: CalendarErrorPhase;
	readonly range?: CalendarRangeBounds;
	readonly recoverable: boolean;
	readonly severity: CalendarErrorSeverity;
	readonly stale?: boolean;
	readonly surface?: CalendarSurface;
	readonly userMessage: string;
	readonly userTitle: string;
}

class LitefoldCalendarError extends Error {
	readonly code: CalendarErrorCode;
	readonly eventIndex: number | undefined;
	readonly extensionId: string | undefined;
	readonly hook: string | undefined;
	readonly phase: CalendarErrorPhase;
	readonly range: Readonly<CalendarRangeBounds> | undefined;
	readonly recoverable: boolean;
	readonly severity: CalendarErrorSeverity;
	readonly stale: boolean;
	readonly surface: CalendarSurface | undefined;
	readonly userMessage: string;
	readonly userTitle: string;

	constructor(options: Readonly<LitefoldCalendarErrorOptions>);
}
```

Its inherited `cause`, diagnostic `message`, stack, hook, and extension identifier are trusted developer data. Never copy them into user-visible output. `CalendarIssue` is the bounded presentation-safe state form. `recoverable` means the instance may remain usable or recover after a later valid operation; it does not promise built-in Retry UI. A non-abort failure from a superseded request or action is delivered with `stale: true` for diagnostics only; it does not enter `CalendarState.issues`, alter the current view, or produce package UI or announcements. Other failures delivered after their lifecycle can no longer accept presentation are likewise diagnostic-only without necessarily being marked stale.

Catch construction and public method calls at application boundaries when invalid input or lifecycle ordering is possible. `onError` observes operational failures after a live calendar begins work; it is not a substitute for handling thrown programmer errors.

For a current operational error accepted into state, returning `"default"` or `undefined` from `onError` preserves package UI. Return `"handled"` only after the application has synchronously committed equivalent visible and accessible presentation. A stale diagnostic has no package presentation to transfer, regardless of the callback's return value. See [Error handling](errors.md) for failure behavior, Retry semantics, global reporting, and application ownership requirements.

## Avoid common integration mistakes

- Use `onEventActivate`, `onEventContextMenu`, `onDaySelect`, and `onDayContextMenu`; these are the action option names.
- Pass an in-memory event array directly through `events`. Use a provider only when data depends on the requested range or external state, and add `async` only when it actually awaits work.
- Treat provider `end` bounds and event ends as exclusive, but `minDate` and `maxDate` as inclusive selectable dates. Do not subtract a day before querying or add a day to returned events.
- Do not put `Z`, offsets, or zone annotations in event strings. Convert application instants to intended civil values before adapting them.
- Forward `CalendarRange.signal` to fetch and other cancellable work. Never cache an aborted or rejected promise.
- Cache only requested committed ranges; do not infer or depend on adjacent-month prefetch from a partial pager pull.
- Reject malformed application data before returning it. One invalid item rejects the complete package snapshot; silently dropping it hides upstream defects.
- Do not expect `timeZone` to reinterpret event strings. It projects only supplied `Date` instants.
- Treat `url` as validated navigation, `onEventActivate` as an optional action on either surface, and `isEventContextMenuAvailable` as a synchronous per-occurrence gate. Do not select a day in response to direct grid event activation.
- Use `CalendarEventElements.action` and the `surface` discriminator. Do not assume every event is a button or query private DOM to distinguish grid from agenda.
- Preserve the managed grid: F2 enters event actions, Up/Down stays within the cell without wrapping, and Escape/F2/Shift+Tab returns to the day proxy.
- Treat native pager physics as browser/OS behavior and keep Previous/Next available; do not script private pull lanes, snap positions, or horizontal scroll state.
- Style through `.litefold-calendar` and documented `--lfc-*` tokens. Do not style with `data-litefold-calendar` or depend on private `.lfc-*` / `data-lfc-*` output.
- Return new detached nodes from extension render hooks. Do not return HTML strings, connected nodes, interactive descendants, reused nodes, or promises.
- Let only one extension define each singleton hook: `renderEventMarker`, `renderMultipleEventIndicator`, and `renderGridOverflowContent`. Use each hook's documented `null` / `undefined` fallback semantics rather than querying or replacing private package structure.
- Return action promises, but keep `onError`, `onAnnounce`, `onStateChange`, extension render/mount hooks, and cleanup functions synchronous.
- Do not return `"handled"` for a current error merely because telemetry recorded it; that value transfers presentation ownership.
- Do not mutate the options object and expect reconfiguration. Use `setEvents()` for a complete event-input replacement, `refetchEvents()` after application-owned filter or cache changes, and recreation for locale, time zone, bounds, or other construction-time configuration.
- Treat the host as package-owned while rendered. Keep dialogs and unrelated application UI outside it, and call `destroy()` before removing a transient calendar.
- Keep `fallbackElement` in the same document and outside the host. If application code changes its `hidden` state during the lease, the calendar skips writes while that value differs from its last write and does not restore over the differing value on destroy.
- Do not call navigation, `setEvents()`, or refetch methods before `render()` or after `destroy()`; those calls throw `invalid-state` synchronously before their arguments are inspected.
