# Features and alpha scope

This guide is the quickest way to determine whether Litefold Calendar fits a project. It maps common calendar terms to the public API and states what the alpha deliberately does not provide.

## Feature map

| Capability | What Litefold Calendar provides | Main public surface |
| --- | --- | --- |
| Calendar presentation | One responsive, fixed six-week Gregorian month grid and a selected-day agenda; adjacent-month dates are fillers, not prefetched pager panels | `createCalendar()`, `render()` |
| Event model | Date-only, local date-time, point, and multi-day events with exclusive ends; optional validated HTTP(S) or relative links; visual time display can differ by surface | `CalendarEventInput`, `eventTimeDisplay` |
| Event data | A static snapshot or abort-aware provider, shape-based synchronous/PromiseLike timing, complete source replacement, current-range refetch, and typed application metadata | `events`, `CalendarEventSource`, `setEvents()`, `refetchEvents()` |
| Grid and agenda limits | A configurable grid cap, native overflow action, paged agenda rows, DOM limit, and visible/total progress text | `maxGridEventsPerDay`, `agendaPageSize`, `agendaDomLimit` |
| Navigation and bounds | Previous, Next, Today, a native month/year jump, public navigation/focus methods, and optional inclusive date limits | `prev()`, `next()`, `today()`, `gotoDate()`, `focusDate()`, `minDate`, `maxDate` |
| User actions | Separate day selection, event activation, event context action, and day context action callbacks using native links and buttons | `onDaySelect`, `onEventActivate`, `onEventContextMenu`, `onDayContextMenu` |
| Direct input and keyboard | Managed grid keyboard navigation plus RTL-aware native pull/snap paging for touch, pen, and horizontal precision scrolling; toolbar buttons remain the fallback | `swipe`, native interaction model |
| Localization and zones | `Intl` formatting, message overrides, locale-derived or explicit week starts, inherited RTL direction, and IANA projection for supplied `Date` instants | `locale`, `messages`, `firstDay`, `timeZone` |
| Application UI | One owned toolbar element, custom icons, day/event node hooks, mount cleanup, and isolated hook failure | `toolbarEnd`, `icons`, `CalendarRenderHooks` |
| Styling | Scoped CSS, documented `--lfc-*` tokens, container-query responsiveness, preference-aware themes, and an optional validated event marker color | [Calendar anatomy](component-anatomy.md), [design system](../DESIGN.md), [CSS tokens](css-tokens.md) |
| State and recovery | Immutable month, selection, range, phase, and issue snapshots; persistent error/Retry UI; application error and announcement bridges | `getState()`, `onStateChange`, `onError`, `onAnnounce` |
| Progressive fallback | Coordination of application-owned no-JavaScript markup, hidden only after a usable snapshot commits | `fallbackElement` |
| Optional components | Explicit, tree-shakeable first-party extension subpaths; WebMCP is experimental and becomes a no-op when its browser API is unavailable | `extensions`, [first-party extensions](first-party-extensions.md) |
| Packaging | Pure ESM, declarations, DOM-free module evaluation, no remote assets, and no runtime, peer, optional, or bundled dependencies | Root, `./styles.css`, and `/extensions/<id>` exports |

## Choose an example

| Need | Runnable example |
| --- | --- |
| First render with JavaScript | [Basic example](../examples/basic/) |
| Complete TypeScript integration, including hooks, bounds, methods, and WebMCP | [Advanced example](../examples/advanced/) |
| Loading, failure, Retry, and recovery | [Async-errors example](../examples/async-errors/) |
| Server-authored fallback and native event links | [Progressive-enhancement example](../examples/progressive-enhancement/) |
| Rewrite a FullCalendar v6 `dayGridMonth` integration | [FullCalendar migration example](../examples/fullcalendar-v6-migration/) |

The [examples guide](../examples/) maps common integration tasks to executable recipes and explains which fixtures own broader coverage.

## Calendar display

The package presents one fixed six-week Gregorian month grid plus the selected day's agenda. It supports adjacent-month filler dates, bounded navigation, native event representations, grid overflow, paged agenda rows, and visual time-display choices. Its minimum supported design width is a 320 CSS-pixel calendar host border box; narrower hosts receive best-effort graceful degradation.

The [API reference](api.md) owns exact grid, occupancy, sorting, limit, and agenda behavior. [DESIGN.md](../DESIGN.md) owns visual composition and responsive behavior; the [accessibility guide](../ACCESSIBILITY.md) owns semantics, naming, targets, keyboard behavior, and focus.

## Events and event fetching

The typed `events` option accepts a local snapshot or an application-owned, abort-aware provider. A static array or provider-returned array commits synchronously with one full render and no loading or `aria-busy` state. Any promise-like result—including an already-fulfilled promise, an `async` function result, or a custom thenable—uses a loading render followed by a terminal render. Classification happens for every invocation, so one provider can return cached arrays and promise-like cache misses. The same metadata generic flows through normalized events, actions, render hooks, and complete `setEvents()` replacements. Transport, authorization, aggregation, filtering, and caching remain application responsibilities.

The [event and source contracts](api.md#supply-events-calendarevents-and-calendareventsource) own exact input grammar, URL validation, ranges, cancellation, atomic admission, replacement, reentrancy, retained-data behavior, and normalized output. Use the [integration guide](integration-guide.md#typed-source-adapter) for adapter and caching recipes.

## Navigation and actions

Users can navigate through native toolbar controls, the month/year popover, optional direct-input paging, keyboard commands, and public methods. Day selection, event activation, event context actions, and day context actions remain separate capabilities.

The [API reference](api.md#control-the-calendar-calendar) owns method and callback contracts, bounds, and failure behavior. The [accessibility interaction model](../ACCESSIBILITY.md#interaction-model) owns keyboard, focus, popover, gesture, and RTL interaction; [DESIGN.md](../DESIGN.md) owns their presentation.

## Localization and time zones

Locale-aware `Intl` formatting, locale-derived or explicit week starts, message overrides, IANA-zone projection for supplied `Date` instants, and Gregorian civil event strings are supported. Locale changes presentation and week convention, not the underlying Gregorian calendar system.

The [API configuration contract](api.md#configure-behavior-calendaroptions) owns accepted values, fallbacks, construction-time immutability, and the distinction between projected `Date` instants and unchanged event strings.

## Custom toolbar, rendering, and styling

Application-owned toolbar content, directional icons, day badges, event content, compact and wide event-overflow visuals, and mount behavior are available through public render hooks. Content hooks return synchronous, detached, same-document, noninteractive nodes. `renderEventOverflow` pre-renders each applicable responsive variant through one discriminated context, and container resizing only changes which existing variant CSS exposes. At compact widths, the package keeps a primary marker/action and passive count in equal, gap-free blocks at the cell's block end. Its auto-fit grid uses the compact-control-size track floor, 44 CSS pixels by default, so the blocks stay in centered equal full-width rows through supported phone widths and their centers evenly divide the full area beneath the date only near the compact ceiling. Markerless and action-backed compact fallbacks remain one centered block/action. Render hooks replace the contents of those blocks, not their placement; no overflow-layout selector or CSS token is public. Because the repeat threshold cannot use arbitrary hook content's intrinsic width, consumers keep compact output concise enough for its assigned block and own any oversized overflow. `dayDidMount` and `eventDidMount` mutate supplied live elements and may return a synchronous cleanup function instead of a node. Litefold Calendar isolates a failing hook set and restores package defaults for every singleton slot it owned.

The [render-hook API](api.md#customize-rendering-calendarrenderhooks) defines every input, return value, cleanup rule, and failure behavior. The [typed integration recipe](integration-guide.md#add-metadata-driven-visuals-without-private-selectors) shows how to map application metadata to owned classes and nodes.

Import `@tryagaindev/litefold-calendar/styles.css`, follow [DESIGN.md](../DESIGN.md) for visual roles and responsive behavior, and use the [CSS token contract](css-tokens.md) for host overrides, cascade layers, and CSP. Do not depend on private package selectors.

## Optional first-party extensions

Complete package-owned components use opaque `CalendarExtension` values in `CalendarOptions.extensions`. Import each factory from its explicit `/extensions/<id>` subpath; the root entry does not re-export extension implementations. On initial direct-array work, extensions activate and receive one queued terminal state delivery. On initial promise-like work, they activate after loading is published and do not receive a retroactive loading delivery. Omitting the WebMCP subpath import keeps its implementation outside the application's import graph, while merely placing a statically imported factory behind a runtime condition does not guarantee bundle removal.

Extensions may be headless and own more than one coordinated lifecycle behavior. They are distinct from application-owned `CalendarRenderHooks`. See [first-party extensions](first-party-extensions.md) for composition, ordering, teardown, isolation, bundle behavior, and the intentionally future-facing status of third-party authoring.

## Errors, state, and recovery

The observable state distinguishes promise-like loading, usable empty data, retained-data degradation, current failures, partial render-hook failures, and fatal unavailability. Direct arrays reach their terminal state before the initiating method returns; promise-like results retain the loading lifecycle. Registered-extension failures remain diagnostic-only and do not alter ordinary state. The [error guide](errors.md) owns classification, presentation transfer, announcements, diagnostics, and recovery; the [API reference](api.md#observe-state-calendarstate) owns state and callback shapes.

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
- Arbitrary HTML strings, per-event class names, or arbitrary background/text/border style inputs. Use validated event URLs, trusted render-hook nodes, and the documented built-in event marker color.
- An SSR renderer, automatic JSON-LD, canonical event pages, metadata, sitemap policy, or search/privacy decisions.
- Automatic WebMCP registration, a remote MCP server, declarative form or iframe tools, event activation, editing tools, or exposure of event IDs, URLs, metadata, render-hook content, and raw diagnostics.
- Public third-party extension authoring. The alpha supports official extension factories and stable consumer render hooks; any future third-party lifecycle/capability contract will be explicit and lower stability.
- Framework-specific wrappers, CommonJS output, polyfills, or legacy-browser builds.
- Non-Gregorian calendar systems.

These boundaries keep the alpha focused on a responsive, accessible month-and-agenda component with a small integration and security surface.
