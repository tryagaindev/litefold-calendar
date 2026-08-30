# Advanced TypeScript example

This example is a complete API showcase and a repository coverage fixture. Start with the [basic example](../basic/) if you only need local events and activation, then return here for range loading, typed metadata, render hooks, application controls, or WebMCP.

## Run it

From the repository root:

```sh
npm ci --ignore-scripts
npm run demo
```

Open the printed `/examples/` URL and choose **Exercise the complete API**. `npm run demo` builds the package, compiles [`main.ts`](main.ts) to `main.js`, and starts the local server.

To rebuild only the package and this example after dependencies are installed:

```sh
npm run build:package
npm run build:examples:advanced
```

`main.ts` is the source file. The generated `main.js` is intentionally ignored by Git; do not edit or commit it.

## Read the example in this order

1. [`index.html`](index.html) defines the progressive fallback, application controls, calendar host, state output, and event-details dialog.
2. [`main.ts`](main.ts) adapts application records, implements the range-aware source, defines render hooks and options, then connects the surrounding controls.
3. [`theme.css`](theme.css) maps the public CSS tokens and styles only application-owned hook output.

In the browser, try these paths:

1. Change the target date, then compare **Show its month** with **Select and focus it**. The first demonstrates a `Date` instant projected through `timeZone`; the second passes an exact civil-date string.
2. Toggle event categories. The application changes its own filter state, then calls `refetchEvents()`.
3. Activate an event to inspect typed metadata in the application-owned dialog. From a selected day, press <kbd>F2</kbd> to enter grid-event actions.
4. Compare the default **Immediate array** source with **Controlled PromiseLike**. The immediate result commits without a loading phase; the controlled result remains busy until **Complete pending request** settles it.
5. Choose **Replace event source** to exercise `setEvents()`. It replaces the provider completely; changing **Source timing** restores the original provider with the selected timing.
6. Change theme or text direction and compare the visible output with **Observe state and actions**.

## Patterns worth reusing

- `CalendarEventSource<EventData>` receives the complete inclusive-start/exclusive-end 42-day range and its `AbortSignal`. The controlled fixture rejects aborted work and exposes only its current pending request for completion.
- The application owns filtering and `rawRangeCache`; changing either does not affect the calendar until `refetchEvents()` is called.
- `onStateChange`, the host's public `aria-busy` state, and `dayDidMount` drive the observation panel. Phase history is bounded, and a grid render is counted only after all 42 public day hooks complete.
- Render hooks create same-document nodes. The unified `renderEventOverflow` hook branches on its compact/wide discriminant without measuring the container and replaces visual content only; package CSS keeps compact marker/count content in adaptive, bottom-aligned blocks. `eventDidMount` returns cleanup that is also safe to run when its signal aborts.
- `fallbackElement` keeps useful schedule content available until a usable event snapshot commits.
- The dialog and external live regions remain application-owned; calendar callbacks provide the data and native event context.
- WebMCP is explicitly enabled through `extensions: [webMcp({ toolNamePrefix: "my-schedule" })]`. Review the [first-party extension guide](../../docs/first-party-extensions.md) and [WebMCP guide](../../docs/webmcp.md) before exposing private schedule data.

The example uses `eventTimeDisplay: "agenda"`, so grid summaries stay compact while agenda rows show localized times.

## Coverage-only details

Some code is intentionally exhaustive rather than minimal:

- `CompleteCalendarOptions`, `CompleteCalendarRenderHooks`, and `calendarMethods` make typechecking fail when a new public key lacks example coverage.
- The overflow fixtures exercise source and DOM limits. One provider record sits beyond `maxDate` to show that date bounds do not clip the source's 42-day request.
- `renderEventOverflow` reuses the package-formatted `context.text` for a small compact text treatment, then returns structured application DOM for the wide variant. Each applicable variant is rendered once; when both exist, CSS chooses the visible one as the container crosses the responsive threshold. Resize the compact example to confirm the marker/action and passive count remain in two equal, gap-free block-end grid areas—centered stacked rows throughout supported phone widths, then evenly divided across one row only when both compact-control-size tracks fit near the compact ceiling—while markerless and `maxGridEventsPerDay: 0` fallbacks remain one block/action. The example keeps its compact treatment concise enough for the assigned block, styles only its returned nodes, and does not depend on a private selector or layout token.
- `.my-*`, `#my-*`, `data-my-*`, `--my-*`, and `@layer my.*` are application-owned example identifiers. `data-test-*` attributes are repository-only synchronization and assertion probes.
- `.litefold-calendar` and documented `--lfc-*` custom properties are public package hooks. Consumers should not depend on private `.lfc-*` classes or `data-lfc-*` attributes.
- Repository browser tests supply a controlled WebMCP document fixture; running the example does not require a browser origin trial.

For exact contracts, continue with the [integration guide](../../docs/integration-guide.md), [API reference](../../docs/api.md), or [error guide](../../docs/errors.md).
