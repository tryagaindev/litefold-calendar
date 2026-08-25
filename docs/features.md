# Features and alpha scope

This guide is the quickest way to determine whether litefold-calendar fits a project. It maps common calendar terms to the public API and states what the alpha deliberately does not provide.

## Feature map

| Capability | What litefold-calendar provides | Public API |
|---|---|---|
| Month view / day grid | One responsive current fixed six-week Gregorian grid with adjacent-month filler dates; no adjacent pager grid or prefetch | `createCalendar()`, `render()` |
| Selected-day agenda / event list | A semantic ordered list directly below the grid at every width; rows page up to the configured DOM limit, persistent progress reports visible and total counts, and each retained event is a native link, button, or static representation according to its URL and available actions | `agendaPageSize`, `agendaDomLimit`, `onDaySelect`, `onEventActivate`, `onEventContextMenu` |
| All-day events | Date-only starts, one-day default duration, and exclusive ends | `CalendarEventInput.start`, `CalendarEventInput.end` |
| Timed and point events | Local date-time starts; an omitted end creates a zero-duration point | `CalendarEventInput.start`, `CalendarEventInput.end` |
| Event-time presentation | Localized times can be visually exposed on both surfaces, grid only, agenda only, or neither while native time semantics and accessible names remain intact | `eventTimeDisplay`, `CalendarEventTimeDisplay` |
| Multi-day events | One event can occupy every overlapping civil day according to its exclusive end | `CalendarEventInput` |
| Grid event actions and overflow | Configurable direct event actions, a localized native overflow action, agenda paging, a DOM cap, and persistent `Showing X of Y` text | `maxGridEventsPerDay`, `gridMoreLabel`, `agendaPageSize`, `agendaDomLimit` |
| Safe event links | Relative and HTTP(S) URLs become native anchors on grid and agenda surfaces after atomic validation | `CalendarEventInput.url`, `CalendarEvent.url` |
| Static and fetched events | One initial option accepts an event array or an abort-aware provider that returns an array or promise-like result | `events`, `CalendarEvents`, `CalendarEventSource` |
| Replace event input | A rendered instance can replace its complete static snapshot or provider without changing month, selection, or construction-time configuration | `Calendar<TMetadata>.setEvents()` |
| Custom event data | Optional opaque metadata, inferred from a typed source and preserved by the generic calendar instance for replacements, actions, and extensions | `CalendarEventInput<TMetadata>.metadata`, `Calendar<TMetadata>` |
| Refetch events | The current range can be requested again from the latest accepted source; same-range failures retain the last usable snapshot | `refetchEvents()` |
| Date navigation | Previous, Next, and Today controls, a native month/year jump popover, an optional one-month pull/snap route, and methods to navigate, select, and focus dates | `prev()`, `next()`, `today()`, `gotoDate()`, `focusDate()`, `focusToday()`, `swipe` |
| Calendar bounds | Optional per-instance inclusive date limits shared by controls, keyboard, pager, focus, activation, methods, and the month/year picker | `minDate`, `maxDate` |
| Day/date click | Pointer or keyboard day selection with the native day button and strict date context | `onDaySelect` |
| Event primary activation | Pointer or keyboard activation from native grid/agenda anchors or buttons; a context-only non-link button invokes its sole context callback instead | `onEventActivate`, `onEventContextMenu`, `CalendarEventActivation.surface` |
| Event context action | Right-click, the Context Menu key, or Shift+F10 on an eligible grid/agenda event action; primary activation also invokes it for an eligible non-link event with no `onEventActivate` callback | `isEventContextMenuAvailable`, `onEventContextMenu` |
| Day context menu | Right-click, the Context Menu key, or Shift+F10 with coordinates plus date and button context | `onDayContextMenu` |
| Direct-input paging | RTL-aware native pull/snap month paging for touch, pen, and horizontal precision scrolling, with button fallbacks and preserved vertical scrolling and pinch zoom | `swipe` (defaults to `true`) |
| Keyboard navigation | Managed grid day movement plus F2 entry to event actions, Up/Down action movement, Escape/F2 return, and predictable Tab exit | Native grid behavior and action callbacks |
| Localization | `Intl` month, short/narrow weekday, full accessible date, and time formatting; message overrides; locale-derived or explicit first day of week | `locale`, `messages`, `firstDay` |
| Time zone | IANA-zone projection for supplied `Date` instants; event strings remain unchanged civil values | `timeZone`, `initialDate`, `minDate`, `maxDate`, `now` |
| RTL | Inherited direction for layout, horizontal keyboard movement, and pager direction | Host `dir` / computed direction |
| Custom toolbar | One application-owned HTML element after Previous, Next, month title, and Today in DOM/focus order; compact rows split at `42rem` and `20rem` without visual reordering | `toolbarEnd`, `icons` |
| Custom event rendering | Same-document node hooks for one owned marker plus leading, details, and trailing event content on grid-summary and agenda surfaces | `renderEventMarker`, `renderEventLeading`, `renderEventDetails`, `renderEventTrailing` |
| Custom day rendering | A same-document visual day badge plus mount access to owned day elements | `renderDayBadge`, `dayDidMount` |
| Event mount lifecycle | Ordered mount callbacks, an abort signal, per-registration cleanup, and extension quarantine | `eventDidMount`, `CalendarExtension` |
| Styling and themes | Scoped `--lfc-*` tokens, a low-specificity CSS layer, CSS-only container queries, light/dark defaults, forced colors, contrast, reduced-motion-safe selection feedback, and browser-native pager motion | `@tryagaindev/litefold-calendar/styles.css` |
| Event accent color | One validated opaque `#RRGGBB` color for the built-in SVG marker, with a token fallback and no event-chip tint | `CalendarEventInput.accentColor`, `--lfc-event-accent-color` |
| View, selection, loading, and error state | Immutable displayed-month, selected-date, range, phase, and issue snapshots plus default persistent presentation for current errors, Retry, retained-data warnings, and diagnostic-only late or stale failures | `getState()`, `onStateChange`, `onError`, `onAnnounce` |
| SSR and packaging | DOM-free module evaluation, ESM, declarations, no remote assets, and zero runtime/peer/optional/bundled dependencies | Root export and `./styles.css` export |
| Progressive fallback | Exclusive coordination of application-owned no-JavaScript markup, hidden only after usable data commits | `fallbackElement` |

See the [example coverage guide](../examples/) to find the runnable fixture for each capability. The [advanced TypeScript example](../examples/advanced/) is intentionally the complete successful-feature showcase: it exhaustively covers public options, methods, and extension hooks, including inclusive bounds and the native month/year jump. Its day-badge hook uses the valid no-output path so fixture cells show only dates and events. The async-errors example owns failure and recovery scenarios. The [FullCalendar recipe](../examples/fullcalendar-v6-migration/) demonstrates a rewrite rather than compatibility, and the [progressive example](../examples/progressive-enhancement/) exercises native fallback content and event links.

## Calendar display

The component renders one current month view as a fixed 42-day grid. Dates from the preceding and following months fill that grid, so an event provider always receives a complete six-week range. The native paging viewport adds only decorative pull lanes: it does not render a second month grid, clone interactive content, or prefetch an adjacent event range. Optional inclusive `minDate` and `maxDate` bounds do not crop the committed provider range. Visible dates outside the bounds have disabled day buttons and suppress built-in event representations and counts, while day extension hooks may still inspect the disabled structural cells. The selected day's agenda remains below the grid on narrow and wide containers instead of becoming a separate overlay or view.

Each grid cell contains a day button and a sibling summaries container; event and overflow actions live in that container rather than inside the day button, so interactive controls are never nested. In wider containers all events up to `maxGridEventsPerDay` are exposed directly. At `42rem` and below, the first actionable event remains a fully named native marker with a minimum 24 by 24 CSS-pixel target that grows toward 44 by 44 when its day cell permits; later grid actions are visually omitted unless they hold focus. Selecting a day resets and updates its paged agenda.

Activating a different enabled day button within the displayed month by click, tap, Enter, or Space commits selection, agenda, ARIA, and focus synchronously. Pointer press and hover use the selected day-number treatment as immediate feedback. When motion is allowed, the newly selected button transitions its whole-cell background directly from the rest surface to the committed selected surface while the date number scales subtly into place; no expanding overlay or delayed state commit is involved. Selected and focus outlines remain stable. `prefers-reduced-motion: reduce`, same-date and adjacent-month activation, Grid More, navigation, and programmatic selection show the settled state immediately. The effect never delays `onDaySelect`, and initial, loading, data, error, paging, replacement, and refetch renders do not replay it.

An event with `url` is a native anchor on both surfaces. Without a URL, `onEventActivate` or an eligible context action produces a native button. When the context action is that button's only application action, click, tap, Enter, or Space invokes `onEventContextMenu` as its primary action; right-click, Context Menu, and Shift+F10 remain available on every eligible action. Without a URL or available action, the representation is static. Agenda markup uses `<ol>` and `<li>`; day numbers and event times use `<time datetime>`. `eventTimeDisplay` controls whether localized time text is visually exposed on each surface without removing the native time element, its machine-readable value, the accessible event name, or extension `timeText`. Direct grid event activation never selects its day or invokes `onDaySelect`.

Grid overflow is a native action with a localized date/count name. It selects the represented date, resets the agenda expansion, and focuses the agenda heading without invoking `onDaySelect`.

Static and interactive agenda rows share a logical marker/leading column, localized-time column, and flexible title/content column. Marker and leading content can extend within their owned slots without being clipped; text-only slots own truncation. Empty slots reserve no gap. Extension details and trailing content follow below the title in DOM order. Below `24rem`, the title, details, and trailing content span the full row while leading content and time stay on the first row; the same structure works in RTL.

For each day, events sort all-day first and then by start, title, and ID. `maxGridEventsPerDay` defaults to `3` and accepts `0–10`. The agenda initially shows `50` events by default, can reveal additional pages, and has a default DOM limit of `200`. When the limit hides remaining rows, persistent text reports the visible and total counts.

## Events and event fetching

The calendar accepts all-day, timed, point, and multi-day events through one typed `events` option. Pass a local array directly, or pass a range-aware provider that returns an array or promise-like result from application-owned work. `createCalendar<TMetadata>()` returns `Calendar<TMetadata>`, so the same metadata type applies when `setEvents()` later replaces the complete array or provider. The package never downloads a feed or caches results. It resolves an optional event `url` against the host document, accepting only validated relative or HTTP(S) destinations without credentials or control characters.

Every committed visible-range change and `refetchEvents()` invocation calls the source with:

```ts
type CalendarEventSource<TMetadata = unknown> = (
	this: void,
	range: {
		readonly start: string;
		readonly end: string;
		readonly signal: AbortSignal;
	}
) => readonly CalendarEventInput<TMetadata>[] |
	PromiseLike<readonly CalendarEventInput<TMetadata>[]>;

type CalendarEvents<TMetadata = unknown> =
	readonly CalendarEventInput<TMetadata>[] |
	CalendarEventSource<TMetadata>;

interface Calendar<TMetadata = unknown> {
	setEvents(events: CalendarEvents<TMetadata>): void;
}
```

Forward `signal` to cancellable work. A newer request or accepted `setEvents()` call aborts and supersedes the prior generation. The source result is accepted atomically: a malformed event, duplicate ID, or result beyond `sourceEventLimit` rejects the complete snapshot. A failed refresh or accepted replacement for the same range retains the prior usable events and shows the normal stale-data warning. The accepted replacement remains current, and later Retry or `refetchEvents()` uses it rather than the construction-time source.

`setEvents()` requires a rendered, live instance and checks lifecycle before inspecting its argument. Invalid top-level input throws `invalid-argument` without aborting or changing current work. An accepted replacement preserves the displayed month, selected date, current agenda reveal count within the result and DOM cap, and the exact package-owned focus target when it still exists; a removed focused event falls back to its day. Generation checks make the last accepted reentrant replacement win and prevent older success, failure, and render work from committing.

`minDate` and `maxDate` constrain user interaction, not event loading. Every committed displayed month requests the full inclusive-start/exclusive-end range represented by all 42 grid cells; an in-progress pager pull requests nothing. Events on visible out-of-range dates may be returned and normalized, but their grid representations are not rendered and those days cannot be activated.

See the [public API reference](api.md) for strict input grammar, exclusive-end occupancy, validation bounds, normalized event types, and the year-boundary limitation.

## Navigation and actions

The built-in toolbar's DOM and focus order is Previous, Next, month/year title, then Today. Its presented month and year is a native button that opens a `popover="auto"` surface exposed as a dialog. Opening synchronizes the bounded native month select and required numeric year input, then focuses Month; unavailable months update when Year changes. A successful Jump changes to an in-range month, while a same-month submission is a no-op and never invokes `onDaySelect`. Invalid form input stays open for correction. Cancel preserves the current state. Successful Jump and Cancel close the popover and return focus to the month/year trigger. Escape also restores trigger focus; pointer/outside light-dismiss closes the popover without taking focus away from the user's new target. Application code can use `prev()`, `next()`, `today()`, `gotoDate()`, `focusDate()`, `focusToday()`, `setEvents()`, and `refetchEvents()` without querying package DOM.

`minDate` and `maxDate` apply inclusively to every navigation, focus, and day-activation path. Previous, Next, Today, swipe, keyboard month/year movement, and the jump popover stop at those bounds. Previous, Next, and Today remain in the Tab order with `aria-disabled="true"` and guarded no-op activation when they have no in-range destination. Explicit out-of-range or unrenderable `initialDate` values and out-of-range `gotoDate()` / `focusDate()` values are rejected. When `initialDate` is omitted, initialization resolves the current date to the nearest in-range date in a renderable month when necessary.

The existing optional `swipe` boolean remains enabled by default. Touch, pen, and horizontal precision-scroll input can pull the current grid toward an `aria-hidden` Previous or Next lane in an RTL-aware native scroll-snap viewport. A settled qualifying pull changes at most one month; an uncommitted or unavailable direction recenters without changing calendar state. The pager never renders an adjacent month grid or fetches an adjacent event range before commit; the lane's localized month/year text is only a decorative destination label. Vertical page scrolling and pinch zoom remain available, while mouse dragging is not synthesized. User-agent and operating-system momentum, rubber-banding, overscroll distance, and snap timing may differ and are not stable package behavior. `swipe: false` disables this input route without changing the native Previous/Next controls, keyboard commands, picker, or public methods.

Day selection and event activation are separate:

| User action | Callback | Notes |
|---|---|---|
| Click or tap a day; press Enter or Space on a focused day | `onDaySelect` | Selects the day and updates its agenda |
| Click an event action with an activation callback; press Enter or Space | `onEventActivate` | Runs on `"grid-summary"` and `"agenda"`; a linked event may synchronously prevent navigation |
| Right-click a day; press Context Menu or Shift+F10 | `onDayContextMenu` | Optional; no long-press gesture is synthesized |
| Right-click an eligible event; press Context Menu or Shift+F10 | `onEventContextMenu` | Availability is decided synchronously per occurrence and surface |
| Click or tap an eligible non-link event with no activation callback; press Enter or Space | `onEventContextMenu` | The context callback becomes the native button's primary action because it is the event's only application action |

All four callbacks may return `void` or `PromiseLike<void>`. A synchronous throw or rejected promise-like result that remains current becomes a persistent `action-failed` issue. A failure superseded by a newer invocation of the same callback, a fatal transition, or destruction is delivered as a `stale: true` diagnostic without changing state, visible UI, or announcements.

Keyboard day focus uses one managed `tabindex="0"` day proxy; all grid event and overflow actions remain `-1`. Arrow keys move by day or week, Home and End move to week boundaries, Page Up and Page Down change month, and Shift+Page Up and Shift+Page Down change year. F2 enters a date's visible actions; Up and Down move between them without wrapping; Escape or F2 returns to the day. Tab exits forward toward the agenda, while Shift+Tab from an action returns to its day proxy. Movement never focuses or selects an out-of-range day. Horizontal movement follows inherited RTL direction.

Set the semantic HTML `dir` attribute on the calendar host or an ancestor to mirror the grid and navigation controls for RTL users. Gregorian date arithmetic is independent of presentation direction, and `firstDay` remains a separate application or locale choice.

## Localization and time zones

`locale` controls `Intl` formatting for the month heading, decorative pager-lane month labels, month/year picker, weekday labels, full dates, and times. Pager lanes remain `aria-hidden`; the current grid's complete accessible name comes from the month heading's canonical full localized label. At containers `20rem` and below, the visual column label changes from the locale's short weekday form to its narrow form; every column keeps its full localized weekday as the accessible name. `firstDay: "locale"` accepts either the platform's `Intl.Locale#getWeekInfo()` method or `Intl.Locale#weekInfo` accessor and falls back to Sunday only when neither yields usable week information; an explicit `0–6` value selects Sunday through Saturday. Override `messages` to localize package-owned controls, status text, errors, and announcements. The picker uses `chooseMonthYear`, `jumpToMonthYear`, `month`, `year`, `jump`, and `cancel`.

`initialDate` is optional; when omitted, the calendar starts from the date returned by `now`, whose default is the current instant from `new Date()`, and resolves to the nearest in-range date in a renderable month when necessary. An explicitly supplied `initialDate` must already be within the inclusive bounds and renderable. `timeZone` projects supplied `Date` instants, including `initialDate`, `minDate`, `maxDate`, and the result of `now()`, into an IANA time zone. It does not reinterpret event strings. Event strings are strict Gregorian civil dates or local date-times and intentionally contain no offset or zone annotation.

The alpha supports Gregorian calendar arithmetic only. Locale changes presentation and week convention, not the underlying calendar system.

Locale, time zone, `firstDay`, `minDate`, `maxDate`, and other non-event options remain construction-time configuration. Recreate the instance to change them; `setEvents()` does not provide general option reconciliation.

## Custom toolbar, rendering, and styling

Use `toolbarEnd` to place one application-owned `HTMLElement`, such as a filter fieldset, after the built-in navigation controls. It may start detached or as a host descendant. Use `icons.previous` and `icons.next` for detached, noninteractive icon nodes. Custom directional icons remain application-owned and should provide their own RTL mirroring; the advanced example demonstrates this with `:dir(rtl)`. These hooks avoid dependencies on private package selectors.

Responsive toolbar and grid placement is CSS-only and responds to the rendered host's inline size. Its built-in DOM and sequential-focus order is Previous, Next, interactive title, then Today, followed by application toolbar content. At `42rem` and below, the built-ins share the first compact row and application content spans the next. At `20rem` and below, Previous/Next and the title occupy the first row, Today the second, and application content the third without visual reordering. On narrow containers, the visible month/year title uses a complete locale-formatted abbreviated month-and-year label; its `aria-hidden` presentation leaves one canonical full DOM string and accessible name. Resizing does not invoke event providers or replace calendar nodes. Consumer scripts do not need viewport listeners, layout measurement, or breakpoint-specific rendering.

Extensions provide custom day and event rendering with nodes rather than HTML strings:

- `renderDayBadge`
- `renderEventLeading`
- `renderEventMarker`
- `renderEventDetails`
- `renderEventTrailing`
- `dayDidMount`
- `eventDidMount`

Hooks receive documented owned-element references, a rendering surface, date/event context, and an extension-lifecycle `AbortSignal`. A failed extension is quarantined for that calendar instance; its nodes are removed while the core calendar and later extensions remain available. See the [`CalendarExtension` reference](api.md#extend-rendering-calendarextension) for ownership and cleanup rules.

`CalendarEventElements.action` is an `HTMLAnchorElement`, `HTMLButtonElement`, or `null`; time slots are `HTMLTimeElement`. Use the `surface` discriminator rather than querying private DOM.

Import `@tryagaindev/litefold-calendar/styles.css`, then override documented `--lfc-*` custom properties from application CSS. The built-in stylesheet includes responsive container queries and system dark-mode, increased-contrast, forced-color, and reduced-motion handling. Event surface colors remain application-owned: use a finite set of extension-owned classes, or a validated application custom property when the application's CSP permits inline style state. Only `.litefold-calendar` and documented tokens are stable CSS API. The presence-only `data-litefold-calendar` attribute is a stable JavaScript discovery marker, not a styling hook; see the [CSS token contract](css-tokens.md).

## Errors, state, and recovery

Loading, successful empty data, retained-data degradation, current source failures, current action failures, partial extension failures, and fatal failures are distinct states. Current operational errors accepted into state remain visibly and accessibly presented by the package unless `onError` returns the exact value `"handled"`. Installing telemetry without returning `"handled"` does not suppress that package UI. Non-abort failures from superseded requests or actions are delivered with `stale: true` for diagnostics only; they do not enter `CalendarState.issues`, replace the current view, or produce package UI or announcements. Other post-lifecycle failures that can no longer enter presentation are diagnostic-only without necessarily being marked stale.

Use `getState()` for the latest frozen displayed month, selected date, request range, phase, and sanitized current issues; use `onStateChange` for synchronous observation. Use `onAnnounce` only when the application has a centralized live announcer; visible package error UI remains unless presentation is explicitly handed off. A thrown, thenable, or non-boolean `isEventContextMenuAvailable` result fails closed and reports one recoverable integration issue. See [Error handling](errors.md) for current versus stale diagnostics, the error codes, Retry behavior, global reporting, and application responsibilities.

`fallbackElement` coordinates application-authored no-JavaScript content without pretending to provide SSR. It must be a same-document element outside the host and is leased exclusively. It stays unchanged through construction and initial loading, is hidden after the first usable snapshot (including empty), stays hidden through a degraded retained-data refresh, returns to its original hidden state when no usable data remains or on destroy, and hides again after retry succeeds—provided its current `hidden` value still matches the package's last write. If application code changes that value during the lease, package writes are skipped while the value differs, and destroy preserves the differing application value while still releasing the lease. Canonical pages, metadata, structured data, privacy, and rich-result eligibility remain server responsibilities.

## Deliberate alpha boundaries

The alpha does not provide:

- Week, day, time-grid, separate list, timeline, resource, year, or multi-month views.
- View switching, configurable grid duration, hidden weekends, week numbers, business hours, background events, or a now indicator.
- Pre-rendered adjacent-month pager panels, carousel virtualization, or gesture-driven event prefetching.
- Drag-and-drop, event resizing, built-in event creation/editing, per-event mutation methods, or a general mutable-options API.
- Date-range or time-range selection.
- Recurrence or RRULE expansion. Expand occurrences before returning the source snapshot.
- Multiple first-class event sources, built-in JSON/iCalendar/calendar-service feeds, or package-owned caching. Aggregate, fetch, authorize, and cache in the application source.
- Resource scheduling, time-slot configuration, or event virtualization.
- Arbitrary HTML strings, per-event class names, or arbitrary background/text/border style inputs. Use validated event URLs, trusted node extensions, and the documented built-in marker accent.
- An SSR renderer, automatic JSON-LD, canonical event pages, metadata, sitemap policy, or search/privacy decisions.
- Framework-specific wrappers, CommonJS output, polyfills, or legacy-browser builds.
- Non-Gregorian calendar systems.

These boundaries keep the alpha focused on a responsive, accessible month-and-agenda component with a small integration and security surface.
