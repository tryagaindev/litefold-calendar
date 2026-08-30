# @tryagaindev/litefold-calendar

<p align="center">
	<img src="docs/assets/litefold-calendar-mark.svg" alt="" width="128" height="128">
</p>

Litefold Calendar is a mobile-first, responsive month calendar for applications that need fast date browsing and a focused selected-day agenda.  It is dependency-free, framework-agnostic, accessible, and designed for phone layouts, application sidebars, dashboards, portals, and wide desktop views.

Use Litefold Calendar when your product needs a polished month calendar without adopting a complete scheduling platform or maintaining separate mobile and desktop implementations.

> **Alpha:** Until the first stable release, npm's `alpha` and `latest` dist-tags intentionally select the same public prerelease, so an unqualified install also receives alpha software. Pin an exact version in production-like environments. Public API changes remain possible before `1.0.0` and will be documented in the changelog.

## Install

```sh
npm install @tryagaindev/litefold-calendar@alpha
```

The package is pure ESM, has no runtime dependencies, performs no package-owned network requests, and loads no remote assets.

## Bundle behavior

Litefold Calendar publishes side-effect-free ESM JavaScript for compatible bundlers. Unused root exports can be removed, and optional first-party extensions stay out of the application bundle when their explicit subpaths are not imported. The stylesheet is a separate, intentionally side-effectful import. Importing `createCalendar` includes the complete core calendar runtime; core features are not separate tree-shaking entry points.

A runtime condition around a static extension import controls activation, not bundle inclusion. Omit the subpath import or use an intentional dynamic import when an extension must stay outside a build. Tree shaking changes the consumer bundle, not the files present in the installed npm package. See [first-party extension bundle behavior](docs/first-party-extensions.md#bundle-and-import-behavior) for the complete boundary.

## Quick start

```html
<div data-my-calendar></div>
```

```js
import { createCalendar } from "@tryagaindev/litefold-calendar";
import "@tryagaindev/litefold-calendar/styles.css";

const host = document.querySelector("[data-my-calendar]");
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
			start: "2026-08-06T11:38",
			end: "2026-08-06T12:23"
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

Call `destroy()` when the calendar is permanently removed, such as during a component or router unmount. Litefold Calendar does not register a global page-lifecycle listener; a standalone page can use the shown non-cached `pagehide` cleanup while preserving the instance in the browser's back/forward cache.

## Why Litefold Calendar

* **Responsive by design:** One six-week month grid and selected-day agenda adapt from narrow application sidebars to wide desktop layouts.
* **Accessible interaction:** Keyboard navigation, native links and buttons, visible focus, reduced-motion support, forced-colors support, and increased-contrast support are part of the component contract.
* **Flexible data loading:** Use a static event array, fetch each visible range with `AbortSignal` support, or replace the event input without recreating the calendar.
* **Input-aware navigation:** Users can page months with touch, pen, mouse, keyboard, or precision scrolling.
* **Application-owned behavior:** Your application retains control over transport, caching, authorization, recurrence, routing, dialogs, editing, and other business rules.
* **Framework-agnostic integration:** Use Litefold Calendar with plain JavaScript, TypeScript, server-rendered applications, or a component framework.
* **Stable customization points:** Add typed metadata, custom toolbar content, render hooks, and scoped `--lfc-*` CSS tokens without depending on private DOM structure.
* **Optional components:** Import first-party extensions from explicit subpaths so unused capabilities, including WebMCP, stay outside the application module graph.

Litefold Calendar also supports all-day, timed, point, and multi-day events; inclusive date bounds; RTL layouts; safe relative and HTTP(S) links; atomic event validation; and SSR-safe module evaluation.

See [features and scope](docs/features.md) for the complete behavior contract.

New to the component vocabulary? See [calendar anatomy and color roles](docs/component-anatomy.md) for the names used by render hooks and styling guidance.

## Choose Litefold Calendar when

Litefold Calendar is a good fit for dashboards, portals, booking summaries, personal schedules, public event calendars, and mobile-oriented applications where users browse a month and work with one day's events.

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

The provider receives an inclusive-start, exclusive-end range covering the displayed 42-day grid.  Litefold Calendar validates each returned snapshot atomically, ignores stale responses, and leaves caching to the application.

Return an array for an immediate update: Litefold Calendar validates and renders it synchronously without a loading or busy phase. Return a Promise-like value—including `Promise.resolve(...)` or the result of an `async` function—to use a loading render followed by a terminal render.

Call `setEvents()` when a new static array or provider should replace the complete event input while preserving the displayed month, selection, focus context, and revealed agenda count.  Keep filter or cache state behind the same provider and use `refetchEvents()` when its identity does not change.  Locale, time-zone, date-bound, callback, and presentation changes still require a replacement calendar instance.

Basic month-calendar migrations generally require mapping existing event records to Litefold Calendar's event shape and connecting date or event activation callbacks to existing application behavior.  See the [application integration guide](docs/integration-guide.md) for event modeling, application-owned caching, actions, and UI coordination.

## Experimental WebMCP site tools

Import WebMCP only when the application needs it, then register the configured extension:

```ts
import { webMcp } from "@tryagaindev/litefold-calendar/extensions/webmcp";

const calendar = createCalendar(host, {
	events,
	extensions: [
		webMcp({ toolNamePrefix: "my-schedule" })
	]
});
```

The extension lets a compatible browser agent page through events available in the currently loaded visible range, optionally filter one date, and navigate the rendered instance. `webMcp()` defaults to the prefix `"litefold-calendar"`; provide an explicit stable prefix when multiple calendars share one document because tool names are document-wide. Omitting the extension subpath import keeps its implementation out of the application import graph, and an unsupported experimental browser API remains a progressive no-op.

WebMCP support does not add a remote MCP server, event editing, event activation, or another authorization path. Review the [first-party extension model](docs/first-party-extensions.md) and the exact tools, privacy boundary, compatibility snapshot, and test procedure in the [WebMCP site-tool guide](docs/webmcp.md) before enabling it for private schedules.

## Screenshots

![Desktop advanced calendar example](docs/screenshots/desktop-month-grid-1440x900.png)

*Desktop: filters, event actions, and overflow.*

![Mobile dark-theme calendar example](docs/screenshots/mobile-month-agenda-dark-390x844.png)

*Mobile: compact event markers and social-style overflow counts.*

<details>
<summary>More screenshots</summary>

![Month and year picker](docs/screenshots/month-year-jump-1280x800.png)

![Mobile calendar touch paging](docs/screenshots/mobile-month-swipe-pull-390x844.png)

![Event details dialog](docs/screenshots/event-details-dark-1280x800.png)

![Keyboard focus on an event action](docs/screenshots/grid-event-keyboard-focus-1440x900.png)

</details>

Contributors updating these assets can use the [screenshot guide](docs/screenshots/README.md) for capture and verification instructions.

## Examples

Browse the [hosted demo](https://tryagaindev.github.io/litefold-calendar/), then choose a framework-free scenario:

* [Basic JavaScript](examples/basic/) — a minimal static-data integration.
* [Advanced TypeScript](examples/advanced/) — typed options, callbacks, consumer render hooks, an optional extension, and customization.
* [Async errors](examples/async-errors/) — asynchronous loading, retained data, Retry, and application-owned failures.
* [Classic-script loader](examples/classic-script/) — a classic entry script that loads the ESM package.
* [FullCalendar v6 migration](examples/fullcalendar-v6-migration/) — a focused `dayGridMonth` rewrite recipe.
* [Progressive enhancement](examples/progressive-enhancement/) — server-authored fallback markup coordinated with the client calendar.

The [examples guide](examples/) explains the recipes and, for contributors, how to run and validate them. The hosted demo identifies its package version and source commit.

## Documentation

Use the [documentation hub](docs/README.md) as the complete task-oriented index for integration, accessibility, design, support, contribution, security, and release guidance. User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)

## Contributing

Working in this repository? Read the [contributor guide](CONTRIBUTING.md), then use the [common contributor commands](CONTRIBUTOR_COMMANDS.md) as copyable commands or run them from a supported Markdown-aware IDE.
