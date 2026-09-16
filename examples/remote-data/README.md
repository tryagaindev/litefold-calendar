# Remote data and filtering

A small JavaScript/JSDoc integration between the [basic example](../basic/) and [advanced TypeScript example](../advanced/).

Run from the repository with `npm run demo`, then open `/examples/remote-data/`. The initial date is August 6, 2026, matching the deterministic fixture.

- Change Category to filter the selected month; Sports demonstrates an empty result.
- Activate a day count to open the application's native dialog with every occurrence on that date, or activate an individual event to open it with that event alone. Closing the dialog returns focus.
- Choose an event to record a local selection, or use Refresh events to request the JSON again.
- Inspect the network request to see the inclusive `start`, exclusive `end`, category, and forwarded cancellation signal.

`events.json` is a static public fixture. Its server ignores query parameters; `source.js` validates and filters the downloaded records in the browser. Production endpoints must authorize requests and apply filters on the server. No event is saved by this example. The [remote-data guide](../../docs/remote-data.md) shows the API version and refresh after a real save.

`main.js` owns controls, count presentation, dialogs, focus return, and teardown. `source.js` owns transport and the example's date-only response schema. All calendar integration uses published API surfaces; installed applications replace relative `dist` imports, including JSDoc imports, with `@tryagaindev/litefold-calendar`.

Run `node --test scripts/tests/remote-data-source.test.mjs` for source validation and request-boundary checks. Browser coverage lives in `tests/e2e/remote-data.spec.js`; the repository's example typecheck includes `tsconfig.json`.
