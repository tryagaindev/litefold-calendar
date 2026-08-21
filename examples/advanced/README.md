# Advanced TypeScript example

Start with the [basic example](../basic/) when a calendar only needs local events and activation. This is the repository's deterministic, successful-path feature showcase: it exercises every public runtime surface in one place while remaining an integration reference that can be inspected in a browser.

- A synchronous, range-aware `CalendarEventSource` with typed metadata, application-owned caching, category filters, and abort checks.
- All-day, timed, timed-point, and multi-day events, plus grid overflow, agenda paging, and the agenda DOM cap.
- Every `CalendarOptions` property, including agenda-only visual times, inclusive `minDate` / `maxDate` bounds, localization, a Monday week start, a deterministic clock and time zone, custom messages and icons, source/render limits, native pull/snap paging, a toolbar node, a progressive fallback element, announcements, state, and all action callbacks.
- The package-owned native month/year jump popover, with bounded fields, custom labels, trigger-focus restoration after Jump, Cancel, and Escape, and outside-focus preservation on pointer light-dismiss.
- A provider record just beyond `maxDate`, proving the source still receives one complete committed 42-day range while the out-of-range day and its summary remain unavailable and pager pulls do not prefetch.
- External controls for every public `Calendar` method. Startup and `pagehide` cover `render()` and `destroy()`; visible controls cover navigation, focus, state, and refetching.
- Native target-date validation mirrors the configured inclusive bounds, and an application-boundary `LitefoldCalendarError` catch keeps user-driven public method misuse out of DOM event error channels.
- Every `CalendarExtension` hook, including the no-output `renderDayBadge` path, day and event mount cleanup, lifecycle abort signals, `isCurrentMonth` / `isSelected` / `isToday` day-state context, localized `timeText`, marker replacement and suppression, and leading/details/trailing event slots.
- Native links for URL events and native buttons for callback-only events on both grid and agenda surfaces. URL activation prevents navigation synchronously before the asynchronous application-owned details dialog opens.
- Managed grid-event keyboard entry with <kbd>F2</kbd>, bounded <kbd>Up</kbd>/<kbd>Down</kbd> movement, and <kbd>Escape</kbd>/<kbd>F2</kbd> return to the day proxy. Direct event activation never selects its day.
- A synchronous `isEventContextMenuAvailable` predicate that enables application context actions only for appointments while ineligible links keep their browser-native context menu.
- Pointer/keyboard context actions, an RTL toggle, and light/dark/system theme controls.
- Touch/pen and horizontal precision-scroll month paging through decorative, accessibility-hidden lanes, with RTL mapping and native navigation fallbacks; exact scroll physics remain browser-owned.
- A visible inspector for every `CalendarState` field and centralized polite/assertive live regions for `onAnnounce`.
- All documented `--lfc-*` tokens mapped through application theme values, including compact day density, event-row sizing, relative grid type, and the shared leading-accent width.

The example sets `eventTimeDisplay: "agenda"`: grid summaries remain compact while the selected-day agenda exposes localized times. Inspecting either surface still shows native time elements and the extension receives the same localized `timeText`. Responsive placement comes only from the package stylesheet and application token values; the fixture has no viewport listener, layout observer, breakpoint-driven DOM code, or pager script. Built-in focus order remains Previous, Next, month title, Today before the example's filter toolbar, even when compact rows split at `42rem` and `20rem`.

The visible Schedule note calls out the configured July 15, 2026 through September 15, 2027 range and points to the underlined month/year trigger, so both bounded month and cross-year jumps are discoverable without reading the source first.

The server-like fallback schedule is outside the calendar host. It remains unchanged during the first load, hides after the first usable snapshot, and returns to its original visible state when the calendar is destroyed.

The `CompleteCalendarOptions`, `CompleteCalendarExtension`, and `calendarMethods` maps intentionally cover their public keys exhaustively. Adding a future option, method, or extension hook makes example typechecking fail until the new behavior is assigned a scenario. The smoke fixture also derives the stable CSS-token set from the package stylesheet and requires this theme to map every token.

`EventData` belongs to this example, not litefold-calendar. Metadata is optional; omit it entirely when no application-specific data must reach event callbacks or extensions.

All `data-example-*` attributes are application-owned selectors used only by this fixture. The package claims `.litefold-calendar` and the presence-only `data-litefold-calendar` root marker; internal `data-lfc-*` attributes are not integration hooks.

From the repository root:

```sh
npm run build
```

Serve the repository root over HTTP and open `examples/advanced/`. The standard build emits both the package and this example's `main.js`; no extra TypeScript command, CDN, or runtime dependency is required. The generated module is intentionally ignored by Git and removed by `npm run clean`.

Run `npm run test:examples` for the repository's DOM-only JSDOM smoke test. It builds the package, compiles this example to `examples/advanced/main.js`, and verifies root ownership, inclusive bounds, the month/year jump popover, complete 42-day provider ranges, one-current-range pager structure, limits and paging, localization, state, all actions and methods, all extension hooks and cleanup, live announcements, RTL/theme controls, dialog activation, and teardown. The same command exercises the basic, async-error, migration, and progressive-enhancement examples. It does not use Playwright or download a browser, so it cannot validate native scroll momentum, snap timing, or input-device behavior.

The dialog is outside the calendar host because rendering owns that host's children. It uses the native `<dialog>` top layer and an explicit close action; the calendar package itself does not create or style application modals.

The six README screenshots use deterministic states from this fixture: the light desktop grid at 1440 by 900; the open month/year picker in the September 2027 upper-boundary month at 1280 by 800; the settled dark compact navigation, grid, and agenda at 390 by 844; the held native month pull at 390 by 844; the dark application-owned event dialog at 1280 by 800; and keyboard focus on a grid event action at 1440 by 900.

Browse the source: [TypeScript](main.ts), [HTML](index.html), and [theme CSS](theme.css).

Next: use the [application integration guide](../../docs/integration-guide.md) to adapt these patterns or the [error guide](../../docs/errors.md) for source, validation, action, extension, and presentation-failure scenarios.
