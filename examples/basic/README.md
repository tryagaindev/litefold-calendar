# Basic JavaScript example

This is the smallest complete integration: a calendar host, the package stylesheet, a static event array, and an activation callback.

## Run it

From the repository root, run `npm run demo`, then choose **Render static events** from the examples landing page.

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
- A small documented `--lfc-*` CSS-token override in the shared example stylesheet.
- Explicit cleanup with `destroy()` on a non-cached page exit while preserving the instance in the browser's back/forward cache.

The example intentionally avoids providers, metadata, bounds, render hooks, extensions, and framework code. Its unprefixed `data-*` attributes are application-owned selectors, not litefold-calendar output.

Browse the [JavaScript](main.js), [HTML](index.html), and [shared example CSS](../example.css). For exact contracts, continue to the [API reference](../../docs/api.md); for a larger application integration, see [Advanced TypeScript](../advanced/).
