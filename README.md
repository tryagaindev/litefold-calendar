# @tryagaindev/litefold-calendar

<p align="center">
	<img src="docs/assets/litefold-calendar-mark.svg" alt="" width="128" height="128">
</p>

Litefold Calendar is a mobile-first, responsive month calendar for applications that need fast date browsing and a focused selected-day agenda.  It is dependency-free, framework-agnostic, accessible, and designed for phone layouts, application sidebars, dashboards, portals, and wide desktop views.

Use Litefold Calendar when your product needs a polished month calendar without adopting a complete scheduling platform or maintaining separate mobile and desktop implementations.

> **Prerelease:** The `nightly` channel contains validated snapshots of `main`. Nightly publication leaves `latest` on the frozen historical alpha; the first stable release will move `latest` to stable, and stable releases will own it afterward. Install `@nightly` explicitly or pin an exact version for reproducible deployments. Public API changes remain possible before `1.0.0` and are recorded in the changelog. Existing alpha releases remain available by exact version.

## Install

```sh
npm install @tryagaindev/litefold-calendar@nightly
```

The package is pure ESM and has no runtime dependencies. The example below assumes an npm-aware build tool that resolves bare module specifiers and CSS imports. For a page without a bundler, use the [classic-script entry-point recipe](docs/integration-guide.md#classic-script-entry-point).

## First render

Event strings are calendar dates or local date-times, **not timestamps with `Z`
or UTC offsets**.  Convert API instants into your application's chosen time zone
before passing them in; do not simply remove the suffix.  Explicit event ends
are exclusive.  See the [date examples](docs/getting-started.md#understand-event-dates).

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
			id: "team-planning",
			title: "Team planning",
			start: "2026-08-06",
			url: "/events/team-planning"
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

Call `destroy()` when the calendar is permanently removed, such as during a component or router unmount. A standalone page can use the shown non-cached `pagehide` cleanup while preserving the instance in the browser's back/forward cache.

The module can be evaluated in a server environment without accessing the DOM, but Litefold Calendar does not provide server-side rendering. Create and render the calendar on the client.

## Is it a fit?

Litefold Calendar focuses on a responsive six-week month grid and selected-day agenda. The application owns transport, caching, authorization, recurrence expansion, routing, dialogs, and editing. Choose a broader scheduling platform when you need time-grid or resource views, date-range selection, recurrence processing, or drag-and-drop editing.

Review the [complete features and scope](docs/features.md) and [browser support policy](docs/browser-support.md) before adoption.

## Preview

![Desktop advanced calendar example](docs/screenshots/desktop-month-grid-1440x900.png)

*Wide month grid with direct event actions and overflow.*

![Mobile dark-theme calendar example](docs/screenshots/mobile-month-agenda-dark-390x844.png)

*Compact dark layout with the selected-day agenda.*

Try the [hosted demo](https://tryagaindev.github.io/litefold-calendar/) or review the [full canonical screenshot gallery](docs/screenshots/README.md#reference-gallery).

## Next steps

- New integration: follow [Getting started](docs/getting-started.md) to render, replace local events, and clean up.
- Already rendering: connect an API, filters, and refresh with the [remote-data walkthrough](docs/remote-data.md).
- Need a specific capability: find a task in the [documentation hub](docs/README.md) or a runnable recipe in the [examples guide](examples/README.md).
- Upgrading or troubleshooting: check [release notes](CHANGELOG.md) and [support routes](SUPPORT.md).

## License

[MIT](LICENSE)

## Contributing

Working in this repository? Start with the [contributor guide](CONTRIBUTING.md).
