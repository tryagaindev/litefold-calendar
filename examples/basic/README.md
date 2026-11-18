# Basic JavaScript example

This is the smallest complete integration: a calendar host, the package stylesheet, a static event array, and an activation callback.

## Run it

Follow the shared [local run instructions](../README.md#run-locally), then choose **Render static events** from the examples landing page.

Try the following:

1. Select today to open its agenda.
2. Activate **Calendar design review** from the month grid or agenda.
3. Activate **Documentation walkthrough** to see a native event link. The demo prevents navigation so its status message remains visible.
4. Use Today, Previous, Next, or the month title to navigate with the package defaults.

## What the code demonstrates

- Static all-day, timed, and multi-day events generated around the current date.
- An omitted `initialDate`, so the calendar opens on the date supplied by its default clock.
- `onEventActivate` receiving the normalized event, native event, rendered element, and the activating `surface`.
- Optional `url` and `accentColor` event fields.
- The default layout: equal-height week rows with event and overflow content aligned at the top. See [month-grid layout](../../docs/integration-guide.md#choose-month-grid-layout) for the compact sizing rules.
- Automatic short month labels below a `24rem` calendar content width, in both the toolbar and decorative pager. The package's container CSS handles this; the application does not measure the calendar or style private descendants.
- A small documented `--lfc-*` CSS-token override in the shared example stylesheet.
- Application-owned cleanup: this example calls `destroy()` on a non-cached `pagehide`. It preserves the instance when the page enters the browser's back/forward cache. Litefold Calendar does not register that handler automatically.

Because `events` is a static array, `render()` validates the snapshot and completes its single terminal DOM render before returning. This recipe never enters loading state or sets `aria-busy`.

The example intentionally avoids providers, metadata, bounds, render hooks, extensions, and framework code. Its `data-my-*` attributes are application-owned selectors; Litefold Calendar output uses the package namespaces.

The committed fixture imports repository build output through `../../dist/`.
Installed applications should use the package imports in the
[canonical mapping](../README.md#getting-started), not copy that repository-only
path.

Browse the [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css). For exact contracts, continue to the [API reference](../../docs/api.md); for a larger application integration, see [Advanced TypeScript](../advanced/).
