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

Follow [Getting started](getting-started.md) for your first integration, then
[Remote data](remote-data.md) for an API.  The [examples guide](../examples/README.md)
includes runnable versions and an explicitly exhaustive advanced API showcase.

## Calendar display

The layout adapts to its container, not the viewport.  Choose equal-height or
content-sized weeks and top, center, or bottom event placement without moving
the dates.  Check the [supported host width and responsive layout](../DESIGN.md#responsive-model)
before placing it in a narrow sidebar.

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

Locale changes presentation and week conventions, not the Gregorian date model.
Event strings are civil dates or local date-times, not UTC/offset timestamps;
`timeZone` projects supplied `Date` instants but never converts event strings.
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

The package does not provide:

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
- Public third-party extension authoring. The package supports official extension factories and stable consumer render hooks; any future third-party lifecycle/capability contract will be explicit and lower stability.
- Framework-specific wrappers, CommonJS output, polyfills, or legacy-browser builds.
- Non-Gregorian calendar systems.

These boundaries keep the package focused on a responsive, accessible month-and-agenda component with a small integration and security surface.
