# @tryagaindev/litefold-calendar

Litefold Calendar is a mobile-first, responsive month calendar for applications that need fast date browsing and a focused selected-day agenda.  It is dependency-free, framework-agnostic, accessible, and designed for phone layouts, application sidebars, dashboards, portals, and wide desktop views.

Use Litefold when your product needs a polished month calendar without adopting a complete scheduling platform or maintaining separate mobile and desktop implementations.

> **Alpha:** `0.2.0-alpha.0` is the planned public prerelease.  After publication, install the `alpha` dist-tag and pin an exact version in production-like environments.  Public API changes remain possible before `1.0.0` and will be documented in the changelog.

## Install

```sh
npm install @tryagaindev/litefold-calendar@alpha
```

The package is pure ESM, has no runtime dependencies, performs no package-owned network requests, and loads no remote assets.

## Run the examples locally

After installing this repository's development dependencies, build and serve every example with one command:

```sh
npm run demo
```

Open the printed `/examples/` URL.  The command builds the distributable package and generated example assets, then starts the repository's loopback-only server.  The server exposes only `dist/` and `examples/`, applies restrictive security headers, and does not load remote runtime assets.

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

window.addEventListener("pagehide", () => {
	calendar.destroy();
}, { once: true });
```

Call `destroy()` when the calendar is permanently removed from the page.

## Why Litefold

* **Mobile-first layout:** A responsive six-week month grid works alongside a selected-day agenda, keeping events usable when grid cells become compact.
* **Focused interaction:** Users can browse months, select dates, and activate events without leaving the current calendar context.
* **Flexible event loading:** Provide static events, load an abort-aware asynchronous snapshot for the visible range, or replace the complete event input without recreating the calendar.
* **Accessible by default:** Keyboard navigation, native links and buttons, visible focus, reduced-motion support, forced-colors support, and increased-contrast support are part of the interaction contract.
* **Input-aware navigation:** Month paging supports touch, pen, mouse, keyboard, and precision scrolling.
* **Application-owned behavior:** Your application retains control over data transport, caching, authorization, recurrence, routing, dialogs, editing, and business rules.
* **Framework-agnostic:** Use Litefold with plain JavaScript, TypeScript, server-rendered applications, or a component framework.
* **Customizable without lock-in:** Typed metadata, render hooks, lifecycle extensions, toolbar content, and scoped `--lfc-*` CSS tokens provide stable integration points.

Litefold also supports all-day, timed, point, and multi-day events; inclusive date bounds; RTL layouts; safe relative and HTTP(S) links; atomic event validation; and SSR-safe module evaluation.

See [features and scope](docs/features.md) for the complete behavior contract.

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

## Screenshots

![Wide litefold-calendar month grid with category filters, direct event actions, and overflow](docs/screenshots/desktop-month-grid-1440x900.png)

*Desktop (1440 × 900): the advanced TypeScript showcase with category filters, direct actions, and grid overflow.*

![Native month and year jump popover over a bounded litefold-calendar month](docs/screenshots/month-year-jump-1280x800.png)

*Month/year jump (1280 × 800): the native light-dismiss popover over a bounded month.*

![Mobile dark-theme litefold-calendar with compact navigation, month grid, actionable marker, and selected-day agenda](docs/screenshots/mobile-month-agenda-dark-390x844.png)

*Mobile (390 × 844): the compact dark-theme grid and selected-day agenda.*

![Mobile litefold-calendar held partway through a horizontal touch swipe, revealing the adjacent month snap affordance](docs/screenshots/mobile-month-swipe-pull-390x844.png)

*Native month pull (390 × 844): the adjacent decorative lane during a held touch gesture.*

![Dark-theme event details dialog opened from a litefold-calendar agenda action](docs/screenshots/event-details-dark-1280x800.png)

*Event details (1280 × 800): an application-owned dialog opened from an agenda action.*

![Visible keyboard focus on a litefold-calendar grid event action](docs/screenshots/grid-event-keyboard-focus-1440x900.png)

*Grid event focus (1440 × 900): F2 entered the selected date's event actions.*

Additional interaction scenes and their capture rules are documented in the [screenshot contract](docs/screenshots/README.md).

## Is Litefold the right fit?

Litefold is designed for dashboards, portals, booking summaries, personal schedules, public event calendars, and mobile-oriented applications where users primarily browse a month and work with one day's events.

It is intentionally focused on month browsing and selected-day agendas.  Applications requiring resource scheduling, time-grid views, recurrence processing, interactive range selection, or drag-and-drop event editing should use a broader scheduling platform.

## Examples

Use `npm run demo` and choose a scenario from the framework-free examples landing page:

* [Basic JavaScript](examples/basic/) — a minimal static-data integration.
* [Advanced TypeScript](examples/advanced/) — typed options, callbacks, extensions, and customization.
* [Async errors](examples/async-errors/) — asynchronous loading, retained data, Retry, and application-owned failures.
* [Classic-script loader](examples/classic-script/) — a classic entry script that loads the ESM package.
* [FullCalendar v6 migration](examples/fullcalendar-v6-migration/) — a focused `dayGridMonth` rewrite recipe.
* [Progressive enhancement](examples/progressive-enhancement/) — server-authored fallback markup coordinated with the client calendar.

The [examples landing page and coverage guide](examples/) explain how the recipes, smoke checks, browser tests, and clean-package consumer tests work together.

GitHub Pages keeps a clearly labeled rolling `main` preview beside immutable, version-specific release demos.  Every deployed example shows its package version, full source commit, and deployment channel; see the [static example deployment guide](docs/example-deployment.md) for URLs, authority boundaries, rollback, and stale-deployment checks.

## Development

The supported development toolchain is Node 24 with the npm version pinned by `packageManager`.

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run check
```

See the [coding conventions](docs/code-style.md) for source, test, and documentation guidance.

## Documentation

* [Features and alpha scope](docs/features.md)
* [Public API reference](docs/api.md)
* [Application integration guide](docs/integration-guide.md)
* [Accessibility guidance](ACCESSIBILITY.md)
* [Documentation hub](docs/README.md)

Support expectations are documented in [SUPPORT.md](SUPPORT.md).  User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
