# Progressive enhancement example

Run `npm run demo` from the repository root, then choose **Enhance server-rendered HTML** from the examples landing page. Disable JavaScript once to verify that the schedule still works on its own. With JavaScript enabled, use the rebuild buttons to compare successful and failed initial loads.

This static fixture stands in for HTML rendered by an application server. The fallback contains a heading, an ordered event list, native links, and `<time datetime>` values. The JavaScript-only controls start with `hidden`, so a no-JavaScript visitor gets useful content instead of inactive buttons or a permanent loading message.

## Integration pattern

Keep the fallback outside the calendar host, then pass that element to `createCalendar`:

```js
const calendar = createCalendar(host, {
	events,
	fallbackElement
});

calendar.render();
```

Use separate sibling elements, as this fixture does. The fallback must be in the same document as the host, and neither element may contain the other. In particular, `render()` owns and replaces the host's children.

## Fallback lifecycle

1. Construction and this recipe's pending PromiseLike source leave the fallback's original `hidden` state unchanged.
2. The first usable snapshot hides the fallback. A successful empty snapshot still counts as usable.
3. A failed first load restores the original state. In this fixture, each rebuild calls `destroy()` first, which also restores the fallback before the next request starts.
4. A later failed refresh with retained usable data keeps the fallback hidden; the calendar continues showing its retained snapshot.

A direct array source has no loading phase: its terminal fallback decision and single DOM render complete before `render()` or `setEvents()` returns. Any PromiseLike—including an already-fulfilled one—retains the fallback while its loading render is current and settles it with the terminal render.

Litefold Calendar changes only the fallback's `hidden` property; it never rewrites the fallback content. It also avoids overwriting an application change to that property. See [`fallbackElement` in the API reference](../../docs/api.md#application-integration-options) for the exact lease and restoration rules.

The failure button demonstrates application-owned source-error text. Returning `"handled"` from `onError` prevents duplicate package-owned error presentation; the [async-errors example](../async-errors/) compares both presentation models and retry behavior.

The linked event verifies that path, query, and fragment values remain native anchors in the grid and agenda. The release-window event has no URL or action callback, so Litefold Calendar renders it as static content.

## Production responsibilities

Litefold Calendar coordinates the fallback but does not render HTML on the server. The application still owns fallback freshness, canonical URLs, page metadata, privacy and authorization decisions, and any structured data. This generic example intentionally emits no JSON-LD; see the [SEO and progressive-enhancement guide](../../docs/seo-and-progressive-enhancement.md) for production guidance.

Browse the source: [HTML](index.html), [JavaScript](main.js), and [shared example CSS](../example.css). The relative `dist/` imports are repository-only wiring; installed applications should import `@tryagaindev/litefold-calendar` and `@tryagaindev/litefold-calendar/styles.css`.
