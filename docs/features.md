<a id="features-and-alpha-scope"></a>

# Features and scope

Choose Litefold Calendar for a responsive month grid and selected-day agenda.
Your application supplies events and handles editing, routing, and permissions.
It is not a full scheduling platform; check the [boundaries](#deliberate-boundaries)
before adopting it.

## Feature map

| Need | Available capability | Configure with |
| --- | --- | --- |
| Month and agenda | One six-week Gregorian grid with the selected day's event list | `createCalendar()` |
| Local or remote data | Pass an array or a function that loads the visible dates; replace or reload it | `events`, `setEvents()`, `refetchEvents()` |
| All-day and timed events | Date-only, local date-time, point, and multi-day events with exclusive ends | `CalendarEventInput` |
| Busy days | Event summaries or day counts, overflow actions, and paged agenda rows | `gridEventDisplay`, `maxGridEventsPerDay`, `agendaPageSize`, `agendaDomLimit` |
| Navigation | Toolbar controls, a month/year chooser, keyboard navigation, optional swipe, and date bounds | Navigation methods, `swipe`, `minDate`, `maxDate` |
| Application actions | Separate day, event, overflow, and context actions; native event links | Action callbacks, event `url` |
| Localization | Localized dates and messages, week starts, RTL, and zone projection for `Date` inputs | `locale`, `messages`, `firstDay`, `timeZone` |
| Visual customization | Themes, CSS tokens, event markers, toolbar content, and render hooks | Styling and integration guides below |
| Recovery | Loading state, persistent errors and Retry, state callbacks, and optional fallback content | `onStateChange`, `onError`, `fallbackElement` |
| Optional site tools | Explicit opt-in to experimental WebMCP | First-party WebMCP extension |
| Packaging | Pure ESM with TypeScript declarations, a separate stylesheet, and no runtime dependencies | Package root and documented subpaths |

## Choose an example

Start with [Getting started](getting-started.md) to render your first calendar.
Use [Remote data](remote-data.md) to load events from an API.
The [examples guide](../examples/README.md) lists runnable recipes for specific tasks.
The advanced example is an exhaustive API showcase; choose it when you need to
explore the full API.

## Calendar display

The layout adapts to the calendar's container. The viewport size does not control
it. Choose equal-height or content-sized weeks. Place events at the top, center,
or bottom of each day without moving the dates. Check the
[supported host width and responsive layout](../DESIGN.md#responsive-model)
before placing the calendar in a narrow sidebar.

## Events and event fetching

Pass an event array, or a function that loads events for the visible dates.
Use `setEvents()` to replace that input and `refetchEvents()` to reload it.
The application handles networking, authorization, filtering, recurrence
expansion, and caching.  See the [remote-data walkthrough](remote-data.md).

## Navigation and actions

Users can select days, follow event links, open application dialogs, and navigate
with the toolbar, keyboard, or optional swipe.  Day selection and event activation
are separate actions.  See [action and navigation contracts](api.md#control-the-calendar-calendar)
and [keyboard behavior](../ACCESSIBILITY.md#interaction-model).

## Localization and time zones

Locale controls how dates appear and which day starts the week. The calendar
still uses the Gregorian date model.

Event strings are civil dates or local date-times. Do not supply UTC/offset
timestamps as event strings. The `timeZone` option projects supplied `Date`
instants into a time zone. It never converts event strings.
See [date examples](getting-started.md#understand-event-dates).

## Custom toolbar, rendering, and styling

Use [Styling and customization](styling.md) to apply a theme, choose a content
slot, or distinguish event marker colors from interface colors.  The
[render-hook reference](api.md#customize-rendering-calendarrenderhooks) defines exact contracts.

## Optional first-party extensions

[WebMCP](webmcp.md) is an opt-in, experimental extension with a separate import.
The calendar works without it, including when the browser API is unavailable.
See [first-party extensions](api.md#configure-first-party-extensions) for composition and bundle behavior.

## Errors, state, and recovery

The calendar distinguishes empty data from failures and provides Retry for source
errors.  A failed same-range refresh can keep previously loaded events visible.
See [error handling](errors.md) before replacing its default presentation, or
[progressive enhancement](seo-and-progressive-enhancement.md) to coordinate
application-authored fallback content.

<a id="deliberate-alpha-boundaries"></a>

## Deliberate boundaries

Check these limits before choosing the package.

### Views and layout

The package does not provide:

- Week, day, time-grid, separate list, timeline, resource, year, or multi-month views.
- View switching or configurable grid duration.
- Hidden weekends, week numbers, business hours, background events, or a now indicator.
- Pre-rendered adjacent-month pager panels, carousel virtualization, or gesture-driven event prefetching.
- Resource scheduling, time-slot configuration, or event virtualization.
- Non-Gregorian calendar systems.

### Editing and event data

The package does not provide:

- Drag-and-drop, event resizing, or built-in event creation/editing.
- Per-event mutation methods or a general mutable-options API.
- Date-range or time-range selection.
- Recurrence or RRULE expansion.
- Multiple first-class event sources or built-in JSON/iCalendar/calendar-service feeds.
- Package-owned caching.

Expand recurring events into occurrences before returning the source snapshot.
Use the application source to aggregate, fetch, authorize, and cache events.

### Rendering and search

The package does not accept arbitrary HTML strings, per-event class names, or
arbitrary background/text/border style inputs. Use validated event URLs, trusted
render-hook nodes, and the documented built-in event marker color.

The package has no SSR renderer. It does not generate JSON-LD, canonical event
pages, or page metadata.
The application sets sitemap policy and makes search/privacy decisions.

### Extensions and packaging

WebMCP does not register automatically. The extension does not provide a remote
MCP server, declarative form or iframe tools, event activation, or editing tools.
It does not expose event IDs, URLs, metadata, render-hook content, or raw diagnostics.

The package supports official extension factories and stable consumer render
hooks. It does not support public third-party extension authoring. Any future
third-party lifecycle/capability contract will be explicit and lower stability.

There are no framework-specific wrappers, CommonJS output, polyfills, or
legacy-browser builds.

These boundaries keep the package focused on a responsive, accessible month grid
and agenda. They also keep its integration and security surface small.
