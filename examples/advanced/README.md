# Advanced TypeScript example

This example combines range loading, typed metadata, render hooks, application controls, observable state, fallback content, and WebMCP. Start with the [basic example](../basic/) when a static event array and activation callback are enough.

## Run it

Follow the shared [local run instructions](../README.md#run-locally), then choose **Exercise the complete API**.

## Read the example in this order

1. [`index.html`](index.html) defines the progressive fallback, application controls, calendar host, state output, and event-details dialog.
2. [`main.ts`](main.ts) adapts application records, implements the range-aware source, defines hooks and options, then connects the surrounding controls.
3. [`theme.css`](theme.css) maps public CSS tokens and styles only application-owned hook output.

In the browser, try these paths:

1. Change the target date, then compare **Show its month** with **Select and focus it**. The first projects a `Date` instant through `timeZone`; the second passes an exact civil-date string.
2. Toggle event categories. The application changes its own filter state, then calls `refetchEvents()`.
3. Activate an event to inspect typed metadata in the application-owned dialog. From a selected day, press <kbd>F2</kbd> to enter grid-event actions.
4. Compare **Immediate array** with **Controlled PromiseLike**, then complete the pending request to observe their different loading-state behavior.
5. Choose **Replace event source** to exercise `setEvents()`. Changing **Source timing** restores the original provider with the selected timing.
6. Change theme or text direction and compare visible output with **Observe state and actions**.

## Patterns worth reusing

- `CalendarEventSource<EventData>` receives the complete visible range and its `AbortSignal`. The application rejects aborted work and exposes only the current pending request for completion.
- The application owns filtering and `rawRangeCache`; changing either does not affect the calendar until `refetchEvents()` is called.
- `onStateChange`, the host's public `aria-busy` state, and `dayDidMount` drive application-owned observation without reading private DOM.
- The unified `renderEventOverflow` hook branches on its compact/wide discriminant without measuring the container. It uses package-formatted text or returns application-owned DOM while package CSS chooses the applicable responsive presentation.
- `eventDidMount` returns cleanup that remains safe when its signal aborts.
- `fallbackElement` keeps useful schedule content available until a usable event snapshot commits.
- The dialog and external live regions remain application-owned; callbacks provide the data and native event context.
- WebMCP is opt-in through `extensions: [webMcp({ toolNamePrefix: "my-schedule" })]`. Review the [first-party extension guide](../../docs/first-party-extensions.md) and [WebMCP guide](../../docs/webmcp.md) before exposing private schedule data.

The example uses `eventTimeDisplay: "agenda"`, so grid summaries stay compact while agenda rows show localized times. Application-owned identifiers use `my-*`; public styling uses documented `--lfc-*` custom properties rather than private package selectors.

Repository-only coverage mechanics and validation commands are documented in the [contributor lane](../README.md#contributors). For reusable contracts, continue with the [integration guide](../../docs/integration-guide.md), [API reference](../../docs/api.md), or [error guide](../../docs/errors.md).
