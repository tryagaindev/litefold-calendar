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
| Grid event actions and overflow | Configurable direct event actions, a compact multiple-event cue, a localized native overflow action with customizable non-compact content, agenda paging, a DOM cap, and persistent `Showing X of Y` text | `maxGridEventsPerDay`, `renderMultipleEventIndicator`, `renderGridOverflowContent`, `gridMoreLabel`, `agendaPageSize`, `agendaDomLimit` |
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
| Custom toolbar | One application-owned HTML element after Previous, Next, month title, and Today in DOM/focus order; compact row composition follows the [responsive design](../DESIGN.md#responsive-model) without visual reordering | `toolbarEnd`, `icons` |
| Custom event rendering | Same-document node hooks for one owned marker, compact multiple-event indication, non-compact overflow content, and leading, details, and trailing event content | `renderEventMarker`, `renderMultipleEventIndicator`, `renderGridOverflowContent`, `renderEventLeading`, `renderEventDetails`, `renderEventTrailing` |
| Custom day rendering | A same-document visual day badge plus mount access to owned day elements | `renderDayBadge`, `dayDidMount` |
| Event mount lifecycle | Ordered mount callbacks, an abort signal, per-registration cleanup, and extension quarantine | `eventDidMount`, `CalendarExtension` |
| Styling and themes | Canonical DESIGN.md roles exposed through scoped `--lfc-*` tokens, a low-specificity CSS layer, container queries, color preferences, and reduced-motion-safe feedback | [Design system](../DESIGN.md) and `@tryagaindev/litefold-calendar/styles.css` |
| Event accent color | One validated opaque `#RRGGBB` color for the built-in SVG marker, with a token fallback and no event-chip tint | `CalendarEventInput.accentColor`, `--lfc-event-accent-color` |
| View, selection, loading, and error state | Immutable displayed-month, selected-date, range, phase, and issue snapshots plus default persistent presentation for current errors, Retry, retained-data warnings, and diagnostic-only late or stale failures | `getState()`, `onStateChange`, `onError`, `onAnnounce` |
| SSR and packaging | DOM-free module evaluation, ESM, declarations, no remote assets, and zero runtime/peer/optional/bundled dependencies | Root export and `./styles.css` export |
| Progressive fallback | Exclusive coordination of application-owned no-JavaScript markup, hidden only after usable data commits | `fallbackElement` |
| Experimental WebMCP site tools | Explicit, default-off registration of one paged visible-range read tool and one navigation tool for a rendered instance; unsupported browsers retain the complete normal UI | `webMcp`, `CalendarWebMcpOptions`, [WebMCP guide](webmcp.md) |

See the [example coverage guide](../examples/) to find the runnable fixture for each capability. The [advanced TypeScript example](../examples/advanced/) is intentionally the complete successful-feature showcase: it exhaustively covers public options, methods, and extension hooks, including inclusive bounds and the native month/year jump. Its day-badge hook uses the valid no-output path so fixture cells show only dates and events. The async-errors example owns failure and recovery scenarios. The [FullCalendar recipe](../examples/fullcalendar-v6-migration/) demonstrates a rewrite rather than compatibility, and the [progressive example](../examples/progressive-enhancement/) exercises native fallback content and event links.

## Calendar display

The package presents one fixed six-week Gregorian month grid plus the selected day's agenda. It supports adjacent-month filler dates, bounded navigation, native event representations, grid overflow, paged agenda rows, and visual time-display choices.

The [API reference](api.md) owns exact grid, occupancy, sorting, limit, and agenda behavior. [DESIGN.md](../DESIGN.md) owns visual composition and responsive behavior; the [accessibility guide](../ACCESSIBILITY.md) owns semantics, naming, targets, keyboard behavior, and focus.

## Events and event fetching

The typed `events` option accepts a local snapshot or an application-owned, abort-aware provider. The same metadata generic flows through normalized events, actions, extensions, and complete `setEvents()` replacements. Transport, authorization, aggregation, filtering, and caching remain application responsibilities.

The [event and source contracts](api.md#supply-events-calendarevents-and-calendareventsource) own exact input grammar, URL validation, ranges, cancellation, atomic admission, replacement, reentrancy, retained-data behavior, and normalized output. Use the [integration guide](integration-guide.md#typed-source-adapter) for adapter and caching recipes.

## Navigation and actions

Users can navigate through native toolbar controls, the month/year popover, optional direct-input paging, keyboard commands, and public methods. Day selection, event activation, event context actions, and day context actions remain separate capabilities.

The [API reference](api.md#control-the-calendar-calendar) owns method and callback contracts, bounds, and failure behavior. The [accessibility interaction model](../ACCESSIBILITY.md#interaction-model) owns keyboard, focus, popover, gesture, and RTL interaction; [DESIGN.md](../DESIGN.md) owns their presentation.

## Localization and time zones

Locale-aware `Intl` formatting, locale-derived or explicit week starts, message overrides, IANA-zone projection for supplied `Date` instants, and Gregorian civil event strings are supported. Locale changes presentation and week convention, not the underlying Gregorian calendar system.

The [API configuration contract](api.md#configure-behavior-calendaroptions) owns accepted values, fallbacks, construction-time immutability, and the distinction between projected `Date` instants and unchanged event strings.

## Custom toolbar, rendering, and styling

Application-owned toolbar content, directional icons, day badges, event content, multiple-event cues, overflow visuals, and mount behavior are available through public node hooks. The [`CalendarExtension` contract](api.md#extend-rendering-calendarextension) owns hook inputs, node ownership, cleanup, and quarantine. On quarantine, package-mounted nodes are removed only while they remain under their expected package parent; application-reparented nodes are released and preserved, and singleton presentation slots return to package defaults.

At `42rem` and below, a day with more than one total event occurrence gets a decorative stacked-card cue, regardless of the grid display cap. `renderMultipleEventIndicator` runs once for each qualifying in-range day: `undefined` keeps that default, `null` suppresses it, and a returned node replaces it. The cue stays independent of the primary event marker and is omitted when the native overflow action is already the compact-primary control.

`renderGridOverflowContent` runs only when that native overflow action exists. A returned node customizes its non-compact visual content; `null` or `undefined` retains the localized default. The native button, canonical localized text, accessible name, activation, and agenda focus transfer remain package-owned. Both hooks are independently singleton-owned and accept only synchronous, detached, same-document, noninteractive nodes. Crossing the compact boundary changes CSS visibility only, without another hook call or render. The hooks add no public selector, CSS token, or message key.

Import `@tryagaindev/litefold-calendar/styles.css`, follow [DESIGN.md](../DESIGN.md) for visual roles and exact responsive behavior, and use the [CSS token contract](css-tokens.md) for token application, cascade, root-marker, and CSP mechanics. Do not depend on private package selectors.

## Errors, state, and recovery

The observable state distinguishes loading, usable empty data, retained-data degradation, current failures, partial extension failures, and fatal unavailability. The [error guide](errors.md) owns classification, presentation transfer, announcements, diagnostics, and recovery; the [API reference](api.md#observe-state-calendarstate) owns state and callback shapes.

`fallbackElement` can coordinate application-authored no-JavaScript content. The [API reference owns its exact lifecycle](api.md#application-integration-options); the [progressive-enhancement guide](seo-and-progressive-enhancement.md) owns the server-content, crawlability, metadata, privacy, and verification recipe.

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
- Automatic WebMCP registration, a remote MCP server, declarative form or iframe tools, event activation, editing tools, or exposure of event IDs, URLs, metadata, extensions, and raw diagnostics.
- Framework-specific wrappers, CommonJS output, polyfills, or legacy-browser builds.
- Non-Gregorian calendar systems.

These boundaries keep the alpha focused on a responsive, accessible month-and-agenda component with a small integration and security surface.
