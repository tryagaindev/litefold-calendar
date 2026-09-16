# Getting started

Render a month calendar, replace its local events, and release it during teardown.
Your application supplies the events and owns editing, permissions, routing, and
dialogs.  Check [features and scope](features.md) and
[browser requirements](browser-support.md#minimum-browser-versions) when evaluating fit.

## Install and render

This tutorial assumes an existing application with an npm-aware build tool that
resolves JavaScript package imports and CSS imports.  No TypeScript or framework
wrapper is required.  For a page without a bundler, use the
[classic-script recipe](integration-guide.md#classic-script-entry-point) instead.

Install the current prerelease channel:

```sh
npm install @tryagaindev/litefold-calendar@nightly
```

Install `@nightly` explicitly; `latest` is not the current development channel.
Pin an exact version for reproducible deployments, and review the
[changelog](../CHANGELOG.md) before upgrading.

Add the host to your page:

```html
<div data-my-calendar></div>
```

Run this client-side entry point after the host exists.  Import the stylesheet as
well as the JavaScript module.  The module is safe to import on a server, but the
calendar itself renders only on the client.

**Dates first:** event strings accept dates or local date-times, not timestamps
with `Z` or UTC offsets.  Convert instants into your chosen time zone before
mapping them; removing a suffix does not perform a conversion.  Event ends are
exclusive; the [examples below](#understand-event-dates) show what that means.

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
			start: "2026-08-06"
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

You should see August 2026 with August 6 selected and both events in its agenda.
The fixed date keeps the example visible whenever you run it; replace it with
an application date, or omit `initialDate` to start from today.  A compact day
with multiple events shows a total-count button by default; activating it opens
that day's agenda.

For a component or router, call `calendar.destroy()` from its permanent unmount
handler instead of relying on page cleanup.  The standalone handler above skips
cached `pagehide` events so back/forward navigation can restore a live calendar.

## Understand event dates

| Input | Meaning |
| --- | --- |
| `start: "2026-08-06"` | All-day event on August 6; no end is required. |
| `start: "2026-08-06", end: "2026-08-08"` | All-day event on August 6 and 7, **not** August 8. |
| `start: "2026-08-06T11:38", end: "2026-08-06T12:23"` | A timed event expressed as local calendar values. |
| `start: "2026-08-06T11:38"` | A point event; the package does not infer an end time. |
| `start: "2026-08-06T18:38:00Z"` | Rejected as an event string.  Convert the instant before mapping it. |

Use a unique ID and a nonempty title for each event.  An explicit end must use
the same date-only or date-time kind as its start and must be later.  Setting
`timeZone` does not convert event strings; it projects `Date` inputs used for
navigation and date bounds.  See the [date contract](api.md#accepted-civil-values)
for the complete grammar and edge cases.

## Replace local events

After rendering, pass a complete new snapshot rather than mutating the original
array.  This replaces all events while preserving the displayed month and selection:

```js
calendar.setEvents([
	{
		id: "team-planning",
		title: "Updated team planning",
		start: "2026-08-06"
	}
]);
```

The design-review event is now removed.  Pass `[]` to show an empty result.
For a remote provider, use `refetchEvents()` after changing filters or saving;
passing an array to `setEvents()` replaces that provider.  Continue with
[remote data](remote-data.md) when connecting an API.

## Avoid common integration mistakes

For a blank or unstyled calendar, check that the host exists, `render()` ran,
and the stylesheet was imported.  Keep the host within the
[supported design width](../DESIGN.md#responsive-model).

Remote requests cover the visible six-week grid with an inclusive `start` and
exclusive `end`, not just the named month.  Return `[]` only for a successful
empty result; let failures reach the calendar's Retry UI.  See
[empty and error states](remote-data.md#4-keep-empty-and-error-states-distinct).

## Add the next capability

| Task | Continue with |
| --- | --- |
| Load an API, change filters, or refresh after saving | [Remote-data walkthrough](remote-data.md) |
| Show day counts or open your own event chooser | [Event counts](integration-guide.md#choose-event-counts) and [dialogs](integration-guide.md#own-the-event-chooser) |
| Keep useful content before JavaScript runs | [Progressive enhancement](seo-and-progressive-enhancement.md) |
| Apply a theme or add custom visual content | [Styling and customization](styling.md) |
| Add typed adapters or caching | [Application integration](integration-guide.md) |
| Look up a signature, default, or lifecycle rule | [API reference](api.md) |

For repository-hosted versions of these patterns, use the
[examples guide](../examples/README.md).  Other topics are in the
[documentation hub](README.md).
