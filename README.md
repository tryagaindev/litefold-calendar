# @tryagaindev/litefold-calendar

<p align="center">
	<img src="docs/assets/litefold-calendar-mark.svg" alt="" width="128" height="128">
</p>

Litefold Calendar is a mobile-first, responsive month calendar for applications that need fast date browsing and a focused selected-day agenda.  It is dependency-free, framework-agnostic, accessible, and designed for phone layouts, application sidebars, dashboards, portals, and wide desktop views.

Use Litefold when your product needs a polished month calendar without adopting a complete scheduling platform or maintaining separate mobile and desktop implementations.

> **Alpha:** The current public prerelease is published under npm's `alpha` dist-tag.  Pin an exact version in production-like environments.  Public API changes remain possible before `1.0.0` and will be documented in the changelog.

## Install

```sh
npm install @tryagaindev/litefold-calendar@alpha
```

The package is pure ESM, has no runtime dependencies, performs no package-owned network requests, and loads no remote assets.

Give the calendar host a border-box inline size of at least **320 CSS pixels**. Narrower layouts degrade gracefully but are not officially supported.

## Quick start

```html
<div data-calendar></div>
```

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";

const host = document.querySelector("[data-calendar]");
if (!(host instanceof HTMLElement)) {
	throw new Error("Calendar host was not found.");
}

const calendar = createCalendar(host, {
	initialDate: "2026-08-06",
	events: [
		{
			id: "release-window",
			title: "Alpha release window",
			start: "2026-08-06",
			url: "/events/release-window"
		},
		{
			id: "design-review",
			title: "Calendar design review",
			start: "2026-08-06T09:30",
			end: "2026-08-06T10:15"
		}
	]
});

calendar.render();

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		calendar.destroy();
	}
});
```

Call `destroy()` when the calendar is permanently removed, such as during a component or router unmount. A standalone page should preserve the instance when it enters the browser's back/forward cache, as shown above.

## Why Litefold

* **Responsive by design:** One six-week month grid and selected-day agenda adapt from narrow application sidebars to wide desktop layouts.
* **Accessible interaction:** Keyboard navigation, native links and buttons, visible focus, reduced-motion support, forced-colors support, and increased-contrast support are part of the component contract.
* **Flexible data loading:** Use a static event array, fetch each visible range with `AbortSignal` support, or replace the event input without recreating the calendar.
* **Input-aware navigation:** Users can page months with touch, pen, mouse, keyboard, or precision scrolling.
* **Application-owned behavior:** Your application retains control over transport, caching, authorization, recurrence, routing, dialogs, editing, and other business rules.
* **Framework-agnostic integration:** Use Litefold with plain JavaScript, TypeScript, server-rendered applications, or a component framework.
* **Stable customization points:** Add typed metadata, custom toolbar content, render hooks, and scoped `--lfc-*` CSS tokens without depending on private DOM structure.
* **Optional components:** Import first-party extensions from explicit subpaths so unused capabilities, including WebMCP, stay outside the application module graph.

Litefold also supports all-day, timed, point, and multi-day events; inclusive date bounds; RTL layouts; safe relative and HTTP(S) links; atomic event validation; and SSR-safe module evaluation.

See [features and scope](docs/features.md) for the complete behavior contract.

## Choose Litefold when

Litefold is a good fit for dashboards, portals, booking summaries, personal schedules, public event calendars, and mobile-oriented applications where users browse a month and work with one day's events.

Choose a broader scheduling platform when you need resource scheduling, time-grid views, recurrence processing, interactive range selection, or drag-and-drop editing.

## Load events for the visible range

Use an event provider when events depend on the displayed month, authenticated user, or application filters:

```ts
const calendar = createCalendar(host, {
	events: async ({ start, end, signal }) => {
		const response = await fetch(`/api/events?start=${start}&end=${end}`, {
			signal
		});

		if (!response.ok) {
			throw new Error(`Event request failed with ${response.status}.`);
		}

		return response.json();
	}
});
```

The provider receives an inclusive-start, exclusive-end range covering the displayed 42-day grid.  Litefold validates each returned snapshot atomically, ignores stale responses, and leaves caching to the application.

Call `setEvents()` when a new static array or provider should replace the complete event input while preserving the displayed month, selection, focus context, and revealed agenda count.  Keep filter or cache state behind the same provider and use `refetchEvents()` when its identity does not change.  Locale, time-zone, date-bound, callback, and presentation changes still require a replacement calendar instance.

Basic month-calendar migrations generally require mapping existing event records to Litefold's event shape and connecting date or event activation callbacks to existing application behavior.  See the [application integration guide](docs/integration-guide.md) for event modeling, application-owned caching, actions, and UI coordination.

## Experimental WebMCP site tools

Import WebMCP only when the application needs it, then register the configured extension:

```ts
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";

const calendar = createCalendar(host, {
	events,
	extensions: [
		webMcp({ toolNamePrefix: "team-schedule" })
	]
});
```

The extension lets a compatible browser agent page through events available in the currently loaded visible range, optionally filter one date, and navigate the rendered instance. `webMcp()` defaults to the prefix `"litefold-calendar"`; provide an explicit stable prefix when multiple calendars share one document because tool names are document-wide. Omitting the extension subpath import keeps its implementation out of the application import graph, and an unsupported experimental browser API remains a progressive no-op.

WebMCP support does not add a remote MCP server, event editing, event activation, or another authorization path. Review the [first-party extension model](docs/first-party-extensions.md) and the exact tools, privacy boundary, compatibility snapshot, and test procedure in the [WebMCP site-tool guide](docs/webmcp.md) before enabling it for private schedules.

## Screenshots

![Wide litefold-calendar month grid with category filters, direct event actions, and overflow](docs/screenshots/desktop-month-grid-1440x900.png)

*Desktop (1440 × 900): the advanced TypeScript showcase with category filters, direct actions, and grid overflow.*

![Mobile dark-theme litefold-calendar with compact navigation, custom event marker, three-layer event-slip fan, and selected-day agenda](docs/screenshots/mobile-month-agenda-dark-390x844.png)

*Mobile (390 × 844): the compact dark-theme grid with a custom marker, default three-layer event-slip fan, and selected-day agenda.*

<details>
<summary>View month picker, touch paging, dialog, and keyboard-focus screenshots</summary>

![Native month and year jump popover over a bounded litefold-calendar month](docs/screenshots/month-year-jump-1280x800.png)

![Mobile litefold-calendar held partway through a horizontal touch swipe, revealing the adjacent month snap affordance](docs/screenshots/mobile-month-swipe-pull-390x844.png)

![Dark-theme event details dialog opened from a litefold-calendar agenda action](docs/screenshots/event-details-dark-1280x800.png)

![Visible keyboard focus on a litefold-calendar grid event action](docs/screenshots/grid-event-keyboard-focus-1440x900.png)

</details>

The [screenshot gallery and capture contract](docs/screenshots/README.md) also covers the month/year picker, touch paging, application-owned event dialog, and keyboard focus.

## Examples

Browse the [GitHub Pages developer demo](https://tryagaindev.github.io/litefold-calendar/), or run the examples from this repository:

```sh
npm ci --ignore-scripts
npm run demo
```

Open the printed `/examples/` URL and choose a framework-free scenario:

* [Basic JavaScript](examples/basic/) — a minimal static-data integration.
* [Advanced TypeScript](examples/advanced/) — typed options, callbacks, consumer render hooks, an optional extension, and customization.
* [Async errors](examples/async-errors/) — asynchronous loading, retained data, Retry, and application-owned failures.
* [Classic-script loader](examples/classic-script/) — a classic entry script that loads the ESM package.
* [FullCalendar v6 migration](examples/fullcalendar-v6-migration/) — a focused `dayGridMonth` rewrite recipe.
* [Progressive enhancement](examples/progressive-enhancement/) — server-authored fallback markup coordinated with the client calendar.

The [examples landing page and coverage guide](examples/) explains how the recipes, smoke checks, browser tests, and clean-package consumer tests work together. The hosted demo identifies its package version and source commit; see the [static example deployment guide](docs/example-deployment.md) for the rolling and immutable URL contract.

## Development

The supported development toolchain is Node 24 with the npm version pinned by `packageManager`.

```sh
npm ci --ignore-scripts
npx --no-install playwright install chromium
npm run check
```

See the [coding conventions](docs/code-style.md) for source, test, and documentation guidance.

## Documentation

Use the [documentation hub](docs/README.md) as the complete task-oriented index for integration, accessibility, design, support, contribution, security, and release guidance. User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
