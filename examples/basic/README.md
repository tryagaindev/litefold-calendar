# Basic example

Run `npm run demo` from the repository root, then choose **Basic JavaScript** from the examples landing page.

The example demonstrates:

- A CSS-container-responsive month view and selected-day agenda, using the default visible time treatment on both surfaces.
- An omitted `initialDate`, which opens and selects the current date from the default clock.
- All-day, timed, and multi-day events generated around the current date from a static `events` array.
- Today, the native month/year jump popover, Previous, Next, default touch/pen/horizontal precision-scroll month paging, day selection, and event activation from the grid or agenda.
- Native link rendering for an event URL, with a synchronous callback that prevents navigation only for this self-contained demo.
- Validated per-event accent markers and a small `--lfc-*` token override.

It intentionally uses no metadata, custom type, generic argument, date bounds, extension, cache, or framework. It imports only the local `dist` output, so the title jump and one-current-range native pager demonstrate package defaults without application code. Pager momentum and snap feel vary with the browser, operating system, and input device.

The example's `data-calendar` and `data-result` attributes are application-owned fixture selectors. They are not package output or public API.

Browse the source: [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css).

Next: use the [API reference](../../docs/api.md) for exact contracts or continue to the [advanced TypeScript example](../advanced/) for application integration patterns.
