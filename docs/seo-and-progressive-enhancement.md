# SEO and progressive enhancement

litefold-calendar renders meaningful native client-side markup and can coordinate an application-owned no-JavaScript fallback. It does not render HTML on the server, create canonical pages, inject metadata, or determine whether event data may be indexed.

Optional [WebMCP site tools](webmcp.md) provide structured interaction to a compatible browser agent only after JavaScript runs. They do not make content server-rendered, crawlable, indexable, or available as a no-JavaScript fallback.

## What core renders

After a usable source snapshot commits, the calendar uses:

- Native `<a>` elements for events with validated URLs.
- Native `<button>` elements for callback-driven actions without URLs.
- Static text when no action is available.
- An ordered agenda list using `<ol>` and `<li>`.
- `<time datetime="...">` for day numbers and event times.
- An ARIA grid with one managed day proxy in the Tab sequence and event actions kept outside that proxy.

This improves document semantics, link behavior, keyboard support, and machine readability after JavaScript runs. It is not equivalent to server-rendered, crawlable event detail content.

`eventTimeDisplay` changes visual exposure, not this semantic output. A time suppressed from grid, agenda, or both remains a native `<time datetime>` value with visually hidden localized text and remains part of the event's accessible name. This improves consistency for assistive technology and client-side consumers, but it still does not make client-rendered content equivalent to canonical server markup.

## Provide a no-JavaScript fallback

Render useful application-owned HTML outside the calendar host, then pass that element through `fallbackElement`:

```html
<section aria-labelledby="schedule-heading">
	<h2 id="schedule-heading">Schedule</h2>

	<div id="calendar"></div>

	<div id="calendar-fallback">
		<p>Browse the current schedule:</p>
		<ol>
			<li>
				<a href="/events/design-review">
					Design review on <time datetime="2026-08-06">August 6, 2026</time>
				</a>
			</li>
		</ol>
	</div>
</section>
```

```js
const host = document.querySelector("#calendar");
const fallbackElement = document.querySelector("#calendar-fallback");

if (!(host instanceof HTMLElement) || !(fallbackElement instanceof HTMLElement)) {
	throw new Error("Calendar integration nodes were not found.");
}

const calendar = createCalendar(host, {
	events,
	fallbackElement
});

calendar.render();
```

The fallback must belong to the host document and remain outside the calendar host. One live calendar exclusively leases it.

## Fallback lifecycle

The [API reference owns the exact fallback lifecycle](api.md#application-integration-options), including lease admission, usable and degraded snapshots, application `hidden` mutations, Retry, failure, and destruction. This recipe relies on that contract rather than restating it.

Keep fallback content independently correct; the package does not reconcile or rewrite it. When fallback data changes, update it through the application's server or content workflow.

## Event URL policy

`CalendarEventInput.url` is optional. The package resolves it against the host document and accepts relative references or HTTP(S) URLs only when both the supplied value and resolved URL are no longer than 2,048 UTF-16 code units. Validation rejects empty or trim-altered input, control characters, embedded credentials, malformed URLs, and unsupported schemes. A bad URL rejects the entire source snapshot atomically. See the [canonical event URL contract](api.md#define-events-calendareventinput-and-calendarevent).

Use same-origin relative links when possible. The application remains responsible for authorization, privacy, canonical routing, destination security, and deciding whether a link may expose an event's existence.

For linked events, both grid and agenda representations are native anchors. `onEventActivate` may synchronously prevent navigation—for example, to open an application dialog—but should not do so unless a complete alternative is available. A context action that is unavailable for a link leaves the browser's native context menu intact. For an eligible non-link event with no activation callback, the context callback is the native button's only application action and therefore also runs on primary activation.

## Server and metadata responsibilities

Applications own:

- Canonical event and calendar URLs.
- Server-rendered headings, summaries, fallback lists, and detail pages.
- `<title>`, meta descriptions, robots directives, sitemaps, and canonical links.
- Structured data and rich-result eligibility.
- Authentication, authorization, tenant isolation, privacy, and retention.
- Avoiding sensitive event data in public markup, caches, logs, and search indexes.

Do not infer that an event URL should be public merely because the current user can see it. For private schedules, the correct SEO policy may be authenticated pages plus `noindex` and no public fallback content.

litefold-calendar deliberately does not emit JSON-LD. Rich-result schemas require product-specific policy and complete server context; generic automatic output would risk incorrect or private metadata.

## Verify progressive behavior

1. Load the page with JavaScript disabled and confirm the fallback is useful, ordered, linked where appropriate, and authorized.
2. Load with a slow source and confirm the fallback stays available until usable calendar data commits.
3. Exercise the fallback states required by the [canonical lifecycle](api.md#application-integration-options).
4. Inspect the rendered agenda for native `ol`/`li`/`time`/`a` semantics; repeat with each visual time mode and confirm hidden times remain semantic and accessible.
5. Confirm links work with ordinary navigation, new-tab commands, copy-link, and the native context menu.
6. Test keyboard and assistive-technology reading order across the server content, calendar grid, agenda, and fallback transition.
7. Validate canonical, metadata, robots, privacy, and structured-data decisions in the complete application.

See the [runnable progressive-enhancement fixture](../examples/progressive-enhancement/) for a generic implementation.
